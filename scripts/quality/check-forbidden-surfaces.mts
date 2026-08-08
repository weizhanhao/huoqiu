import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { constants, type Dirent } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

import ts from "typescript";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";
import { parseYaml12 } from "./yaml.mts";

interface ForbiddenSurfaceRule {
  category: string;
  surface: string;
  tokens: readonly string[];
}

export interface ForbiddenSurfaceFinding {
  category: string;
  file: string;
  surface: string;
}

const FORBIDDEN_SURFACES: readonly ForbiddenSurfaceRule[] = [
  {
    category: "personalized-guidance",
    surface: "personalized_target_price",
    tokens: ["personalized", "target", "price"],
  },
  {
    category: "personalized-guidance",
    surface: "personalized_buy",
    tokens: ["personalized", "buy"],
  },
  {
    category: "personalized-guidance",
    surface: "personalized_sell",
    tokens: ["personalized", "sell"],
  },
  {
    category: "personalized-guidance",
    surface: "personalized_position",
    tokens: ["personalized", "position"],
  },
  {
    category: "financial-product",
    surface: "private_fund",
    tokens: ["private", "fund"],
  },
  {
    category: "portfolio-privacy",
    surface: "public_portfolio",
    tokens: ["public", "portfolio"],
  },
  {
    category: "portfolio-privacy",
    surface: "public_portfolio",
    tokens: ["portfolio", "public"],
  },
  {
    category: "portfolio-copying",
    surface: "copy_portfolio",
    tokens: ["copy", "portfolio"],
  },
  {
    category: "execution",
    surface: "real_trade",
    tokens: ["real", "trade"],
  },
  {
    category: "account-command",
    surface: "open_account",
    tokens: ["open", "account"],
  },
  {
    category: "automated-advice",
    surface: "ai_advice",
    tokens: ["ai", "advice"],
  },
  {
    category: "target-price",
    surface: "target_price",
    tokens: ["target", "price"],
  },
  {
    category: "notification-transport",
    surface: "apns",
    tokens: ["apns"],
  },
  {
    category: "notification-transport",
    surface: "apns",
    tokens: ["ap", "ns"],
  },
  {
    category: "notification-capability",
    surface: "push",
    tokens: ["push"],
  },
  {
    category: "product-command",
    surface: "subscription",
    tokens: ["subscription"],
  },
  {
    category: "product-command",
    surface: "subscription",
    tokens: ["subscribe"],
  },
  {
    category: "product-command",
    surface: "subscription",
    tokens: ["fund", "subscribe"],
  },
  {
    category: "product-command",
    surface: "redemption",
    tokens: ["redemption"],
  },
  {
    category: "product-command",
    surface: "redemption",
    tokens: ["redeem"],
  },
  {
    category: "product-command",
    surface: "redemption",
    tokens: ["redeem", "fund"],
  },
  { category: "execution", surface: "trade", tokens: ["trade"] },
] as const;

const ROOT_EXCLUDED_SEGMENTS = new Set([
  ".cache",
  ".next",
  ".turbo",
  "build",
  "cache",
  "coverage",
  "dist",
  "docs",
  "evidence",
  "node_modules",
  "out",
  "playwright-report",
  "quality",
  "scripts",
  "test",
  "test-results",
  "tests",
]);
const PROJECT_EXCLUDED_SEGMENTS = new Set([
  ".cache",
  ".next",
  ".turbo",
  "__tests__",
  "build",
  "coverage",
  "dist",
  "doc",
  "docs",
  "node_modules",
  "out",
  "test",
  "test-results",
  "tests",
]);

const STRUCTURED_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const ROUTE_EXTENSIONS = new Set([
  ...STRUCTURED_EXTENSIONS,
  ...SOURCE_EXTENSIONS,
]);

const runtimeRegistryName =
  /(?:^|[._+-])(card|cards|channel|channels|deep[-_]?link|deeplink|linking|navigation|navigator|openapi|registr(?:y|ies)|route|router|routes)(?:[._+-]|$)/i;

const fail = (code: string, detail: string): never => {
  throw new QualityGateError(code, detail);
};

const normalizedRepositoryPath = (root: string, path: string): string => {
  const normalized = relative(root, path).split(sep).join("/");
  if (
    normalized.length === 0 ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    fail("RUNTIME_CANDIDATE_TRAVERSAL", path);
  }
  return normalized;
};

const splitPath = (path: string): string[] => path.toLowerCase().split("/");

const isExcluded = (path: string): boolean => {
  const parts = splitPath(path);
  if (ROOT_EXCLUDED_SEGMENTS.has(parts[0] ?? "")) return true;
  if (
    (parts[0] === "apps" || parts[0] === "packages") &&
    PROJECT_EXCLUDED_SEGMENTS.has(parts[2] ?? "")
  )
    return true;
  const fixtureIndex =
    (parts[0] === "apps" || parts[0] === "packages") &&
    (parts[2] === "fixture" || parts[2] === "fixtures")
      ? 2
      : -1;
  return (
    fixtureIndex >= 0 &&
    parts[fixtureIndex + 1] !== undefined &&
    parts[fixtureIndex + 1] !== "positive"
  );
};

const hasRuntimeRegistryName = (path: string): boolean =>
  splitPath(path).some((part) => runtimeRegistryName.test(part));

const isPositiveRuntimeFixture = (path: string): boolean => {
  const parts = splitPath(path);
  return parts.some(
    (part, index) =>
      (part === "fixture" || part === "fixtures") &&
      parts[index + 1] === "positive",
  );
};

const isRouteSource = (path: string): boolean => {
  const parts = splitPath(path);
  if (parts[0] !== "apps" || parts.length < 3) return false;
  return (
    parts[2] === "app" ||
    parts[2] === "pages" ||
    (parts[2] === "src" && parts[3] === "app") ||
    (parts[2] === "src" && parts[3] === "pages") ||
    (parts[2] === "src" && parts.includes("routes")) ||
    (parts[2] === "src" && parts.at(-1)?.includes(".controller.") === true)
  );
};

const isNestApplicationSource = (path: string): boolean => {
  const parts = splitPath(path);
  return (
    parts[0] === "apps" &&
    parts[1] === "api" &&
    parts[2] === "src" &&
    SOURCE_EXTENSIONS.has(extname(path).toLowerCase())
  );
};

const isDomainRegistry = (path: string): boolean => {
  const parts = splitPath(path);
  return (
    parts[0] === "packages" &&
    parts[2] === "src" &&
    (parts[1] === "domain" || parts[1] === "contracts") &&
    hasRuntimeRegistryName(path)
  );
};

const isRuntimeCandidate = (path: string): boolean => {
  if (isExcluded(path)) return false;
  if (isPositiveRuntimeFixture(path)) return true;
  if (hasRuntimeRegistryName(path)) return true;
  if (isDomainRegistry(path)) return true;
  if (isNestApplicationSource(path)) return true;
  return (
    isRouteSource(path) && ROUTE_EXTENSIONS.has(extname(path).toLowerCase())
  );
};

const tokenize = (value: string): string[] =>
  value
    .normalize("NFKC")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z\d]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

const containsSequence = (
  tokens: readonly string[],
  sequence: readonly string[],
): boolean => {
  if (sequence.length === 0 || sequence.length > tokens.length) return false;
  return tokens.some((_, start) =>
    sequence.every((token, offset) => tokens[start + offset] === token),
  );
};

const collectJsonStrings = (value: unknown, output: string[]): void => {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, output);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      output.push(key);
      collectJsonStrings(item, output);
    }
  }
};

const parseSourceFile = (file: string, content: string): ts.SourceFile => {
  const scriptKind = [".tsx", ".jsx"].includes(extname(file).toLowerCase())
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.ES2023,
    true,
    scriptKind,
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  const error = diagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (error !== undefined)
    fail(
      "RUNTIME_CANDIDATE_MALFORMED",
      `${file}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
    );
  return sourceFile;
};

const sourceSurfaces = (file: string, content: string): string[] => {
  const sourceFile = parseSourceFile(file, content);
  const constants = new Map<string, ts.Expression>();
  const surfaces = new Set<string>();
  const evaluating = new Set<string>();

  const evaluate = (expression: ts.Expression): string | undefined => {
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    )
      return evaluate(expression.expression);
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = evaluate(expression.left);
      const right = evaluate(expression.right);
      return left === undefined || right === undefined
        ? undefined
        : `${left}${right}`;
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        const substitution = evaluate(span.expression);
        if (substitution === undefined) return undefined;
        value += substitution + span.literal.text;
      }
      return value;
    }
    if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === "join" &&
      ts.isArrayLiteralExpression(expression.expression.expression) &&
      expression.arguments.length <= 1
    ) {
      const separatorExpression = expression.arguments[0];
      const separator =
        separatorExpression === undefined ? "," : evaluate(separatorExpression);
      if (separator === undefined) return undefined;
      const values = expression.expression.expression.elements.map((element) =>
        ts.isSpreadElement(element) ? undefined : evaluate(element),
      );
      return values.some((value) => value === undefined)
        ? undefined
        : (values as string[]).join(separator);
    }
    if (ts.isIdentifier(expression)) {
      if (evaluating.has(expression.text)) return undefined;
      const initializer = constants.get(expression.text);
      if (initializer === undefined) return undefined;
      evaluating.add(expression.text);
      const value = evaluate(initializer);
      evaluating.delete(expression.text);
      return value;
    }
    return undefined;
  };

  const indexConstants = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    )
      constants.set(node.name.text, node.initializer);
    ts.forEachChild(node, indexConstants);
  };
  indexConstants(sourceFile);

  const runtimeField = (name: ts.BindingName | ts.PropertyName): boolean => {
    const value =
      ts.isIdentifier(name) || ts.isStringLiteralLike(name)
        ? name.text
        : undefined;
    return (
      value !== undefined &&
      /^(?:command|deep[-_]?link|deeplink|href|path|pathname|route|surface)$/i.test(
        value,
      )
    );
  };

  const runtimeContainerField = (
    name: ts.BindingName | ts.PropertyName,
  ): boolean => {
    const value =
      ts.isIdentifier(name) || ts.isStringLiteralLike(name)
        ? name.text
        : undefined;
    return (
      value !== undefined &&
      /^(?:commands|deep[-_]?links|deeplinks|hrefs|paths|pathnames|routes|surfaces)$/i.test(
        value,
      )
    );
  };

  const staticRegistryIdentifiers = new Set<string>();
  const isStaticRegistryValue = (expression: ts.Expression): boolean => {
    if (evaluate(expression) !== undefined) return true;
    if (
      ts.isNumericLiteral(expression) ||
      expression.kind === ts.SyntaxKind.TrueKeyword ||
      expression.kind === ts.SyntaxKind.FalseKeyword ||
      expression.kind === ts.SyntaxKind.NullKeyword
    )
      return true;
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    )
      return isStaticRegistryValue(expression.expression);
    if (ts.isArrayLiteralExpression(expression))
      return expression.elements.every(
        (element) =>
          !ts.isSpreadElement(element) && isStaticRegistryValue(element),
      );
    if (ts.isObjectLiteralExpression(expression))
      return expression.properties.every((property) => {
        if (ts.isPropertyAssignment(property))
          return isStaticRegistryValue(property.initializer);
        if (ts.isShorthandPropertyAssignment(property)) {
          const initializer = constants.get(property.name.text);
          return (
            initializer !== undefined && isStaticRegistryValue(initializer)
          );
        }
        return false;
      });
    if (ts.isIdentifier(expression)) {
      if (staticRegistryIdentifiers.has(expression.text)) return false;
      const initializer = constants.get(expression.text);
      if (initializer === undefined) return false;
      staticRegistryIdentifiers.add(expression.text);
      const result = isStaticRegistryValue(initializer);
      staticRegistryIdentifiers.delete(expression.text);
      return result;
    }
    return false;
  };

  const routeDecorator = (expression: ts.LeftHandSideExpression): boolean => {
    const name = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : undefined;
    return (
      name !== undefined &&
      /^(?:All|Controller|Delete|Get|Head|Options|Patch|Post|Put|Sse)$/.test(
        name,
      )
    );
  };

  const requireStatic = (expression: ts.Expression, label: string): void => {
    if (evaluate(expression) === undefined)
      fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: ${label} is not statically decidable`,
      );
  };

  const requireStaticRegistry = (
    expression: ts.Expression,
    label: string,
  ): void => {
    if (!isStaticRegistryValue(expression))
      fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: ${label} is not statically decidable`,
      );
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      runtimeField(node.name) &&
      node.initializer !== undefined
    )
      requireStatic(node.initializer, node.name.getText(sourceFile));
    if (
      ts.isVariableDeclaration(node) &&
      runtimeContainerField(node.name) &&
      node.initializer !== undefined
    )
      requireStaticRegistry(node.initializer, node.name.getText(sourceFile));
    if (ts.isPropertyAssignment(node) && runtimeField(node.name))
      requireStatic(node.initializer, node.name.getText(sourceFile));
    if (ts.isPropertyAssignment(node) && runtimeContainerField(node.name))
      requireStaticRegistry(node.initializer, node.name.getText(sourceFile));
    if (
      ts.isCallExpression(node) &&
      ts.isDecorator(node.parent) &&
      routeDecorator(node.expression)
    )
      for (const [index, argument] of node.arguments.entries())
        requireStatic(argument, `decorator argument ${index}`);
    if (ts.isIdentifier(node)) surfaces.add(node.text);
    if (ts.isStringLiteralLike(node)) surfaces.add(node.text);
    if (ts.isExpression(node)) {
      const value = evaluate(node);
      if (value !== undefined) surfaces.add(value);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...surfaces];
};

const contentSurfaces = (file: string, content: string): string[] => {
  const extension = extname(file).toLowerCase();
  if (extension === ".json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid JSON";
      return fail("RUNTIME_CANDIDATE_MALFORMED", `${file}: ${detail}`);
    }
    parseYaml12(content, "RUNTIME_CANDIDATE_MALFORMED", file);
    const strings: string[] = [];
    collectJsonStrings(parsed, strings);
    return strings;
  }
  if (extension === ".yaml" || extension === ".yml") {
    const parsed = parseYaml12(content, "RUNTIME_CANDIDATE_MALFORMED", file);
    const strings: string[] = [];
    collectJsonStrings(parsed, strings);
    return strings;
  }
  if (SOURCE_EXTENSIONS.has(extension)) return sourceSurfaces(file, content);
  return fail("RUNTIME_CANDIDATE_UNSUPPORTED", file);
};

const findingsFor = (
  file: string,
  surfaces: readonly string[],
): ForbiddenSurfaceFinding[] => {
  const findings = new Map<string, ForbiddenSurfaceFinding>();
  for (const value of [file, ...surfaces]) {
    const tokens = tokenize(value);
    for (const rule of FORBIDDEN_SURFACES) {
      if (!containsSequence(tokens, rule.tokens)) continue;
      const key = `${rule.surface}:${rule.category}`;
      findings.set(key, {
        category: rule.category,
        file,
        surface: rule.surface,
      });
    }
  }
  return [...findings.values()];
};

const discoverRuntimeCandidates = async (root: string): Promise<string[]> => {
  const candidates: string[] = [];

  const visit = async (absolutePath: string): Promise<void> => {
    const repositoryPath = normalizedRepositoryPath(root, absolutePath);
    if (isExcluded(repositoryPath)) return;

    let entries: Dirent[];
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "unreadable directory";
      return fail(
        "RUNTIME_CANDIDATE_UNREADABLE",
        `${repositoryPath}: ${detail}`,
      );
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = resolve(absolutePath, entry.name);
      const childPath = normalizedRepositoryPath(root, child);
      if (entry.isSymbolicLink()) fail("RUNTIME_CANDIDATE_SYMLINK", childPath);
      if (isExcluded(childPath)) continue;
      if (entry.isDirectory()) {
        await visit(child);
        continue;
      }
      if (entry.isFile() && isRuntimeCandidate(childPath))
        candidates.push(child);
    }
  };

  for (const sourceRoot of ["apps", "packages"]) {
    const absolutePath = resolve(root, sourceRoot);
    try {
      const status = await lstat(absolutePath);
      if (status.isSymbolicLink())
        fail("RUNTIME_CANDIDATE_SYMLINK", sourceRoot);
      if (!status.isDirectory())
        fail("RUNTIME_CANDIDATE_UNREADABLE", `${sourceRoot}: not a directory`);
      await visit(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return candidates;
};

export const scanForbiddenSurfaces = async (
  repositoryRoot = process.cwd(),
): Promise<ForbiddenSurfaceFinding[]> => {
  if (repositoryRoot.replaceAll("\\", "/").split("/").includes(".."))
    fail("RUNTIME_CANDIDATE_TRAVERSAL", repositoryRoot);
  const root = resolve(repositoryRoot);
  let status: Awaited<ReturnType<typeof lstat>>;
  try {
    status = await lstat(root);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unreadable repository root";
    return fail("RUNTIME_CANDIDATE_UNREADABLE", detail);
  }
  if (status.isSymbolicLink()) fail("RUNTIME_CANDIDATE_SYMLINK", root);
  if (!status.isDirectory())
    fail("RUNTIME_CANDIDATE_UNREADABLE", `${root}: not a directory`);
  const canonicalRoot = await realpath(root);
  if (canonicalRoot !== root)
    fail("RUNTIME_CANDIDATE_TRAVERSAL", repositoryRoot);

  const candidates = await discoverRuntimeCandidates(root);
  if (candidates.length === 0)
    fail(
      "RUNTIME_CANDIDATES_MISSING",
      "no approved runtime registry candidates found",
    );

  const findings: ForbiddenSurfaceFinding[] = [];
  for (const candidate of candidates) {
    const file = normalizedRepositoryPath(root, candidate);
    let canonicalCandidate: string;
    try {
      await access(candidate, constants.R_OK);
      canonicalCandidate = await realpath(candidate);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unreadable file";
      return fail("RUNTIME_CANDIDATE_UNREADABLE", `${file}: ${detail}`);
    }
    normalizedRepositoryPath(root, canonicalCandidate);

    let content: string;
    try {
      content = await readFile(candidate, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unreadable file";
      return fail("RUNTIME_CANDIDATE_UNREADABLE", `${file}: ${detail}`);
    }
    findings.push(...findingsFor(file, contentSurfaces(file, content)));
  }
  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.surface.localeCompare(right.surface),
  );
};

export const assertNoForbiddenSurfaces = async (
  repositoryRoot = process.cwd(),
): Promise<void> => {
  const findings = await scanForbiddenSurfaces(repositoryRoot);
  if (findings.length === 0) return;
  fail(
    "FORBIDDEN_RUNTIME_SURFACE",
    findings
      .map(
        (finding) =>
          `file=${finding.file} surface=${finding.surface} category=${finding.category}`,
      )
      .join("; "),
  );
};

export const main = async (args = process.argv.slice(2)): Promise<void> => {
  if (args.length > 0)
    fail(
      "CLI_ARGUMENT_INVALID",
      "check-forbidden-surfaces accepts no arguments",
    );
  await assertNoForbiddenSurfaces(process.cwd());
};

if (isMainModule(import.meta.url)) await runCli(main);
