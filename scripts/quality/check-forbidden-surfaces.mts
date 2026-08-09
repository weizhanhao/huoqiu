import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { constants, type Dirent } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

import ts from "typescript";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";
import { parseYaml12 } from "./yaml.mts";

interface ForbiddenSurfaceRule {
  category: string;
  exact?: boolean;
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
  {
    category: "payment",
    exact: true,
    surface: "payment",
    tokens: ["payment"],
  },
  {
    category: "payment",
    surface: "payment_checkout",
    tokens: ["payment", "checkout"],
  },
  {
    category: "payment",
    surface: "payment_intent",
    tokens: ["payment", "intent"],
  },
  {
    category: "payment",
    surface: "payment_method",
    tokens: ["payment", "method"],
  },
  {
    category: "account-eligibility",
    surface: "account_eligibility",
    tokens: ["account", "eligibility"],
  },
  {
    category: "account-eligibility",
    surface: "investor_suitability",
    tokens: ["investor", "suitability"],
  },
  {
    category: "account-eligibility",
    surface: "brokerage_eligibility",
    tokens: ["brokerage", "eligibility"],
  },
  {
    category: "unauthorized-data-import",
    surface: "data_import",
    tokens: ["data", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "brokerage_data_import",
    tokens: ["brokerage", "data", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "account_data_import",
    tokens: ["account", "data", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "portfolio_import",
    tokens: ["portfolio", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "holdings_import",
    tokens: ["holdings", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "positions_import",
    tokens: ["positions", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "transaction_import",
    tokens: ["transaction", "import"],
  },
  {
    category: "unauthorized-data-import",
    surface: "broker_sync",
    tokens: ["broker", "sync"],
  },
  {
    category: "unauthorized-data-import",
    surface: "brokerage_sync",
    tokens: ["brokerage", "sync"],
  },
  {
    category: "unauthorized-data-import",
    surface: "portfolio_sync",
    tokens: ["portfolio", "sync"],
  },
  {
    category: "paid-advice",
    surface: "paid_advice",
    tokens: ["paid", "advice"],
  },
  {
    category: "paid-advice",
    surface: "premium_advice",
    tokens: ["premium", "advice"],
  },
  {
    category: "paid-advice",
    surface: "paid_recommendation",
    tokens: ["paid", "recommendation"],
  },
  {
    category: "paid-advice",
    surface: "paid_stock_recommendation",
    tokens: ["paid", "stock", "recommendation"],
  },
  {
    category: "paid-advice",
    surface: "premium_stock_recommendation",
    tokens: ["premium", "stock", "recommendation"],
  },
  {
    category: "execution",
    surface: "place_order",
    tokens: ["place", "order"],
  },
  {
    category: "execution",
    surface: "submit_order",
    tokens: ["submit", "order"],
  },
  {
    category: "execution",
    surface: "execute_order",
    tokens: ["execute", "order"],
  },
  {
    category: "execution",
    surface: "buy_order",
    tokens: ["buy", "order"],
  },
  {
    category: "execution",
    surface: "sell_order",
    tokens: ["sell", "order"],
  },
  {
    category: "execution",
    surface: "brokerage_connection",
    tokens: ["brokerage", "connection"],
  },
  {
    category: "execution",
    surface: "trading_account",
    tokens: ["trading", "account"],
  },
  {
    category: "execution",
    exact: true,
    surface: "trading",
    tokens: ["trading"],
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
  ".cts",
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
const NEST_ROUTE_DECORATOR =
  /^(?:All|Controller|Delete|Get|Head|Options|Patch|Post|Put|Sse)$/;

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
  if (parts[0] === "scripts" && parts[1] === "quality") return true;
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

const isStaticSurfaceRegistry = (path: string): boolean => {
  const parts = splitPath(path);
  const hasRegistry = parts.some((part) =>
    /(?:^|[._+-])registr(?:y|ies)(?:[._+-]|$)/i.test(part),
  );
  const hasSurfaceContext = parts.some((part) =>
    /(?:^|[._+-])(?:card|cards|channel|channels|deep[-_]?link|deeplink|linking|navigation|navigator|openapi|route|router|routes)(?:[._+-]|$)/i.test(
      part,
    ),
  );
  const hasStandaloneRegistry = parts.some((part) =>
    /^registr(?:y|ies)(?:\.[^.]+)?$/i.test(part),
  );
  const isClientApplicationRegistry =
    parts[0] === "apps" &&
    parts[1] !== undefined &&
    parts[1] !== "api" &&
    hasRegistry;
  return (
    isDomainRegistry(path) ||
    hasStandaloneRegistry ||
    (hasRegistry && hasSurfaceContext) ||
    isClientApplicationRegistry
  );
};

const isRuntimeCandidate = (path: string): boolean => {
  if (isExcluded(path)) return false;
  if (isPositiveRuntimeFixture(path)) return true;
  const parts = splitPath(path);
  const extension = extname(path).toLowerCase();
  const isSupportedRuntimeRoot =
    parts.length === 1 ||
    parts[0] === "apps" ||
    parts[0] === "packages" ||
    parts[0] === "src" ||
    parts[0] === "scripts" ||
    parts[0] === "config";
  if (isSupportedRuntimeRoot && SOURCE_EXTENSIONS.has(extension)) return true;
  if (
    (parts[0] === "config" || hasRuntimeRegistryName(path)) &&
    STRUCTURED_EXTENSIONS.has(extension)
  )
    return true;
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
    .replaceAll("交易下单", " place order ")
    .replaceAll("真实交易", " real trade ")
    .replaceAll("付费荐股", " paid stock recommendation ")
    .replaceAll("付费投顾", " paid advice ")
    .replaceAll("持仓导入", " holdings import ")
    .replaceAll("数据导入", " data import ")
    .replaceAll("账户资格", " account eligibility ")
    .replaceAll("开户资格", " account eligibility ")
    .replaceAll("支付", " payment ")
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

const semanticSurfaceField = (value: string): boolean =>
  /^(?:command|commands|deep[-_]?links?|deeplinks?|hrefs?|paths?|pathnames?|registr(?:y|ies)|routes?|surfaces?)$/i.test(
    value,
  );

const collectJsonStrings = (
  value: unknown,
  output: string[],
  inSurfaceContext: boolean,
): void => {
  if (typeof value === "string") {
    if (inSurfaceContext) output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      collectJsonStrings(item, output, inSurfaceContext);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      const childSurfaceContext = inSurfaceContext || semanticSurfaceField(key);
      if (childSurfaceContext) output.push(key);
      collectJsonStrings(item, output, childSurfaceContext);
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
  const topLevelConstants = new Map<string, ts.Expression>();
  const topLevelFunctions = new Map<string, ts.FunctionDeclaration>();
  const nestRouteDecoratorAliases = new Set<string>();
  const nestNamespaces = new Set<string>();
  const surfaces = new Set<string>();
  const evaluating = new Set<string>();

  const evaluate = (
    expression: ts.Expression,
    bindings: ReadonlyMap<string, ts.Expression> = constants,
    active: Set<string> = evaluating,
  ): string | undefined => {
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    )
      return evaluate(expression.expression, bindings, active);
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = evaluate(expression.left, bindings, active);
      const right = evaluate(expression.right, bindings, active);
      return left === undefined || right === undefined
        ? undefined
        : `${left}${right}`;
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        const substitution = evaluate(span.expression, bindings, active);
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
        separatorExpression === undefined
          ? ","
          : evaluate(separatorExpression, bindings, active);
      if (separator === undefined) return undefined;
      const values = expression.expression.expression.elements.map((element) =>
        ts.isSpreadElement(element)
          ? undefined
          : evaluate(element, bindings, active),
      );
      return values.some((value) => value === undefined)
        ? undefined
        : (values as string[]).join(separator);
    }
    if (ts.isIdentifier(expression)) {
      if (active.has(expression.text)) return undefined;
      const initializer = bindings.get(expression.text);
      if (initializer === undefined) return undefined;
      active.add(expression.text);
      const value = evaluate(initializer, bindings, active);
      active.delete(expression.text);
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

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      topLevelFunctions.set(statement.name.text, statement);
      continue;
    }
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    )
      continue;
    for (const declaration of statement.declarationList.declarations)
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined
      )
        topLevelConstants.set(declaration.name.text, declaration.initializer);
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(statement.moduleReference.expression) &&
      statement.moduleReference.expression.text === "@nestjs/common"
    ) {
      nestNamespaces.add(statement.name.text);
      continue;
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@nestjs/common"
    )
      continue;
    const importClause = statement.importClause;
    if (importClause?.isTypeOnly === true) continue;
    const bindings = importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      nestNamespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const imported = (element.propertyName ?? element.name).text;
      if (NEST_ROUTE_DECORATOR.test(imported))
        nestRouteDecoratorAliases.add(element.name.text);
    }
  }

  const unwrapExpression = (expression: ts.Expression): ts.Expression => {
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    )
      return unwrapExpression(expression.expression);
    return expression;
  };

  const isNestNamespaceReference = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    return ts.isIdentifier(value) && nestNamespaces.has(value.text);
  };

  const isNestRequire = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (
      !ts.isCallExpression(value) ||
      !ts.isIdentifier(value.expression) ||
      value.expression.text !== "require" ||
      value.arguments.length !== 1
    )
      return false;
    const specifier = value.arguments[0];
    return (
      specifier !== undefined &&
      evaluate(specifier, topLevelConstants) === "@nestjs/common"
    );
  };

  const isNestNamespaceExpression = (expression: ts.Expression): boolean =>
    isNestNamespaceReference(expression) || isNestRequire(expression);

  const nestDecoratorReference = (
    expression: ts.Expression,
  ): string | undefined => {
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value))
      return nestRouteDecoratorAliases.has(value.text) ? value.text : undefined;
    if (ts.isPropertyAccessExpression(value))
      return isNestNamespaceExpression(value.expression) &&
        NEST_ROUTE_DECORATOR.test(value.name.text)
        ? value.name.text
        : undefined;
    if (
      ts.isElementAccessExpression(value) &&
      isNestNamespaceExpression(value.expression) &&
      value.argumentExpression !== undefined
    ) {
      const name = evaluate(value.argumentExpression, topLevelConstants);
      return name !== undefined && NEST_ROUTE_DECORATOR.test(name)
        ? name
        : undefined;
    }
    return undefined;
  };

  let discoveredNestAlias: boolean;
  do {
    discoveredNestAlias = false;
    const visitAliases = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
        if (ts.isIdentifier(node.name)) {
          if (
            isNestNamespaceExpression(node.initializer) &&
            !nestNamespaces.has(node.name.text)
          ) {
            nestNamespaces.add(node.name.text);
            discoveredNestAlias = true;
          }
          if (
            nestDecoratorReference(node.initializer) !== undefined &&
            !nestRouteDecoratorAliases.has(node.name.text)
          ) {
            nestRouteDecoratorAliases.add(node.name.text);
            discoveredNestAlias = true;
          }
        } else if (
          ts.isObjectBindingPattern(node.name) &&
          isNestNamespaceExpression(node.initializer)
        ) {
          for (const element of node.name.elements) {
            if (
              element.dotDotDotToken !== undefined ||
              !ts.isIdentifier(element.name)
            )
              continue;
            const imported = element.propertyName ?? element.name;
            const importedName =
              ts.isIdentifier(imported) || ts.isStringLiteralLike(imported)
                ? imported.text
                : ts.isComputedPropertyName(imported)
                  ? evaluate(imported.expression, topLevelConstants)
                  : undefined;
            if (
              ts.isComputedPropertyName(imported) &&
              importedName === undefined
            )
              fail(
                "RUNTIME_CANDIDATE_UNRESOLVED",
                `${file}: computed Nest decorator alias is not statically decidable`,
              );
            if (
              importedName !== undefined &&
              NEST_ROUTE_DECORATOR.test(importedName) &&
              !nestRouteDecoratorAliases.has(element.name.text)
            ) {
              nestRouteDecoratorAliases.add(element.name.text);
              discoveredNestAlias = true;
            }
          }
        }
      }
      ts.forEachChild(node, visitAliases);
    };
    visitAliases(sourceFile);
  } while (discoveredNestAlias);

  const runtimeField = (name: ts.BindingName | ts.PropertyName): boolean => {
    const value =
      ts.isIdentifier(name) || ts.isStringLiteralLike(name)
        ? name.text
        : undefined;
    return (
      value !== undefined &&
      /^(?:command|deep[-_]?link|deeplink|href|path|pathname|route)$/i.test(
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
      /^(?:commands|deep[-_]?links|deeplinks|hrefs|paths|pathnames|routes)$/i.test(
        value,
      )
    );
  };

  const runtimeSemanticName = (value: string): boolean =>
    /^(?:(?:card|channel|deep[-_]?link|navigation|route|runtime|surface)[-_]?)?registr(?:y|ies)$/i.test(
      value,
    ) || /^(?:commands?|deep[-_]?links?|deeplinks?|routes?)$/i.test(value);

  const runtimeImportedBindings = new Set<string>();
  const moduleHasRuntimeRegistrySemantics = (specifier: string): boolean =>
    specifier.split(/[\\/]/).some((part) => runtimeRegistryName.test(part));
  const recordImportedBinding = (
    localName: string,
    importedName: string | undefined,
    moduleSpecifier: string,
  ): void => {
    if (
      runtimeSemanticName(localName) ||
      (importedName !== undefined && runtimeSemanticName(importedName)) ||
      moduleHasRuntimeRegistrySemantics(moduleSpecifier)
    )
      runtimeImportedBindings.add(localName);
  };
  const staticPropertyName = (
    name: ts.PropertyName | ts.BindingName,
  ): string | undefined => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
    if (ts.isComputedPropertyName(name))
      return evaluate(name.expression, topLevelConstants);
    return undefined;
  };
  const recordRequireBinding = (declaration: ts.VariableDeclaration): void => {
    const initializer = declaration.initializer;
    if (initializer === undefined) return;
    const value = unwrapExpression(initializer);
    const requiredCall = ts.isCallExpression(value)
      ? value
      : ts.isPropertyAccessExpression(value) ||
          ts.isElementAccessExpression(value)
        ? unwrapExpression(value.expression)
        : undefined;
    if (
      requiredCall === undefined ||
      !ts.isCallExpression(requiredCall) ||
      !ts.isIdentifier(requiredCall.expression) ||
      requiredCall.expression.text !== "require"
    )
      return;
    const argument = requiredCall.arguments[0];
    const specifier =
      argument === undefined
        ? undefined
        : evaluate(argument, topLevelConstants);
    if (specifier === undefined) return;
    if (ts.isIdentifier(declaration.name)) {
      let importedName: string | undefined;
      if (ts.isPropertyAccessExpression(value)) importedName = value.name.text;
      else if (
        ts.isElementAccessExpression(value) &&
        value.argumentExpression !== undefined
      )
        importedName = evaluate(value.argumentExpression, topLevelConstants);
      recordImportedBinding(declaration.name.text, importedName, specifier);
      return;
    }
    if (!ts.isObjectBindingPattern(declaration.name)) return;
    for (const element of declaration.name.elements) {
      if (
        element.dotDotDotToken !== undefined ||
        !ts.isIdentifier(element.name)
      )
        continue;
      const importedName = staticPropertyName(
        element.propertyName ?? element.name,
      );
      recordImportedBinding(element.name.text, importedName, specifier);
    }
  };
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const moduleSpecifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.isTypeOnly === true) continue;
      if (clause?.name !== undefined)
        recordImportedBinding(clause.name.text, "default", moduleSpecifier);
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings))
        recordImportedBinding(bindings.name.text, undefined, moduleSpecifier);
      else if (bindings !== undefined)
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          recordImportedBinding(
            element.name.text,
            (element.propertyName ?? element.name).text,
            moduleSpecifier,
          );
        }
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression !== undefined
    ) {
      const moduleSpecifier = evaluate(
        statement.moduleReference.expression,
        topLevelConstants,
      );
      if (moduleSpecifier !== undefined)
        recordImportedBinding(statement.name.text, undefined, moduleSpecifier);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      recordRequireBinding(declaration);
  }

  const memberName = (expression: ts.Expression): string | undefined => {
    const value = unwrapExpression(expression);
    if (ts.isPropertyAccessExpression(value)) return value.name.text;
    if (
      ts.isElementAccessExpression(value) &&
      value.argumentExpression !== undefined
    )
      return evaluate(value.argumentExpression, topLevelConstants);
    return undefined;
  };
  const runtimeRegistryAliases = new Set(runtimeImportedBindings);
  const isRuntimeRegistryReference = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value))
      return (
        runtimeRegistryAliases.has(value.text) ||
        runtimeSemanticName(value.text)
      );
    if (
      ts.isPropertyAccessExpression(value) ||
      ts.isElementAccessExpression(value)
    ) {
      const name = memberName(value);
      return (
        (name !== undefined && runtimeSemanticName(name)) ||
        isRuntimeRegistryReference(value.expression)
      );
    }
    return false;
  };
  let discoveredRuntimeRegistryAlias: boolean;
  do {
    discoveredRuntimeRegistryAlias = false;
    const visitRuntimeAliases = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
        if (
          ts.isIdentifier(node.name) &&
          isRuntimeRegistryReference(node.initializer) &&
          !runtimeRegistryAliases.has(node.name.text)
        ) {
          runtimeRegistryAliases.add(node.name.text);
          discoveredRuntimeRegistryAlias = true;
        } else if (
          ts.isObjectBindingPattern(node.name) &&
          isRuntimeRegistryReference(node.initializer)
        ) {
          for (const element of node.name.elements) {
            if (
              element.dotDotDotToken !== undefined ||
              !ts.isIdentifier(element.name)
            )
              continue;
            const importedName = staticPropertyName(
              element.propertyName ?? element.name,
            );
            if (
              importedName !== undefined &&
              runtimeSemanticName(importedName) &&
              !runtimeRegistryAliases.has(element.name.text)
            ) {
              runtimeRegistryAliases.add(element.name.text);
              discoveredRuntimeRegistryAlias = true;
            }
          }
        }
      }
      ts.forEachChild(node, visitRuntimeAliases);
    };
    visitRuntimeAliases(sourceFile);
  } while (discoveredRuntimeRegistryAlias);
  const MUTATING_METHODS = new Set([
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "sort",
    "splice",
    "unshift",
  ]);
  const isModuleExportsReference = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (ts.isPropertyAccessExpression(value))
      return (
        ts.isIdentifier(value.expression) &&
        value.expression.text === "module" &&
        value.name.text === "exports"
      );
    return (
      ts.isElementAccessExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === "module" &&
      value.argumentExpression !== undefined &&
      evaluate(value.argumentExpression, topLevelConstants) === "exports"
    );
  };
  const isCommonJsExportReference = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (isModuleExportsReference(value)) return true;
    if (
      !ts.isPropertyAccessExpression(value) &&
      !ts.isElementAccessExpression(value)
    )
      return false;
    return (
      (ts.isIdentifier(value.expression) &&
        value.expression.text === "exports") ||
      isModuleExportsReference(value.expression)
    );
  };
  const rejectRuntimeRegistryMutation = (node: ts.Node): void => {
    let mutated: ts.Expression | undefined;
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (
        (ts.isPropertyAccessExpression(callee) ||
          ts.isElementAccessExpression(callee)) &&
        MUTATING_METHODS.has(memberName(callee) ?? "") &&
        isRuntimeRegistryReference(callee.expression)
      )
        mutated = callee.expression;
      else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        ((callee.expression.text === "Reflect" && callee.name.text === "set") ||
          (callee.expression.text === "Object" &&
            callee.name.text === "assign"))
      ) {
        const target = node.arguments[0];
        if (target !== undefined && isRuntimeRegistryReference(target))
          mutated = target;
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      !(
        ts.isExpressionStatement(node.parent) &&
        ts.isSourceFile(node.parent.parent) &&
        isCommonJsExportReference(node.left)
      ) &&
      isRuntimeRegistryReference(node.left)
    )
      mutated = node.left;
    else if (
      ts.isDeleteExpression(node) &&
      isRuntimeRegistryReference(node.expression)
    )
      mutated = node.expression;
    if (mutated !== undefined)
      fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: runtime registry mutation ${mutated.getText(sourceFile)} is forbidden`,
      );
  };

  const collectExpressionSurfaces = (expression: ts.Expression): void => {
    const evaluated = evaluate(expression);
    if (evaluated !== undefined) surfaces.add(evaluated);
    const collect = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) surfaces.add(node.text);
      ts.forEachChild(node, collect);
    };
    collect(expression);
  };

  const staticRegistryIdentifiers = new Set<string>();
  const registryStringIdentifiers = new Set<string>();
  const isStaticRegistryValue = (
    expression: ts.Expression,
    bindings: ReadonlyMap<string, ts.Expression> = topLevelConstants,
  ): boolean => {
    if (evaluate(expression, bindings, registryStringIdentifiers) !== undefined)
      return true;
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
      return isStaticRegistryValue(expression.expression, bindings);
    if (ts.isArrayLiteralExpression(expression))
      return expression.elements.every(
        (element) =>
          !ts.isSpreadElement(element) &&
          isStaticRegistryValue(element, bindings),
      );
    if (ts.isObjectLiteralExpression(expression))
      return expression.properties.every((property) => {
        if (ts.isPropertyAssignment(property)) {
          if (
            ts.isComputedPropertyName(property.name) &&
            !isStaticRegistryValue(property.name.expression, bindings)
          )
            return false;
          return isStaticRegistryValue(property.initializer, bindings);
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          const initializer = bindings.get(property.name.text);
          return (
            initializer !== undefined &&
            isStaticRegistryValue(initializer, bindings)
          );
        }
        return false;
      });
    if (ts.isIdentifier(expression)) {
      if (staticRegistryIdentifiers.has(expression.text)) return false;
      const initializer = bindings.get(expression.text);
      if (initializer === undefined) return false;
      staticRegistryIdentifiers.add(expression.text);
      const result = isStaticRegistryValue(initializer, bindings);
      staticRegistryIdentifiers.delete(expression.text);
      return result;
    }
    return false;
  };

  const routeDecorator = (expression: ts.LeftHandSideExpression): boolean => {
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value))
      return (
        NEST_ROUTE_DECORATOR.test(value.text) ||
        nestRouteDecoratorAliases.has(value.text)
      );
    if (ts.isPropertyAccessExpression(value))
      return (
        NEST_ROUTE_DECORATOR.test(value.name.text) &&
        isNestNamespaceExpression(value.expression)
      );
    if (
      ts.isElementAccessExpression(value) &&
      isNestNamespaceExpression(value.expression) &&
      value.argumentExpression !== undefined
    ) {
      const name = evaluate(value.argumentExpression, topLevelConstants);
      return name !== undefined && NEST_ROUTE_DECORATOR.test(name);
    }
    return false;
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
    bindings: ReadonlyMap<string, ts.Expression> = topLevelConstants,
  ): void => {
    if (!isStaticRegistryValue(expression, bindings))
      fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: ${label} is not statically decidable`,
      );
  };

  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true;

  type RegistryFunction =
    ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression;
  const requireStaticRegistryFunction = (
    declaration: RegistryFunction,
  ): void => {
    const label =
      ts.isArrowFunction(declaration) || declaration.name === undefined
        ? "default function"
        : declaration.name.text;
    const body = declaration.body;
    if (
      body === undefined ||
      (!ts.isArrowFunction(declaration) &&
        declaration.asteriskToken !== undefined) ||
      hasModifier(declaration, ts.SyntaxKind.AsyncKeyword)
    )
      return fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: ${label} is not a synchronous static registry function`,
      );
    const functionBindings = new Map(topLevelConstants);
    const requireStaticBindingInitializers = (
      name: ts.BindingName,
      labelPrefix: string,
    ): void => {
      if (ts.isIdentifier(name)) return;
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) continue;
        if (
          element.propertyName !== undefined &&
          ts.isComputedPropertyName(element.propertyName)
        )
          requireStaticRegistry(
            element.propertyName.expression,
            `${labelPrefix} computed property`,
            functionBindings,
          );
        if (element.initializer !== undefined)
          requireStaticRegistry(
            element.initializer,
            `${labelPrefix} default`,
            functionBindings,
          );
        requireStaticBindingInitializers(element.name, labelPrefix);
      }
    };
    const removeBinding = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) {
        functionBindings.delete(name.text);
        return;
      }
      for (const element of name.elements)
        if (!ts.isOmittedExpression(element)) removeBinding(element.name);
    };
    for (const parameter of declaration.parameters) {
      if (parameter.initializer !== undefined)
        requireStaticRegistry(
          parameter.initializer,
          `${label} parameter ${parameter.name.getText(sourceFile)} default`,
          functionBindings,
        );
      requireStaticBindingInitializers(
        parameter.name,
        `${label} parameter ${parameter.name.getText(sourceFile)}`,
      );
      removeBinding(parameter.name);
    }
    if (!ts.isBlock(body)) {
      requireStaticRegistry(body, `${label} return`, functionBindings);
      return;
    }
    for (const statement of body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const local of statement.declarationList.declarations) {
        removeBinding(local.name);
        if (
          (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
          ts.isIdentifier(local.name) &&
          local.initializer !== undefined
        )
          functionBindings.set(local.name.text, local.initializer);
      }
    }
    let returns = 0;
    for (const statement of body.statements) {
      if (ts.isReturnStatement(statement)) {
        const registryReturn = statement.expression;
        if (registryReturn === undefined)
          return fail(
            "RUNTIME_CANDIDATE_UNRESOLVED",
            `${file}: ${label} has an empty registry return`,
          );
        requireStaticRegistry(
          registryReturn,
          `${label} return`,
          functionBindings,
        );
        returns += 1;
        continue;
      }
      if (
        ts.isVariableStatement(statement) &&
        (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
      ) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name))
            return fail(
              "RUNTIME_CANDIDATE_UNRESOLVED",
              `${file}: ${label} has a non-identifier registry binding`,
            );
          const initializer = declaration.initializer;
          if (initializer === undefined)
            return fail(
              "RUNTIME_CANDIDATE_UNRESOLVED",
              `${file}: ${label} has an uninitialized registry constant`,
            );
          requireStaticRegistry(
            initializer,
            `${label} local ${declaration.name.getText(sourceFile)}`,
            functionBindings,
          );
        }
        continue;
      }
      fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: ${label} contains runtime registry logic`,
      );
    }
    if (returns === 0)
      fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: ${label} has no static registry return`,
      );
  };

  const validateTopLevelRegistryExports = (): void => {
    const objectHasRuntimeRegistryField = (
      expression: ts.Expression,
    ): boolean => {
      const value = unwrapExpression(expression);
      return (
        ts.isObjectLiteralExpression(value) &&
        value.properties.some((property) => {
          if (
            !ts.isPropertyAssignment(property) &&
            !ts.isShorthandPropertyAssignment(property)
          )
            return false;
          const name = staticPropertyName(property.name);
          return name !== undefined && runtimeSemanticName(name);
        })
      );
    };
    const hasTopLevelRegistrySemantics = sourceFile.statements.some(
      (statement) => {
        if (ts.isVariableStatement(statement))
          return statement.declarationList.declarations.some(
            (declaration) =>
              ts.isIdentifier(declaration.name) &&
              runtimeSemanticName(declaration.name.text),
          );
        if (ts.isFunctionDeclaration(statement))
          return (
            statement.name !== undefined &&
            runtimeSemanticName(statement.name.text)
          );
        if (ts.isExportAssignment(statement))
          return objectHasRuntimeRegistryField(statement.expression);
        if (ts.isExportDeclaration(statement))
          return (
            statement.exportClause !== undefined &&
            ts.isNamedExports(statement.exportClause) &&
            statement.exportClause.elements.some((element) =>
              runtimeSemanticName((element.propertyName ?? element.name).text),
            )
          );
        if (
          ts.isExpressionStatement(statement) &&
          ts.isBinaryExpression(statement.expression) &&
          isCommonJsExportReference(statement.expression.left)
        ) {
          const name = memberName(statement.expression.left);
          return (
            (name !== undefined && runtimeSemanticName(name)) ||
            objectHasRuntimeRegistryField(statement.expression.right)
          );
        }
        return false;
      },
    );
    if (!isStaticSurfaceRegistry(file) && !hasTopLevelRegistrySemantics) return;

    const isModuleExports = (expression: ts.Expression): boolean => {
      if (ts.isPropertyAccessExpression(expression))
        return (
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === "module" &&
          expression.name.text === "exports"
        );
      if (!ts.isElementAccessExpression(expression)) return false;
      return (
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "module" &&
        expression.argumentExpression !== undefined &&
        evaluate(expression.argumentExpression, topLevelConstants) === "exports"
      );
    };

    const isCommonJsExportTarget = (expression: ts.Expression): boolean => {
      if (isModuleExports(expression)) return true;
      if (
        !ts.isPropertyAccessExpression(expression) &&
        !ts.isElementAccessExpression(expression)
      )
        return false;
      const base = expression.expression;
      return (
        (ts.isIdentifier(base) && base.text === "exports") ||
        isModuleExports(base)
      );
    };

    const requireStaticRegistryExport = (
      expression: ts.Expression,
      label: string,
    ): void => {
      const value = unwrapExpression(expression);
      if (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) {
        requireStaticRegistryFunction(value);
        return;
      }
      if (ts.isIdentifier(value)) {
        const declaration = topLevelFunctions.get(value.text);
        if (declaration !== undefined) {
          requireStaticRegistryFunction(declaration);
          return;
        }
      }
      requireStaticRegistry(expression, label);
    };

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEmptyStatement(statement)
      )
        continue;
      if (ts.isExpressionStatement(statement)) {
        if (ts.isStringLiteralLike(statement.expression)) continue;
        if (
          !ts.isBinaryExpression(statement.expression) ||
          !isCommonJsExportTarget(statement.expression.left)
        )
          return fail(
            "RUNTIME_CANDIDATE_UNRESOLVED",
            `${file}: unsupported top-level registry runtime expression`,
          );
        if (
          statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        )
          return fail(
            "RUNTIME_CANDIDATE_UNRESOLVED",
            `${file}: compound CommonJS registry exports are not statically decidable`,
          );
        requireStaticRegistryExport(
          statement.expression.right,
          statement.expression.left.getText(sourceFile),
        );
        continue;
      }
      if (ts.isExportAssignment(statement)) {
        requireStaticRegistryExport(statement.expression, "default export");
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0)
          return fail(
            "RUNTIME_CANDIDATE_UNRESOLVED",
            `${file}: registry bindings must be const`,
          );
        for (const declaration of statement.declarationList.declarations) {
          const initializer = declaration.initializer;
          if (initializer === undefined)
            return fail(
              "RUNTIME_CANDIDATE_UNRESOLVED",
              `${file}: ${declaration.name.getText(sourceFile)} is uninitialized`,
            );
          requireStaticRegistry(
            initializer,
            declaration.name.getText(sourceFile),
          );
        }
        continue;
      }
      if (ts.isFunctionDeclaration(statement)) {
        requireStaticRegistryFunction(statement);
        continue;
      }
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        const exportClause = statement.exportClause;
        if (
          statement.moduleSpecifier !== undefined ||
          exportClause === undefined ||
          !ts.isNamedExports(exportClause)
        )
          return fail(
            "RUNTIME_CANDIDATE_UNRESOLVED",
            `${file}: re-exported runtime registries are not statically decidable`,
          );
        for (const element of exportClause.elements) {
          if (element.isTypeOnly) continue;
          const localName = (element.propertyName ?? element.name).text;
          const initializer = topLevelConstants.get(localName);
          if (initializer !== undefined) {
            requireStaticRegistry(initializer, localName);
            continue;
          }
          const functionDeclaration = topLevelFunctions.get(localName);
          if (functionDeclaration !== undefined) {
            requireStaticRegistryFunction(functionDeclaration);
            continue;
          }
          return fail(
            "RUNTIME_CANDIDATE_UNRESOLVED",
            `${file}: exported ${localName} has no static binding`,
          );
        }
        continue;
      }
      return fail(
        "RUNTIME_CANDIDATE_UNRESOLVED",
        `${file}: unsupported top-level registry statement ${ts.SyntaxKind[statement.kind]}`,
      );
    }
  };

  validateTopLevelRegistryExports();

  const visit = (node: ts.Node): void => {
    rejectRuntimeRegistryMutation(node);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isVariableDeclarationList(node.parent) &&
      ts.isVariableStatement(node.parent.parent) &&
      hasModifier(node.parent.parent, ts.SyntaxKind.ExportKeyword)
    )
      surfaces.add(node.name.text);
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined &&
      hasModifier(node, ts.SyntaxKind.ExportKeyword)
    )
      surfaces.add(node.name.text);
    if (ts.isExportSpecifier(node) && !node.isTypeOnly) {
      surfaces.add(node.name.text);
      if (node.propertyName !== undefined) surfaces.add(node.propertyName.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      ts.isExpressionStatement(node.parent) &&
      ts.isSourceFile(node.parent.parent) &&
      isCommonJsExportReference(node.left)
    ) {
      const exportedName = memberName(node.left);
      if (exportedName !== undefined) surfaces.add(exportedName);
    }
    if (
      ts.isVariableDeclaration(node) &&
      runtimeField(node.name) &&
      node.initializer !== undefined
    ) {
      requireStatic(node.initializer, node.name.getText(sourceFile));
      collectExpressionSurfaces(node.initializer);
    }
    if (
      ts.isVariableDeclaration(node) &&
      runtimeContainerField(node.name) &&
      node.initializer !== undefined
    ) {
      requireStaticRegistry(node.initializer, node.name.getText(sourceFile));
      collectExpressionSurfaces(node.initializer);
    }
    if (ts.isPropertyAssignment(node) && runtimeField(node.name)) {
      requireStatic(node.initializer, node.name.getText(sourceFile));
      collectExpressionSurfaces(node.initializer);
    }
    if (ts.isPropertyAssignment(node) && runtimeContainerField(node.name)) {
      requireStaticRegistry(node.initializer, node.name.getText(sourceFile));
      collectExpressionSurfaces(node.initializer);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isDecorator(node.parent) &&
      routeDecorator(node.expression)
    )
      for (const [index, argument] of node.arguments.entries()) {
        requireStatic(argument, `decorator argument ${index}`);
        collectExpressionSurfaces(argument);
      }
    if (ts.isStringLiteralLike(node)) surfaces.add(node.text);
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
    collectJsonStrings(
      parsed,
      strings,
      isStaticSurfaceRegistry(file) || hasRuntimeRegistryName(file),
    );
    return strings;
  }
  if (extension === ".yaml" || extension === ".yml") {
    const parsed = parseYaml12(content, "RUNTIME_CANDIDATE_MALFORMED", file);
    const strings: string[] = [];
    collectJsonStrings(
      parsed,
      strings,
      isStaticSurfaceRegistry(file) || hasRuntimeRegistryName(file),
    );
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
      const matches =
        rule.exact === true && value !== file
          ? tokens.length === rule.tokens.length &&
            rule.tokens.every((token, index) => tokens[index] === token)
          : containsSequence(tokens, rule.tokens);
      if (!matches) continue;
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
  const candidates = new Set<string>();

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
        candidates.add(child);
    }
  };

  let rootEntries: Dirent[];
  try {
    rootEntries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unreadable root";
    return fail("RUNTIME_CANDIDATE_UNREADABLE", detail);
  }
  rootEntries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of rootEntries) {
    const child = resolve(root, entry.name);
    if (entry.isSymbolicLink() && isRuntimeCandidate(entry.name))
      fail("RUNTIME_CANDIDATE_SYMLINK", entry.name);
    if (entry.isFile() && isRuntimeCandidate(entry.name)) candidates.add(child);
  }

  for (const sourceRoot of ["apps", "packages", "src", "scripts", "config"]) {
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

  const collectManifestTargets = (value: unknown, output: string[]): void => {
    if (typeof value === "string") {
      if (value.startsWith("./")) output.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) collectManifestTargets(child, output);
      return;
    }
    if (typeof value === "object" && value !== null)
      for (const child of Object.values(value))
        collectManifestTargets(child, output);
  };

  const visitForcedTarget = async (absolutePath: string): Promise<void> => {
    const path = normalizedRepositoryPath(root, absolutePath);
    let status: Awaited<ReturnType<typeof lstat>>;
    try {
      status = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      const detail = error instanceof Error ? error.message : "unreadable path";
      return fail("RUNTIME_CANDIDATE_UNREADABLE", `${path}: ${detail}`);
    }
    if (status.isSymbolicLink()) fail("RUNTIME_CANDIDATE_SYMLINK", path);
    if (status.isFile()) {
      const extension = extname(path).toLowerCase();
      if (
        SOURCE_EXTENSIONS.has(extension) ||
        STRUCTURED_EXTENSIONS.has(extension)
      )
        candidates.add(absolutePath);
      return;
    }
    if (!status.isDirectory()) return;
    let entries: Dirent[];
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "unreadable directory";
      return fail("RUNTIME_CANDIDATE_UNREADABLE", `${path}: ${detail}`);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = resolve(absolutePath, entry.name);
      const childPath = normalizedRepositoryPath(root, child);
      if (entry.isSymbolicLink()) fail("RUNTIME_CANDIDATE_SYMLINK", childPath);
      if (entry.isDirectory()) await visitForcedTarget(child);
      else if (entry.isFile()) await visitForcedTarget(child);
    }
  };

  for (const workspaceRootName of ["apps", "packages"]) {
    const workspaceRoot = resolve(root, workspaceRootName);
    let workspaces: Dirent[];
    try {
      workspaces = await readdir(workspaceRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const workspace of workspaces) {
      if (workspace.isSymbolicLink())
        fail(
          "RUNTIME_CANDIDATE_SYMLINK",
          `${workspaceRootName}/${workspace.name}`,
        );
      if (!workspace.isDirectory()) continue;
      const projectDirectory = resolve(workspaceRoot, workspace.name);
      const manifestPath = resolve(projectDirectory, "package.json");
      let manifestContent: string;
      try {
        manifestContent = await readFile(manifestPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        const detail =
          error instanceof Error ? error.message : "unreadable file";
        return fail(
          "RUNTIME_CANDIDATE_UNREADABLE",
          `${workspaceRootName}/${workspace.name}/package.json: ${detail}`,
        );
      }
      let manifest: unknown;
      try {
        manifest = JSON.parse(manifestContent) as unknown;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "invalid JSON";
        return fail(
          "RUNTIME_CANDIDATE_MALFORMED",
          `${workspaceRootName}/${workspace.name}/package.json: ${detail}`,
        );
      }
      if (
        typeof manifest !== "object" ||
        manifest === null ||
        Array.isArray(manifest)
      )
        fail(
          "RUNTIME_CANDIDATE_MALFORMED",
          `${workspaceRootName}/${workspace.name}/package.json: manifest must be an object`,
        );
      const record = manifest as Record<string, unknown>;
      const targets: string[] = [];
      for (const field of ["exports", "main", "module", "browser", "bin"])
        collectManifestTargets(record[field], targets);
      for (const target of targets) {
        const star = target.indexOf("*");
        const prefix = star < 0 ? target : target.slice(0, star);
        const relativeBase =
          star < 0 ? target : prefix.endsWith("/") ? prefix : dirname(prefix);
        const absoluteTarget = resolve(projectDirectory, relativeBase);
        const projectRelative = relative(projectDirectory, absoluteTarget);
        if (
          projectRelative === ".." ||
          projectRelative.startsWith(`..${sep}`) ||
          projectRelative.startsWith("/")
        )
          fail(
            "RUNTIME_CANDIDATE_TRAVERSAL",
            `${workspaceRootName}/${workspace.name}/package.json: ${target}`,
          );
        await visitForcedTarget(absoluteTarget);
      }
    }
  }
  return [...candidates].sort((left, right) => left.localeCompare(right));
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
