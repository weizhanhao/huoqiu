import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { constants, type Dirent } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

import ts from "typescript";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

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
    surface: "redemption",
    tokens: ["redemption"],
  },
  { category: "execution", surface: "trade", tokens: ["trade"] },
] as const;

const EXCLUDED_SEGMENTS = new Set([
  ".cache",
  ".next",
  ".turbo",
  "__tests__",
  "build",
  "cache",
  "coverage",
  "dist",
  "doc",
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
  if (parts.some((part) => EXCLUDED_SEGMENTS.has(part))) return true;
  const fixtureIndex = parts.findIndex(
    (part) => part === "fixture" || part === "fixtures",
  );
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
  if (parts[0] !== "apps" || parts.length < 4) return false;
  const sourceOffset = parts[2] === "src" ? 3 : 2;
  return parts[sourceOffset] === "app";
};

const isRuntimeCandidate = (path: string): boolean => {
  if (isExcluded(path)) return false;
  if (isPositiveRuntimeFixture(path)) return true;
  if (hasRuntimeRegistryName(path)) return true;
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

const validateYaml = (content: string, file: string): void => {
  if (content.includes("\0") || content.includes("\t")) {
    fail(
      "RUNTIME_CANDIDATE_MALFORMED",
      `${file}: invalid YAML control character`,
    );
  }
  const delimiters: string[] = [];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of content) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      if (quote === character) quote = undefined;
      else if (quote === undefined) quote = character;
      continue;
    }
    if (quote !== undefined) continue;
    if (character === "[" || character === "{") delimiters.push(character);
    if (character === "]" || character === "}") {
      const opening = delimiters.pop();
      if (
        (character === "]" && opening !== "[") ||
        (character === "}" && opening !== "{")
      ) {
        fail(
          "RUNTIME_CANDIDATE_MALFORMED",
          `${file}: unbalanced YAML flow value`,
        );
      }
    }
  }
  if (quote !== undefined || delimiters.length > 0) {
    fail("RUNTIME_CANDIDATE_MALFORMED", `${file}: unterminated YAML value`);
  }
};

const contentSurfaces = (file: string, content: string): string[] => {
  const extension = extname(file).toLowerCase();
  if (extension === ".json") {
    try {
      const parsed = JSON.parse(content) as unknown;
      const strings: string[] = [];
      collectJsonStrings(parsed, strings);
      return strings;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid JSON";
      return fail("RUNTIME_CANDIDATE_MALFORMED", `${file}: ${detail}`);
    }
  }
  if (extension === ".yaml" || extension === ".yml") {
    validateYaml(content, file);
    return [content];
  }
  if (SOURCE_EXTENSIONS.has(extension)) {
    const result = ts.transpileModule(content, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2023,
      },
      fileName: file,
      reportDiagnostics: true,
    });
    const parseErrors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (parseErrors.length > 0) {
      fail(
        "RUNTIME_CANDIDATE_MALFORMED",
        `${file}: ${ts.flattenDiagnosticMessageText(parseErrors[0]?.messageText ?? "syntax error", " ")}`,
      );
    }
    return [content];
  }
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
      if (isExcluded(childPath)) continue;
      if (entry.isSymbolicLink()) fail("RUNTIME_CANDIDATE_SYMLINK", childPath);
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
