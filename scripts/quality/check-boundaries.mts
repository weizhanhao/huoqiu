import { constants, type Dirent } from "node:fs";
import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

import ts from "typescript";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";
import { parseYaml12 } from "./yaml.mts";

type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";
type WorkspaceKind = "app" | "package";

interface WorkspaceProject {
  dependencies: Map<string, string>;
  directory: string;
  exports: unknown;
  kind: WorkspaceKind;
  manifestPath: string;
  name: string;
}

interface PackageExportTarget {
  exactMapping: boolean;
  path: string;
}

const DEPENDENCY_SECTIONS: readonly DependencySection[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
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
const EXCLUDED_SOURCE_SEGMENTS = new Set([
  ".cache",
  ".next",
  ".turbo",
  "__tests__",
  "build",
  "coverage",
  "dist",
  "docs",
  "fixtures",
  "node_modules",
  "test",
  "tests",
]);
const EXCLUDED_IMPORT_TARGET_SEGMENTS = new Set([
  "__tests__",
  "docs",
  "fixtures",
  "test",
  "tests",
]);
const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const EXACT_ALIAS_PACKAGE_NAME =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const FORBIDDEN_SOURCE =
  /^(?:bitbucket:|file:|git(?:\+[^:]+)?:|github:|gitlab:|https?:|link:)/i;

interface ExactExternalDependency {
  aliasTarget?: string;
}

const parseExactExternalDependency = (
  version: string,
): ExactExternalDependency | undefined => {
  if (EXACT_VERSION.test(version)) return {};
  if (!version.startsWith("npm:")) return undefined;
  const aliasedTarget = version.slice("npm:".length);
  const versionSeparator = aliasedTarget.lastIndexOf("@");
  if (versionSeparator <= 0) return undefined;
  const packageName = aliasedTarget.slice(0, versionSeparator);
  const targetVersion = aliasedTarget.slice(versionSeparator + 1);
  return EXACT_ALIAS_PACKAGE_NAME.test(packageName) &&
    EXACT_VERSION.test(targetVersion)
    ? { aliasTarget: packageName }
    : undefined;
};

interface InventoryAction {
  commit_sha: string;
  license: string;
  owner: string;
  platform_owner: string;
  release: string;
  repository: string;
  source_url: string;
}

interface InventoryArtifact {
  classification: string;
  name: string;
  path: string;
  retention_days: number;
}

const CI_ACTIONS: readonly InventoryAction[] = [
  {
    commit_sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
    license: "MIT",
    owner: "actions",
    platform_owner: "platform-engineering",
    release: "v7.0.1",
    repository: "checkout",
    source_url: "https://github.com/actions/checkout",
  },
  {
    commit_sha: "c9883cc79df532ad1a7b81bf9ab944ceb090d65c",
    license: "MIT",
    owner: "pnpm",
    platform_owner: "platform-engineering",
    release: "v2.0.0",
    repository: "setup",
    source_url: "https://github.com/pnpm/setup",
  },
  {
    commit_sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    license: "MIT",
    owner: "actions",
    platform_owner: "platform-engineering",
    release: "v7.0.1",
    repository: "upload-artifact",
    source_url: "https://github.com/actions/upload-artifact",
  },
] as const;

const CI_ARTIFACT: InventoryArtifact = {
  classification: "internal-ci-test-log",
  name: "unit-test-log-${{ github.run_id }}-${{ github.run_attempt }}",
  path: "test-results/unit.log",
  retention_days: 7,
};

const CANONICAL_PREFLIGHT_STEPS: readonly Record<string, unknown>[] = [
  {
    name: "Check out repository",
    uses: `actions/checkout@${CI_ACTIONS[0]?.commit_sha ?? ""}`,
    with: { "persist-credentials": false },
  },
  {
    name: "Set up pnpm and Node",
    uses: `pnpm/setup@${CI_ACTIONS[1]?.commit_sha ?? ""}`,
    with: {
      version: "11.4.0",
      runtime: "node@24.15.0",
      install: false,
      cache: false,
    },
  },
  {
    name: "Verify toolchain",
    shell: "bash",
    run: 'set -euo pipefail\ntest "$(node --version)" = "v24.15.0"\ntest "$(pnpm --version)" = "11.4.0"\n',
  },
  {
    name: "Install dependencies",
    shell: "bash",
    run: "pnpm install --frozen-lockfile --strict-peer-dependencies",
  },
  {
    name: "Verify generated state is clean",
    shell: "bash",
    run: "git diff --exit-code",
  },
];

const CANONICAL_QUALITY_STEPS: readonly Record<string, unknown>[] = [
  CANONICAL_PREFLIGHT_STEPS[0] as Record<string, unknown>,
  CANONICAL_PREFLIGHT_STEPS[1] as Record<string, unknown>,
  CANONICAL_PREFLIGHT_STEPS[3] as Record<string, unknown>,
  {
    name: "Run fixed quality lane",
    shell: "bash",
    run: 'set -euo pipefail\ncase "${{ matrix.lane }}" in\n  format) pnpm format:check ;;\n  lint) pnpm lint ;;\n  typecheck) pnpm typecheck ;;\n  test)\n    mkdir -p test-results\n    pnpm test 2>&1 | tee test-results/unit.log\n    ;;\n  build) pnpm build ;;\n  boundaries) pnpm qa:boundaries ;;\n  dependency-audit) pnpm qa:dependency-patch ;;\n  *) exit 64 ;;\nesac\n',
  },
  {
    name: "Upload unit-test log",
    if: "${{ always() && matrix.lane == 'test' }}",
    uses: `actions/upload-artifact@${CI_ACTIONS[2]?.commit_sha ?? ""}`,
    with: {
      name: CI_ARTIFACT.name,
      path: CI_ARTIFACT.path,
      "if-no-files-found": "error",
      "retention-days": CI_ARTIFACT.retention_days,
    },
  },
];

const fail = (code: string, detail: string): never => {
  throw new QualityGateError(code, detail);
};

const repositoryPath = (root: string, path: string): string => {
  const normalized = relative(root, path).split(sep).join("/");
  if (
    normalized.length === 0 ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    fail("WORKSPACE_PATH_TRAVERSAL", path);
  }
  return normalized;
};

const requireRecord = (
  value: unknown,
  code: string,
  detail: string,
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(code, detail);
  }
  return value as Record<string, unknown>;
};

const readUtf8 = async (path: string, code: string): Promise<string> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unreadable file";
    return fail(code, `${path}: ${detail}`);
  }
};

const parseManifest = async (
  root: string,
  manifestPath: string,
  kind: WorkspaceKind,
): Promise<WorkspaceProject> => {
  const path = repositoryPath(root, manifestPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readUtf8(manifestPath, "WORKSPACE_MANIFEST_UNREADABLE"),
    );
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    const detail = error instanceof Error ? error.message : "invalid JSON";
    fail("WORKSPACE_MANIFEST_MALFORMED", `${path}: ${detail}`);
  }
  const record = requireRecord(
    parsed,
    "WORKSPACE_MANIFEST_MALFORMED",
    `${path}: manifest must be an object`,
  );
  if (typeof record.name !== "string" || record.name.length === 0) {
    fail(
      "WORKSPACE_MANIFEST_MALFORMED",
      `${path}: name must be a non-empty string`,
    );
  }
  const dependencies = new Map<string, string>();
  for (const section of DEPENDENCY_SECTIONS) {
    const value = record[section];
    if (value === undefined) continue;
    const dependencyRecord = requireRecord(
      value,
      "WORKSPACE_MANIFEST_MALFORMED",
      `${path}: ${section} must be an object`,
    );
    for (const [name, version] of Object.entries(dependencyRecord)) {
      if (typeof version !== "string" || version.length === 0) {
        fail(
          "WORKSPACE_MANIFEST_MALFORMED",
          `${path}: ${section}.${name} must be a non-empty string`,
        );
      }
      const existing = dependencies.get(name);
      if (existing !== undefined && existing !== version) {
        fail(
          "WORKSPACE_DEPENDENCY_CONFLICT",
          `${path}: ${name} has conflicting direct versions`,
        );
      }
      dependencies.set(name, version as string);
    }
  }
  return {
    dependencies,
    directory: resolve(manifestPath, ".."),
    exports: record.exports,
    kind,
    manifestPath: path,
    name: record.name as string,
  };
};

const discoverWorkspaceProjects = async (
  root: string,
): Promise<WorkspaceProject[]> => {
  const projects: WorkspaceProject[] = [];
  for (const [directory, kind] of [
    ["apps", "app"],
    ["packages", "package"],
  ] as const) {
    const absoluteDirectory = resolve(root, directory);
    let entries: Dirent[];
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      const detail =
        error instanceof Error ? error.message : "unreadable directory";
      return fail("WORKSPACE_DIRECTORY_UNREADABLE", `${directory}: ${detail}`);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        fail("WORKSPACE_SYMLINK_FORBIDDEN", `${directory}/${entry.name}`);
      if (!entry.isDirectory()) continue;
      const manifestPath = resolve(
        absoluteDirectory,
        entry.name,
        "package.json",
      );
      try {
        const status = await lstat(manifestPath);
        if (status.isSymbolicLink())
          fail(
            "WORKSPACE_SYMLINK_FORBIDDEN",
            repositoryPath(root, manifestPath),
          );
        if (!status.isFile()) continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      projects.push(await parseManifest(root, manifestPath, kind));
    }
  }
  const authSpikeManifestPath = resolve(root, "spikes/auth/package.json");
  try {
    for (const directoryPath of [
      resolve(root, "spikes"),
      resolve(root, "spikes/auth"),
    ]) {
      const status = await lstat(directoryPath);
      if (status.isSymbolicLink())
        fail(
          "WORKSPACE_SYMLINK_FORBIDDEN",
          repositoryPath(root, directoryPath),
        );
      if (!status.isDirectory())
        fail(
          "WORKSPACE_MANIFEST_UNREADABLE",
          `${repositoryPath(root, directoryPath)} must be a directory`,
        );
    }
    const manifestStatus = await lstat(authSpikeManifestPath);
    if (manifestStatus.isSymbolicLink())
      fail(
        "WORKSPACE_SYMLINK_FORBIDDEN",
        repositoryPath(root, authSpikeManifestPath),
      );
    if (!manifestStatus.isFile())
      fail(
        "WORKSPACE_MANIFEST_UNREADABLE",
        "spikes/auth/package.json must be a file",
      );
    const canonicalManifestPath = await realpath(authSpikeManifestPath);
    repositoryPath(root, canonicalManifestPath);
    if (canonicalManifestPath !== authSpikeManifestPath)
      fail(
        "WORKSPACE_SYMLINK_FORBIDDEN",
        repositoryPath(root, authSpikeManifestPath),
      );
    projects.push(await parseManifest(root, authSpikeManifestPath, "package"));
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    const detail =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "required manifest is missing"
        : error instanceof Error
          ? error.message
          : "unreadable file";
    fail("WORKSPACE_MANIFEST_UNREADABLE", `spikes/auth: ${detail}`);
  }
  if (projects.length === 0)
    fail(
      "WORKSPACE_PROJECTS_MISSING",
      "no apps/*, packages/*, or spikes/auth manifests found",
    );
  return projects;
};

const validateDependencyGraph = (
  projects: readonly WorkspaceProject[],
): void => {
  const byName = new Map<string, WorkspaceProject>();
  for (const project of projects) {
    const duplicate = byName.get(project.name);
    if (duplicate !== undefined) {
      fail(
        "DUPLICATE_WORKSPACE_NAME",
        `${project.name}: ${duplicate.manifestPath}, ${project.manifestPath}`,
      );
    }
    byName.set(project.name, project);
  }

  for (const project of projects) {
    for (const [name, version] of project.dependencies) {
      if (FORBIDDEN_SOURCE.test(version)) {
        fail(
          "DEPENDENCY_SOURCE_FORBIDDEN",
          `${project.manifestPath}: ${name}@${version}`,
        );
      }
      const workspaceDependency = byName.get(name);
      if (name.startsWith("@huoqiu/") && workspaceDependency === undefined) {
        fail(
          "UNKNOWN_WORKSPACE_DEPENDENCY",
          `${project.manifestPath}: ${name} is not a workspace project`,
        );
      }
      if (workspaceDependency !== undefined) {
        if (version !== "workspace:*") {
          fail(
            "WORKSPACE_PROTOCOL_INVALID",
            `${project.manifestPath}: ${name} must use workspace:*`,
          );
        }
        if (project.kind === "package" && workspaceDependency.kind === "app") {
          fail(
            "PACKAGE_DEPENDS_ON_APP",
            `${project.name} -> ${workspaceDependency.name}`,
          );
        }
        if (
          project.kind === "app" &&
          workspaceDependency.kind === "app" &&
          project.name !== workspaceDependency.name
        ) {
          fail(
            "APP_DEPENDS_ON_SIBLING_APP",
            `${project.name} -> ${workspaceDependency.name}`,
          );
        }
        continue;
      }
      const exactDependency =
        parseExactExternalDependency(version) ??
        fail(
          "DIRECT_DEPENDENCY_NOT_EXACT",
          `${project.manifestPath}: ${name}@${version}`,
        );
      const aliasTarget = exactDependency.aliasTarget;
      if (aliasTarget !== undefined) {
        const aliasedWorkspace = byName.get(aliasTarget);
        if (aliasedWorkspace !== undefined)
          fail(
            "WORKSPACE_ALIAS_FORBIDDEN",
            `${project.manifestPath}: ${name} must not alias workspace project ${aliasedWorkspace.name}`,
          );
        if (aliasTarget.startsWith("@huoqiu/"))
          fail(
            "UNKNOWN_WORKSPACE_DEPENDENCY",
            `${project.manifestPath}: alias target ${aliasTarget} is not a workspace project`,
          );
      }
    }
  }
};

const sourceImports = (file: string, content: string): string[] => {
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
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  const firstError = parseDiagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (firstError !== undefined) {
    fail(
      "WORKSPACE_SOURCE_MALFORMED",
      `${file}: ${ts.flattenDiagnosticMessageText(firstError.messageText, " ")}`,
    );
  }

  const constants = new Map<string, ts.Expression>();
  const evaluating = new Set<string>();
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

  const imports: string[] = [];
  const recordStaticSpecifier = (node: ts.Expression | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node))
      imports.push(node.text);
  };

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

  const staticMemberName = (expression: ts.Expression): string | undefined => {
    const value = unwrapExpression(expression);
    if (ts.isPropertyAccessExpression(value)) return value.name.text;
    if (
      ts.isElementAccessExpression(value) &&
      value.argumentExpression !== undefined
    )
      return evaluate(value.argumentExpression);
    return undefined;
  };

  const isModuleRequire = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (
      !ts.isPropertyAccessExpression(value) &&
      !ts.isElementAccessExpression(value)
    )
      return false;
    return (
      ts.isIdentifier(value.expression) &&
      value.expression.text === "module" &&
      staticMemberName(value) === "require"
    );
  };

  const loaderAliases = new Set(["require"]);
  const createRequireAliases = new Set<string>();
  const moduleNamespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "node:module" ||
      statement.importClause?.isTypeOnly === true
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      moduleNamespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      if ((element.propertyName ?? element.name).text === "createRequire")
        createRequireAliases.add(element.name.text);
    }
  }

  const isCreateRequireReference = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value)) return createRequireAliases.has(value.text);
    if (
      !ts.isPropertyAccessExpression(value) &&
      !ts.isElementAccessExpression(value)
    )
      return false;
    return (
      ts.isIdentifier(value.expression) &&
      moduleNamespaces.has(value.expression.text) &&
      staticMemberName(value) === "createRequire"
    );
  };

  const isLoaderReference = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value)) return loaderAliases.has(value.text);
    if (isModuleRequire(value)) return true;
    return false;
  };

  const isLoaderBindCall = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (!ts.isCallExpression(value)) return false;
    const callee = unwrapExpression(value.expression);
    return (
      (ts.isPropertyAccessExpression(callee) ||
        ts.isElementAccessExpression(callee)) &&
      staticMemberName(callee) === "bind" &&
      isLoaderReference(callee.expression)
    );
  };

  let discoveredLoaderAlias: boolean;
  do {
    discoveredLoaderAlias = false;
    const indexLoaderAliases = (node: ts.Node): void => {
      let target: ts.Identifier | undefined;
      let initializer: ts.Expression | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        target = node.name;
        initializer = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        target = node.left;
        initializer = node.right;
      }
      if (target !== undefined && initializer !== undefined) {
        const value = unwrapExpression(initializer);
        const createsLoader =
          isLoaderReference(value) ||
          isLoaderBindCall(value) ||
          (ts.isCallExpression(value) &&
            isCreateRequireReference(value.expression));
        if (createsLoader && !loaderAliases.has(target.text)) {
          loaderAliases.add(target.text);
          discoveredLoaderAlias = true;
        }
      }
      ts.forEachChild(node, indexLoaderAliases);
    };
    indexLoaderAliases(sourceFile);
  } while (discoveredLoaderAlias);

  const loaderCall = (expression: ts.Expression): boolean => {
    const value = unwrapExpression(expression);
    if (isLoaderReference(value)) return true;
    if (
      !ts.isPropertyAccessExpression(value) &&
      !ts.isElementAccessExpression(value)
    )
      return false;
    return (
      staticMemberName(value) === "resolve" &&
      isLoaderReference(value.expression)
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      recordStaticSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      recordStaticSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        loaderCall(node.expression))
    ) {
      const argument = node.arguments[0];
      const specifier = argument === undefined ? undefined : evaluate(argument);
      if (specifier === undefined)
        return fail(
          "WORKSPACE_DYNAMIC_IMPORT_UNRESOLVED",
          `${file}: dynamic module target is not statically decidable`,
        );
      imports.push(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
};

const validateSourceImports = async (
  root: string,
  projects: readonly WorkspaceProject[],
): Promise<void> => {
  const projectsByName = new Map(
    projects.map((project) => [project.name, project] as const),
  );
  const projectsByDirectory = [...projects].sort(
    (left, right) => right.directory.length - left.directory.length,
  );
  const compilerOptions = new Map<string, ts.CompilerOptions>();
  for (const project of projects) {
    const configPath = ts.findConfigFile(
      project.directory,
      ts.sys.fileExists,
      "tsconfig.json",
    );
    if (configPath === undefined) {
      compilerOptions.set(project.name, {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      continue;
    }
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    if (loaded.error !== undefined)
      fail(
        "WORKSPACE_TSCONFIG_MALFORMED",
        `${repositoryPath(root, configPath)}: ${ts.flattenDiagnosticMessageText(loaded.error.messageText, " ")}`,
      );
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config as object,
      ts.sys,
      dirname(configPath),
      undefined,
      configPath,
    );
    const error = parsed.errors.find(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (error !== undefined)
      fail(
        "WORKSPACE_TSCONFIG_MALFORMED",
        `${repositoryPath(root, configPath)}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
      );
    compilerOptions.set(project.name, parsed.options);
  }

  const ownsPath = (project: WorkspaceProject, path: string): boolean => {
    const child = relative(project.directory, path);
    return (
      child === "" ||
      (child !== ".." &&
        !child.startsWith(`..${sep}`) &&
        !child.startsWith("/"))
    );
  };

  const ownerOf = (path: string): WorkspaceProject | undefined =>
    projectsByDirectory.find((candidate) => ownsPath(candidate, path));

  const hasExcludedSegment = (
    project: WorkspaceProject,
    path: string,
  ): boolean =>
    relative(project.directory, path)
      .toLowerCase()
      .split(sep)
      .some((part) => EXCLUDED_IMPORT_TARGET_SEGMENTS.has(part));

  const rejectExcludedTarget = (
    project: WorkspaceProject | undefined,
    path: string,
    file: string,
  ): void => {
    if (project !== undefined && hasExcludedSegment(project, path))
      fail(
        "WORKSPACE_IMPORT_TARGET_EXCLUDED",
        `${file}: ${repositoryPath(root, path)}`,
      );
  };

  const rejectSymlinkComponents = async (
    path: string,
    file: string,
  ): Promise<void> => {
    const repositoryRelativePath = repositoryPath(root, path);
    let candidate = root;
    for (const segment of repositoryRelativePath.split("/")) {
      candidate = resolve(candidate, segment);
      try {
        if ((await lstat(candidate)).isSymbolicLink())
          fail(
            "WORKSPACE_SYMLINK_FORBIDDEN",
            `${file}: ${repositoryPath(root, candidate)}`,
          );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    }
  };

  const canonicalTarget = async (
    path: string,
    file: string,
  ): Promise<string> => {
    await rejectSymlinkComponents(path, file);
    const canonical = await realpath(path);
    repositoryPath(root, canonical);
    if (canonical !== resolve(path))
      fail(
        "WORKSPACE_SYMLINK_FORBIDDEN",
        `${file}: ${repositoryPath(root, path)}`,
      );
    return canonical;
  };

  const resolveExportStrings = (
    value: unknown,
    replacement: string | undefined,
    file: string,
    specifier: string,
  ): string[] => {
    if (typeof value === "string")
      return [
        replacement === undefined ? value : value.replaceAll("*", replacement),
      ];
    if (Array.isArray(value)) {
      const targets = value.flatMap((item) =>
        resolveExportStrings(item, replacement, file, specifier),
      );
      if (targets.length > 0) return targets;
    } else if (typeof value === "object" && value !== null) {
      const targets = Object.values(value).flatMap((item) =>
        resolveExportStrings(item, replacement, file, specifier),
      );
      if (targets.length > 0) return targets;
    }
    return fail(
      "WORKSPACE_IMPORT_UNRESOLVED",
      `${file}: ${specifier} has no static package export target`,
    );
  };

  const packageExportTargets = (
    target: WorkspaceProject,
    specifier: string,
    file: string,
  ): PackageExportTarget[] => {
    const importSuffix = specifier.slice(target.name.length);
    const exportKey = importSuffix.length === 0 ? "." : `.${importSuffix}`;
    const exportsValue = target.exports;
    let selected: unknown;
    let replacement: string | undefined;

    const comparePatternKeys = (left: string, right: string): number => {
      const leftStar = left.indexOf("*");
      const rightStar = right.indexOf("*");
      const leftBaseLength = leftStar < 0 ? left.length : leftStar + 1;
      const rightBaseLength = rightStar < 0 ? right.length : rightStar + 1;
      if (leftBaseLength > rightBaseLength) return -1;
      if (rightBaseLength > leftBaseLength) return 1;
      if (leftStar < 0) return 1;
      if (rightStar < 0) return -1;
      if (left.length > right.length) return -1;
      if (right.length > left.length) return 1;
      return 0;
    };

    if (typeof exportsValue === "string" || Array.isArray(exportsValue)) {
      if (exportKey === ".") selected = exportsValue;
    } else if (typeof exportsValue === "object" && exportsValue !== null) {
      const exportsRecord = exportsValue as Record<string, unknown>;
      const subpathMap = Object.keys(exportsRecord).some((key) =>
        key.startsWith("."),
      );
      if (!subpathMap && exportKey === ".") selected = exportsRecord;
      else {
        selected = exportsRecord[exportKey];
        if (selected === undefined) {
          const patterns = Object.entries(exportsRecord).toSorted(
            ([left], [right]) => comparePatternKeys(left, right),
          );
          for (const [pattern, value] of patterns) {
            const star = pattern.indexOf("*");
            if (star < 0 || pattern.indexOf("*", star + 1) >= 0) continue;
            const prefix = pattern.slice(0, star);
            const patternSuffix = pattern.slice(star + 1);
            if (
              exportKey.startsWith(prefix) &&
              exportKey.endsWith(patternSuffix) &&
              exportKey.length >= prefix.length + patternSuffix.length
            ) {
              selected = value;
              replacement = exportKey.slice(
                prefix.length,
                exportKey.length - patternSuffix.length,
              );
              break;
            }
          }
        }
      }
    }
    if (selected === undefined)
      fail(
        "WORKSPACE_IMPORT_UNRESOLVED",
        `${file}: ${specifier} is not exported by ${target.name}`,
      );
    return resolveExportStrings(selected, replacement, file, specifier).map(
      (path) => ({ exactMapping: replacement === undefined, path }),
    );
  };

  const versionedContractFixtureExports = new Map([
    ["@huoqiu/contracts/d0/fixture", "./fixtures/d0.v1.json"],
    ["@huoqiu/contracts/m1/fixture-data", "./fixtures/m1.v1.json"],
  ]);

  const isVersionedContractFixture = (
    namedTarget: WorkspaceProject,
    owner: WorkspaceProject,
    path: string,
    specifier: string,
  ): boolean => {
    const approvedTarget = versionedContractFixtureExports.get(specifier);
    if (
      namedTarget.name !== "@huoqiu/contracts" ||
      owner.name !== namedTarget.name ||
      approvedTarget === undefined
    )
      return false;
    const ownerRelativePath = relative(owner.directory, path).replaceAll(
      sep,
      "/",
    );
    return ownerRelativePath === approvedTarget.slice(2);
  };

  const isExactVersionedContractFixtureExport = (
    namedTarget: WorkspaceProject,
    exportTarget: PackageExportTarget,
    specifier: string,
  ): boolean => {
    const approvedTarget = versionedContractFixtureExports.get(specifier);
    return (
      namedTarget.name === "@huoqiu/contracts" &&
      approvedTarget !== undefined &&
      exportTarget.exactMapping &&
      exportTarget.path === approvedTarget
    );
  };

  const validateOwner = (
    source: WorkspaceProject,
    target: WorkspaceProject,
    file: string,
  ): void => {
    if (source.name === target.name) return;
    if (source.kind === "package" && target.kind === "app")
      fail(
        "PACKAGE_DEPENDS_ON_APP",
        `${source.name} -> ${target.name} in ${file}`,
      );
    if (source.kind === "app" && target.kind === "app")
      fail(
        "APP_DEPENDS_ON_SIBLING_APP",
        `${source.name} -> ${target.name} in ${file}`,
      );
    if (!source.dependencies.has(target.name))
      fail(
        "UNDECLARED_WORKSPACE_IMPORT",
        `${file}: ${target.name} is not declared by ${source.name}`,
      );
  };

  const validateWorkspaceImportTarget = async (
    source: WorkspaceProject,
    namedTarget: WorkspaceProject,
    targetPath: string,
    file: string,
    specifier: string,
    allowVersionedContractFixture = false,
  ): Promise<void> => {
    let canonical: string;
    try {
      canonical = await canonicalTarget(targetPath, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return fail(
          "WORKSPACE_IMPORT_UNRESOLVED",
          `${file}: ${specifier} -> ${targetPath}`,
        );
      throw error;
    }
    const targetStatus = await lstat(canonical);
    if (!targetStatus.isFile())
      fail(
        "WORKSPACE_IMPORT_TARGET_NOT_FILE",
        `${file}: ${specifier} -> ${repositoryPath(root, canonical)}`,
      );
    try {
      await access(canonical, constants.R_OK);
    } catch {
      fail(
        "WORKSPACE_IMPORT_TARGET_UNREADABLE",
        `${file}: ${specifier} -> ${repositoryPath(root, canonical)}`,
      );
    }
    const owner = ownerOf(canonical);
    if (owner === undefined)
      return fail(
        "WORKSPACE_IMPORT_TARGET_UNMAPPED",
        `${file}: ${specifier} -> ${repositoryPath(root, canonical)}`,
      );
    if (
      !allowVersionedContractFixture ||
      !isVersionedContractFixture(namedTarget, owner, canonical, specifier)
    )
      rejectExcludedTarget(owner, canonical, file);
    validateOwner(source, owner, file);
    if (owner.name !== namedTarget.name)
      fail(
        "WORKSPACE_IMPORT_OWNER_MISMATCH",
        `${file}: ${specifier} resolved to ${owner.name}`,
      );
  };

  const validateSpecifier = async (
    project: WorkspaceProject,
    absoluteFile: string,
    file: string,
    specifier: string,
  ): Promise<void> => {
    const match = /^(@huoqiu\/[^/]+)/.exec(specifier);
    const namedProject = match?.[1];
    if (namedProject !== undefined) {
      const target = projectsByName.get(namedProject);
      if (
        target === undefined &&
        namedProject !== project.name &&
        !project.dependencies.has(namedProject)
      )
        fail(
          "UNDECLARED_WORKSPACE_IMPORT",
          `${file}: ${namedProject} is not declared by ${project.name}`,
        );
      if (target === undefined)
        return fail(
          "WORKSPACE_IMPORT_UNRESOLVED",
          `${file}: ${specifier} has no workspace project`,
        );
      validateOwner(project, target, file);

      const exportTargets = packageExportTargets(target, specifier, file);

      const resolution = ts.resolveModuleName(
        specifier,
        absoluteFile,
        compilerOptions.get(project.name) ?? {},
        ts.sys,
      ).resolvedModule;
      if (resolution !== undefined) {
        const allowVersionedContractFixture = exportTargets.some(
          (exportTarget) =>
            isExactVersionedContractFixtureExport(
              target,
              exportTarget,
              specifier,
            ) &&
            resolve(target.directory, exportTarget.path) ===
              resolve(resolution.resolvedFileName),
        );
        await validateWorkspaceImportTarget(
          project,
          target,
          resolution.resolvedFileName,
          file,
          specifier,
          allowVersionedContractFixture,
        );
      }
      for (const exportTarget of exportTargets)
        await validateWorkspaceImportTarget(
          project,
          target,
          resolve(target.directory, exportTarget.path),
          file,
          specifier,
          isExactVersionedContractFixtureExport(
            target,
            exportTarget,
            specifier,
          ),
        );
      return;
    }

    const resolution = ts.resolveModuleName(
      specifier,
      absoluteFile,
      compilerOptions.get(project.name) ?? {},
      ts.sys,
    ).resolvedModule;
    if (specifier.startsWith(".")) {
      const lexicalTarget = resolve(dirname(absoluteFile), specifier);
      repositoryPath(root, lexicalTarget);
      await rejectSymlinkComponents(lexicalTarget, file);
      const lexicalOwner = ownerOf(lexicalTarget);

      let resolvedTarget: string | undefined;
      if (resolution !== undefined)
        resolvedTarget = await canonicalTarget(
          resolution.resolvedFileName,
          file,
        );
      const targetPath = resolvedTarget ?? lexicalTarget;
      const target = ownerOf(targetPath) ?? lexicalOwner;
      rejectExcludedTarget(lexicalOwner, lexicalTarget, file);
      rejectExcludedTarget(target, targetPath, file);

      const leavesProject =
        !ownsPath(project, lexicalTarget) ||
        (resolvedTarget !== undefined && !ownsPath(project, resolvedTarget));
      if (leavesProject && (resolution === undefined || target === undefined))
        fail("WORKSPACE_RELATIVE_IMPORT_UNMAPPED", `${file}: ${specifier}`);
      if (target !== undefined) validateOwner(project, target, file);
      return;
    }

    if (resolution === undefined) return;
    const target = ownerOf(resolution.resolvedFileName);
    if (target === undefined) return;
    const targetPath = await canonicalTarget(resolution.resolvedFileName, file);
    const canonicalOwner = ownerOf(targetPath);
    rejectExcludedTarget(target, resolution.resolvedFileName, file);
    rejectExcludedTarget(canonicalOwner, targetPath, file);
    if (canonicalOwner === undefined)
      return fail("WORKSPACE_IMPORT_TARGET_UNMAPPED", `${file}: ${specifier}`);
    validateOwner(project, canonicalOwner, file);
  };

  const visit = async (
    project: WorkspaceProject,
    directory: string,
  ): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      const detail =
        error instanceof Error ? error.message : "unreadable directory";
      return fail(
        "WORKSPACE_SOURCE_UNREADABLE",
        `${repositoryPath(root, directory)}: ${detail}`,
      );
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = resolve(directory, entry.name);
      const path = repositoryPath(root, child);
      const parts = path.toLowerCase().split("/");
      if (entry.isSymbolicLink()) fail("WORKSPACE_SYMLINK_FORBIDDEN", path);
      if (parts.some((part) => EXCLUDED_SOURCE_SEGMENTS.has(part))) continue;
      if (entry.isDirectory()) {
        await visit(project, child);
        continue;
      }
      if (
        !entry.isFile() ||
        !SOURCE_EXTENSIONS.has(extname(path).toLowerCase())
      )
        continue;
      const content = await readUtf8(child, "WORKSPACE_SOURCE_UNREADABLE");
      for (const specifier of sourceImports(path, content))
        await validateSpecifier(project, child, path, specifier);
    }
  };

  for (const project of projects) await visit(project, project.directory);
};

interface WorkspaceYaml {
  blocks: Map<string, string[]>;
  scalars: Map<string, string>;
}

const parseWorkspaceYaml = (content: string): WorkspaceYaml => {
  const scalars = new Map<string, string>();
  const blocks = new Map<string, string[]>();
  let activeBlock: string | undefined;
  for (const [index, originalLine] of content.split(/\r?\n/).entries()) {
    const line = originalLine.replace(/\s+#.*$/, "");
    if (line.trim().length === 0) continue;
    if (/^\s/.test(line)) {
      if (activeBlock === undefined)
        return fail(
          "PNPM_POLICY_INVALID",
          `unexpected indentation on line ${index + 1}`,
        );
      blocks.get(activeBlock)?.push(line.trim());
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/.exec(line);
    if (match === null)
      return fail(
        "PNPM_POLICY_INVALID",
        `malformed top-level key on line ${index + 1}`,
      );
    const key = match[1];
    if (key === undefined)
      return fail("PNPM_POLICY_INVALID", `missing key on line ${index + 1}`);
    const value = (match[2] ?? "").trim();
    if (scalars.has(key) || blocks.has(key))
      fail("PNPM_POLICY_INVALID", `duplicate ${key}`);
    if (value.length === 0) {
      blocks.set(key, []);
      activeBlock = key;
    } else {
      scalars.set(key, value);
      activeBlock = undefined;
    }
  }
  return { blocks, scalars };
};

const validatePnpmPolicy = async (root: string): Promise<void> => {
  const content = await readUtf8(
    resolve(root, "pnpm-workspace.yaml"),
    "PNPM_POLICY_UNREADABLE",
  );
  const parsed = parseWorkspaceYaml(content);
  if (
    parsed.blocks.has("minimumReleaseAgeExclude") ||
    parsed.scalars.has("minimumReleaseAgeExclude")
  ) {
    fail(
      "PNPM_RELEASE_AGE_EXCLUDE_FORBIDDEN",
      "minimumReleaseAgeExclude must not be configured",
    );
  }
  const expectedScalars = new Map([
    ["minimumReleaseAge", "1440"],
    ["minimumReleaseAgeStrict", "true"],
    ["minimumReleaseAgeIgnoreMissingTime", "false"],
    ["trustLockfile", "false"],
    ["blockExoticSubdeps", "true"],
  ]);
  for (const [key, expected] of expectedScalars) {
    const actual = parsed.scalars.get(key);
    if (actual !== expected)
      fail(
        "PNPM_POLICY_INVALID",
        `${key} must equal ${expected}; got ${actual ?? "missing"}`,
      );
  }
  for (const obsoleteKey of [
    "dangerouslyAllowAllBuilds",
    "ignoredBuiltDependencies",
    "neverBuiltDependencies",
    "onlyBuiltDependencies",
  ]) {
    if (parsed.blocks.has(obsoleteKey) || parsed.scalars.has(obsoleteKey))
      fail("PNPM_ALLOW_BUILDS_INVALID", `${obsoleteKey} is forbidden`);
  }
  const allowBuilds = parsed.blocks.get("allowBuilds");
  if (
    allowBuilds === undefined ||
    allowBuilds.length !== 1 ||
    allowBuilds[0] !== "esbuild: true"
  ) {
    fail(
      "PNPM_ALLOW_BUILDS_INVALID",
      "allowBuilds must contain only esbuild: true",
    );
  }
  const packagePatterns = parsed.blocks.get("packages");
  if (
    packagePatterns === undefined ||
    packagePatterns.length !== 3 ||
    packagePatterns[0] !== "- apps/*" ||
    packagePatterns[1] !== "- packages/*" ||
    packagePatterns[2] !== "- spikes/auth"
  ) {
    fail(
      "PNPM_WORKSPACE_GLOBS_INVALID",
      "packages must be exactly apps/*, packages/*, and spikes/auth",
    );
  }
};

const validateMobileLockfile = async (
  root: string,
  projects: readonly WorkspaceProject[],
): Promise<void> => {
  const mobile = projects.find((project) => project.name === "@huoqiu/mobile");
  if (mobile === undefined)
    return fail(
      "MOBILE_GESTURE_HANDLER_VERSION_INVALID",
      "@huoqiu/mobile is missing",
    );
  const version = mobile.dependencies.get("react-native-gesture-handler");
  if (version !== "2.32.0") {
    fail(
      "MOBILE_GESTURE_HANDLER_VERSION_INVALID",
      `expected 2.32.0; got ${version ?? "missing"}`,
    );
  }
  const lockfile = await readUtf8(
    resolve(root, "pnpm-lock.yaml"),
    "LOCKFILE_UNREADABLE",
  );
  const lines = lockfile.split(/\r?\n/);
  const importerStart = lines.findIndex((line) => line === "  apps/mobile:");
  const importerEnd =
    importerStart < 0
      ? -1
      : lines.findIndex(
          (line, index) => index > importerStart && /^ {2}\S/.test(line),
        );
  const importerLines =
    importerStart < 0
      ? []
      : lines.slice(
          importerStart + 1,
          importerEnd < 0 ? undefined : importerEnd,
        );
  const dependencyStart = importerLines.findIndex(
    (line) => line === "      react-native-gesture-handler:",
  );
  const dependencyEnd =
    dependencyStart < 0
      ? -1
      : importerLines.findIndex(
          (line, index) => index > dependencyStart && /^ {6}\S/.test(line),
        );
  const dependencyLines =
    dependencyStart < 0
      ? []
      : importerLines.slice(
          dependencyStart + 1,
          dependencyEnd < 0 ? undefined : dependencyEnd,
        );
  const specifier = dependencyLines
    .map((line) => /^ {8}specifier:\s*(\S+)\s*$/.exec(line)?.[1])
    .find((value) => value !== undefined);
  const lockedVersion = dependencyLines
    .map((line) => /^ {8}version:\s*(\S+)\s*$/.exec(line)?.[1])
    .find((value) => value !== undefined);
  if (
    specifier !== "2.32.0" ||
    lockedVersion === undefined ||
    !/^2\.32\.0(?:\(|$)/.test(lockedVersion)
  ) {
    fail(
      "LOCKFILE_GESTURE_HANDLER_INVALID",
      "apps/mobile must lock react-native-gesture-handler specifier and version to 2.32.0",
    );
  }
};

export const checkWorkspaceBoundaries = async (
  repositoryRoot = process.cwd(),
): Promise<void> => {
  const root = resolve(repositoryRoot);
  const status = await lstat(root);
  if (status.isSymbolicLink()) fail("WORKSPACE_SYMLINK_FORBIDDEN", root);
  if (!status.isDirectory()) fail("WORKSPACE_DIRECTORY_UNREADABLE", root);
  if ((await realpath(root)) !== root)
    fail("WORKSPACE_PATH_TRAVERSAL", repositoryRoot);
  const projects = await discoverWorkspaceProjects(root);
  await validateMobileLockfile(root, projects);
  validateDependencyGraph(projects);
  await validateSourceImports(root, projects);
  await validatePnpmPolicy(root);
};

const exactKeys = (
  record: Record<string, unknown>,
  expected: readonly string[],
  code: string,
  label: string,
): void => {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code, `${label} fields must equal ${wanted.join(",")}`);
  }
};

const requireStringField = (
  record: Record<string, unknown>,
  field: string,
  code: string,
  label: string,
): string => {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(code, `${label}.${field} must be a non-empty string`);
  }
  return value as string;
};

const parseArtifactInventory = async (
  root: string,
): Promise<{ actions: InventoryAction[]; artifacts: InventoryArtifact[] }> => {
  const path = resolve(root, "security/artifact-inventory.yml");
  let parsed: unknown;
  try {
    const content = await readUtf8(path, "ARTIFACT_INVENTORY_UNREADABLE");
    parsed = parseYaml12(
      content,
      "ARTIFACT_INVENTORY_SCHEMA_INVALID",
      "security/artifact-inventory.yml",
    );
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    const detail = error instanceof Error ? error.message : "invalid YAML";
    fail("ARTIFACT_INVENTORY_SCHEMA_INVALID", detail);
  }
  const inventory = requireRecord(
    parsed,
    "ARTIFACT_INVENTORY_SCHEMA_INVALID",
    "inventory must be an object",
  );
  exactKeys(
    inventory,
    ["actions", "artifacts", "schema_version"],
    "ARTIFACT_INVENTORY_SCHEMA_INVALID",
    "inventory",
  );
  if (inventory.schema_version !== 1)
    fail("ARTIFACT_INVENTORY_SCHEMA_INVALID", "schema_version must equal 1");
  const actionValues = inventory.actions;
  const artifactValues = inventory.artifacts;
  if (!Array.isArray(actionValues) || !Array.isArray(artifactValues)) {
    fail(
      "ARTIFACT_INVENTORY_SCHEMA_INVALID",
      "actions and artifacts must be arrays",
    );
  }

  const actions = (actionValues as unknown[]).map(
    (value, index): InventoryAction => {
      const action = requireRecord(
        value,
        "ARTIFACT_INVENTORY_ACTION_INVALID",
        `actions[${index}] must be an object`,
      );
      exactKeys(
        action,
        [
          "commit_sha",
          "license",
          "owner",
          "platform_owner",
          "release",
          "repository",
          "source_url",
        ],
        "ARTIFACT_INVENTORY_ACTION_INVALID",
        `actions[${index}]`,
      );
      const parsedAction = {
        commit_sha: requireStringField(
          action,
          "commit_sha",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
        license: requireStringField(
          action,
          "license",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
        owner: requireStringField(
          action,
          "owner",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
        platform_owner: requireStringField(
          action,
          "platform_owner",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
        release: requireStringField(
          action,
          "release",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
        repository: requireStringField(
          action,
          "repository",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
        source_url: requireStringField(
          action,
          "source_url",
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}]`,
        ),
      };
      if (!/^[a-f\d]{40}$/.test(parsedAction.commit_sha))
        fail(
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}].commit_sha must be an immutable SHA`,
        );
      const expected = CI_ACTIONS.find(
        (candidate) =>
          candidate.owner === parsedAction.owner &&
          candidate.repository === parsedAction.repository,
      );
      if (
        expected === undefined ||
        parsedAction.release !== expected.release ||
        parsedAction.source_url !== expected.source_url ||
        parsedAction.license !== expected.license ||
        parsedAction.platform_owner !== expected.platform_owner
      ) {
        fail(
          "ARTIFACT_INVENTORY_ACTION_INVALID",
          `actions[${index}] owner/repository/release/source/license/platform owner is not approved`,
        );
      }
      return parsedAction;
    },
  );
  if (
    actions.length !== CI_ACTIONS.length ||
    new Set(actions.map((action) => `${action.owner}/${action.repository}`))
      .size !== actions.length
  ) {
    fail(
      "ARTIFACT_INVENTORY_ACTION_INVALID",
      "inventory must contain each approved Action exactly once",
    );
  }

  const artifacts = (artifactValues as unknown[]).map(
    (value, index): InventoryArtifact => {
      const artifact = requireRecord(
        value,
        "ARTIFACT_INVENTORY_SCHEMA_INVALID",
        `artifacts[${index}] must be an object`,
      );
      exactKeys(
        artifact,
        ["classification", "name", "path", "retention_days"],
        "ARTIFACT_INVENTORY_SCHEMA_INVALID",
        `artifacts[${index}]`,
      );
      const retentionDays = artifact.retention_days;
      if (
        !Number.isSafeInteger(retentionDays) ||
        (retentionDays as number) < 1
      ) {
        fail(
          "ARTIFACT_INVENTORY_SCHEMA_INVALID",
          `artifacts[${index}].retention_days must be a positive integer`,
        );
      }
      return {
        classification: requireStringField(
          artifact,
          "classification",
          "ARTIFACT_INVENTORY_SCHEMA_INVALID",
          `artifacts[${index}]`,
        ),
        name: requireStringField(
          artifact,
          "name",
          "ARTIFACT_INVENTORY_SCHEMA_INVALID",
          `artifacts[${index}]`,
        ),
        path: requireStringField(
          artifact,
          "path",
          "ARTIFACT_INVENTORY_SCHEMA_INVALID",
          `artifacts[${index}]`,
        ),
        retention_days: retentionDays as number,
      };
    },
  );
  return { actions, artifacts };
};

interface WorkflowModel {
  jobs: Record<string, unknown>;
  root: Record<string, unknown>;
  steps: Record<string, unknown>[];
}

const requireArray = (
  value: unknown,
  code: string,
  detail: string,
): unknown[] => {
  if (!Array.isArray(value)) fail(code, detail);
  return value as unknown[];
};

const semanticEntries = (value: unknown): { key: string; value: unknown }[] => {
  const entries: { key: string; value: unknown }[] = [];
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate !== "object" || candidate === null) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      entries.push({ key, value: child });
      visit(child);
    }
  };
  visit(value);
  return entries;
};

const workflowStrings = (value: unknown): string[] =>
  semanticEntries(value)
    .map((entry) => entry.value)
    .filter((candidate): candidate is string => typeof candidate === "string");

const workflowModel = (parsed: unknown): WorkflowModel => {
  const root = requireRecord(
    parsed,
    "CI_WORKFLOW_SCHEMA_INVALID",
    "workflow must be a mapping",
  );
  const jobs = requireRecord(
    root.jobs,
    "CI_JOB_POLICY_INVALID",
    "jobs must be a mapping",
  );
  const steps: Record<string, unknown>[] = [];
  for (const [jobName, jobValue] of Object.entries(jobs)) {
    const job = requireRecord(
      jobValue,
      "CI_JOB_POLICY_INVALID",
      `${jobName} must be a mapping`,
    );
    const values = requireArray(
      job.steps,
      "CI_JOB_POLICY_INVALID",
      `${jobName}.steps must be a sequence`,
    );
    for (const [index, value] of values.entries()) {
      steps.push(
        requireRecord(
          value,
          "CI_JOB_POLICY_INVALID",
          `${jobName}.steps[${index}] must be a mapping`,
        ),
      );
    }
  }
  return { jobs, root, steps };
};

const validateWorkflowSafety = (model: WorkflowModel): void => {
  for (const { key } of semanticEntries(model.root)) {
    if (key.toLowerCase() === "continue-on-error")
      fail("CI_CONTINUE_ON_ERROR_FORBIDDEN", "continue-on-error is forbidden");
  }
  const strings = workflowStrings(model.root);
  if (strings.some((value) => /\|\|\s*true\b/i.test(value)))
    fail("CI_ERROR_SUPPRESSION_FORBIDDEN", "|| true is forbidden");
  if (strings.some((value) => /\$\{\{\s*secrets\./i.test(value)))
    fail("CI_SECRET_FORBIDDEN", "repository secrets are forbidden");
  if (
    strings.some((value) =>
      /--(?:no-frozen-lockfile|trust-lockfile)\b/i.test(value),
    )
  )
    fail("CI_INSTALL_INVALID", "lockfile trust/frozen bypass is forbidden");
  if (
    strings.some((value) =>
      /minimum[-A-Za-z]*release[-A-Za-z]*age[-A-Za-z]*exclude/i.test(value),
    )
  )
    fail("CI_INSTALL_INVALID", "release-age exemptions are forbidden");
};

const rejectUnknownKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  code: string,
  label: string,
): void => {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0)
    fail(code, `${label} contains unknown fields: ${unknown.sort().join(",")}`);
};

const validateWorkflowSchema = (model: WorkflowModel): void => {
  exactKeys(
    model.root,
    ["name", "on", "permissions", "concurrency", "env", "jobs"],
    "CI_WORKFLOW_SCHEMA_INVALID",
    "workflow",
  );
  const preflight = requireRecord(
    model.jobs.preflight,
    "CI_JOB_POLICY_INVALID",
    "preflight must be a mapping",
  );
  exactKeys(
    preflight,
    ["runs-on", "timeout-minutes", "steps"],
    "CI_JOB_POLICY_INVALID",
    "preflight",
  );
  const quality = requireRecord(
    model.jobs.quality,
    "CI_JOB_POLICY_INVALID",
    "quality must be a mapping",
  );
  exactKeys(
    quality,
    ["name", "needs", "runs-on", "timeout-minutes", "strategy", "steps"],
    "CI_JOB_POLICY_INVALID",
    "quality",
  );
  const strategy = requireRecord(
    quality.strategy,
    "CI_JOB_POLICY_INVALID",
    "quality.strategy must be a mapping",
  );
  exactKeys(
    strategy,
    ["fail-fast", "matrix"],
    "CI_JOB_POLICY_INVALID",
    "quality.strategy",
  );
  const matrix = requireRecord(
    strategy.matrix,
    "CI_JOB_POLICY_INVALID",
    "quality.strategy.matrix must be a mapping",
  );
  exactKeys(
    matrix,
    ["lane"],
    "CI_JOB_POLICY_INVALID",
    "quality.strategy.matrix",
  );
  for (const [index, step] of model.steps.entries()) {
    rejectUnknownKeys(
      step,
      step.uses === undefined
        ? ["name", "run", "shell"]
        : ["if", "name", "uses", "with"],
      "CI_JOB_POLICY_INVALID",
      `steps[${index}]`,
    );
  }
};

const validateTriggersAndPermissions = (model: WorkflowModel): void => {
  const triggers = requireRecord(
    model.root.on,
    "CI_TRIGGER_INVALID",
    "on must be a mapping",
  );
  const triggerKeys = Object.keys(triggers);
  if (
    triggerKeys.length !== 2 ||
    !triggerKeys.includes("push") ||
    !triggerKeys.includes("pull_request") ||
    triggers.push !== null ||
    triggers.pull_request !== null
  )
    fail(
      "CI_TRIGGER_INVALID",
      "triggers must be exactly push and pull_request",
    );

  const permissions = requireRecord(
    model.root.permissions,
    "CI_PERMISSIONS_EXCESS",
    "permissions must be a mapping",
  );
  if (
    Object.keys(permissions).length !== 1 ||
    permissions.contents !== "read" ||
    semanticEntries(model.jobs).some(
      ({ key }) => key === "permissions" || key === "id-token",
    )
  )
    fail(
      "CI_PERMISSIONS_EXCESS",
      "permissions must be top-level contents: read only",
    );
};

const validateConcurrencyAndTelemetry = (model: WorkflowModel): void => {
  const concurrency = requireRecord(
    model.root.concurrency,
    "CI_CONCURRENCY_INVALID",
    "concurrency must be a mapping",
  );
  if (
    Object.keys(concurrency).length !== 2 ||
    concurrency.group !==
      "ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}" ||
    concurrency["cancel-in-progress"] !==
      "${{ github.event_name == 'pull_request' }}"
  )
    fail(
      "CI_CONCURRENCY_INVALID",
      "PR-aware concurrency cancellation is required",
    );

  const env = requireRecord(
    model.root.env,
    "CI_TELEMETRY_INVALID",
    "env must be a mapping",
  );
  const expected = [
    "NEXT_TELEMETRY_DISABLED",
    "EXPO_NO_TELEMETRY",
    "TURBO_TELEMETRY_DISABLED",
  ];
  if (
    Object.keys(env).length !== expected.length ||
    expected.some((key) => env[key] !== "1")
  )
    fail("CI_TELEMETRY_INVALID", "all telemetry controls are required");
};

const jobSteps = (
  jobs: Record<string, unknown>,
  jobName: string,
): Record<string, unknown>[] => {
  const job = requireRecord(
    jobs[jobName],
    "CI_JOB_POLICY_INVALID",
    `${jobName} must be a mapping`,
  );
  return requireArray(
    job.steps,
    "CI_JOB_POLICY_INVALID",
    `${jobName}.steps must be a sequence`,
  ).map((value, index) =>
    requireRecord(
      value,
      "CI_JOB_POLICY_INVALID",
      `${jobName}.steps[${index}] must be a mapping`,
    ),
  );
};

const runCommands = (steps: readonly Record<string, unknown>[]): string[] =>
  steps
    .map((step) => step.run)
    .filter((value): value is string => typeof value === "string");

const validateJobsAndBootstrap = (model: WorkflowModel): void => {
  if (
    Object.keys(model.jobs).length !== 2 ||
    model.jobs.preflight === undefined ||
    model.jobs.quality === undefined
  )
    fail("CI_JOB_POLICY_INVALID", "jobs must be exactly preflight and quality");
  const preflight = requireRecord(
    model.jobs.preflight,
    "CI_JOB_POLICY_INVALID",
    "preflight must be a mapping",
  );
  const quality = requireRecord(
    model.jobs.quality,
    "CI_JOB_POLICY_INVALID",
    "quality must be a mapping",
  );
  if (
    preflight["runs-on"] !== "ubuntu-24.04" ||
    quality["runs-on"] !== "ubuntu-24.04" ||
    preflight["timeout-minutes"] !== 20 ||
    quality["timeout-minutes"] !== 30 ||
    quality.needs !== "preflight"
  )
    fail("CI_JOB_POLICY_INVALID", "both jobs need fixed runners and timeouts");

  const installCommand =
    "pnpm install --frozen-lockfile --strict-peer-dependencies";
  const allRuns = runCommands(model.steps);
  if (allRuns.filter((run) => run === installCommand).length !== 2)
    fail(
      "CI_INSTALL_INVALID",
      "each job must run the exact strict frozen install",
    );

  const checkoutSteps = model.steps.filter(
    (step) =>
      typeof step.uses === "string" &&
      step.uses.startsWith("actions/checkout@"),
  );
  const setupSteps = model.steps.filter(
    (step) =>
      typeof step.uses === "string" && step.uses.startsWith("pnpm/setup@"),
  );
  if (
    checkoutSteps.length !== 2 ||
    checkoutSteps.some((step) => {
      const withInputs = requireRecord(
        step.with,
        "CI_BOOTSTRAP_INVALID",
        "checkout.with must be a mapping",
      );
      return (
        Object.keys(withInputs).length !== 1 ||
        withInputs["persist-credentials"] !== false
      );
    }) ||
    setupSteps.length !== 2 ||
    setupSteps.some((step) => {
      const withInputs = requireRecord(
        step.with,
        "CI_BOOTSTRAP_INVALID",
        "setup.with must be a mapping",
      );
      return (
        Object.keys(withInputs).length !== 4 ||
        withInputs.version !== "11.4.0" ||
        withInputs.runtime !== "node@24.15.0" ||
        withInputs.install !== false ||
        withInputs.cache !== false
      );
    })
  )
    fail("CI_BOOTSTRAP_INVALID", "checkout and setup inputs must be exact");

  const preflightRuns = runCommands(jobSteps(model.jobs, "preflight"));
  if (
    !preflightRuns.some(
      (run) =>
        run.includes('test "$(node --version)" = "v24.15.0"') &&
        run.includes('test "$(pnpm --version)" = "11.4.0"'),
    ) ||
    !preflightRuns.includes("git diff --exit-code")
  )
    fail(
      "CI_PREFLIGHT_INVALID",
      "toolchain verification and clean diff are required",
    );
};

const validateMatrix = (model: WorkflowModel): void => {
  const quality = requireRecord(
    model.jobs.quality,
    "CI_MATRIX_INVALID",
    "quality must be a mapping",
  );
  const strategy = requireRecord(
    quality.strategy,
    "CI_MATRIX_INVALID",
    "quality.strategy must be a mapping",
  );
  const matrix = requireRecord(
    strategy.matrix,
    "CI_MATRIX_INVALID",
    "quality.strategy.matrix must be a mapping",
  );
  const lanes = requireArray(
    matrix.lane,
    "CI_MATRIX_INVALID",
    "matrix.lane must be a sequence",
  );
  const expectedLanes = [
    "format",
    "lint",
    "typecheck",
    "test",
    "build",
    "boundaries",
    "dependency-audit",
  ];
  if (
    strategy["fail-fast"] !== false ||
    Object.keys(matrix).length !== 1 ||
    lanes.length !== expectedLanes.length ||
    lanes.some((lane, index) => lane !== expectedLanes[index])
  )
    fail("CI_MATRIX_INVALID", "matrix must contain the seven fixed lanes");
  const qualityRuns = runCommands(jobSteps(model.jobs, "quality"));
  const script = qualityRuns.find((run) => run.includes("matrix.lane"));
  if (
    script === undefined ||
    /(?:eval|pnpm|npm|npx|bash|sh)\s+[^\n]*\$\{\{\s*matrix\./i.test(script) ||
    !script.includes('case "${{ matrix.lane }}" in')
  )
    fail(
      "CI_MATRIX_COMMAND_UNSAFE",
      "matrix expressions must only select a fixed case",
    );
  const fixedScript =
    script ?? fail("CI_MATRIX_COMMAND_UNSAFE", "matrix script is missing");
  for (const command of [
    "format) pnpm format:check ;;",
    "lint) pnpm lint ;;",
    "typecheck) pnpm typecheck ;;",
    "build) pnpm build ;;",
    "boundaries) pnpm qa:boundaries ;;",
    "dependency-audit) pnpm qa:dependency-patch ;;",
    "*) exit 64 ;;",
  ])
    if (!fixedScript.includes(command))
      fail("CI_MATRIX_INVALID", `${command} is required exactly once`);
};

const validateTestArtifact = (model: WorkflowModel): void => {
  const allRuns = runCommands(model.steps);
  const lines = allRuns.flatMap((run) =>
    run.split(/\r?\n/).map((line) => line.trim()),
  );
  if (
    lines.filter((line) => line === "set -euo pipefail").length !== 2 ||
    lines.filter(
      (line) => line === "pnpm test 2>&1 | tee test-results/unit.log",
    ).length !== 1 ||
    allRuns.reduce(
      (count, run) => count + (run.match(/\btee\s+/g) ?? []).length,
      0,
    ) !== 1
  )
    fail(
      "CI_TEST_LOG_INVALID",
      "the test lane must preserve pipefail and tee only test-results/unit.log",
    );
  const uploadSteps = model.steps.filter(
    (step) =>
      typeof step.uses === "string" &&
      step.uses.startsWith("actions/upload-artifact@"),
  );
  const upload = uploadSteps[0];
  const withInputs = requireRecord(
    upload?.with,
    "CI_ARTIFACT_POLICY_INVALID",
    "upload.with must be a mapping",
  );
  const uploadPath = withInputs.path;
  if (uploadSteps.length !== 1 || uploadPath !== CI_ARTIFACT.path)
    fail(
      "CI_ARTIFACT_PATH_FORBIDDEN",
      "the only upload path is test-results/unit.log",
    );
  if (
    withInputs.name !== CI_ARTIFACT.name ||
    withInputs["if-no-files-found"] !== "error" ||
    withInputs["retention-days"] !== CI_ARTIFACT.retention_days ||
    upload?.if !== "${{ always() && matrix.lane == 'test' }}"
  )
    fail("CI_ARTIFACT_POLICY_INVALID", "artifact policy must remain exact");
};

const validateWorkflowActions = (
  steps: readonly Record<string, unknown>[],
  inventoryActions: readonly InventoryAction[],
): void => {
  const uses = steps
    .filter((step) => step.uses !== undefined)
    .map((step) => {
      if (typeof step.uses !== "string")
        fail("CI_ACTION_UNPINNED", "uses must be a string");
      const separator = (step.uses as string).lastIndexOf("@");
      if (separator <= 0) fail("CI_ACTION_UNPINNED", step.uses as string);
      return {
        name: (step.uses as string).slice(0, separator),
        ref: (step.uses as string).slice(separator + 1),
      };
    });
  for (const action of uses) {
    if (!/^[a-f\d]{40}$/.test(action.ref))
      fail("CI_ACTION_UNPINNED", `${action.name}@${action.ref}`);
  }
  for (const action of uses) {
    const separator = action.name.indexOf("/");
    const owner = action.name.slice(0, separator);
    const repository = action.name.slice(separator + 1);
    if (
      separator <= 0 ||
      !inventoryActions.some(
        (inventoryAction) =>
          inventoryAction.owner === owner &&
          inventoryAction.repository === repository &&
          inventoryAction.commit_sha === action.ref,
      )
    )
      fail("CI_ACTION_NOT_IN_INVENTORY", `${action.name}@${action.ref}`);
  }
  const expectedCounts = new Map([
    ["actions/checkout", 2],
    ["pnpm/setup", 2],
    ["actions/upload-artifact", 1],
  ]);
  for (const [name, expectedCount] of expectedCounts) {
    const expected = CI_ACTIONS.find(
      (action) => `${action.owner}/${action.repository}` === name,
    );
    const matching = uses.filter((action) => action.name === name);
    if (
      expected === undefined ||
      matching.length !== expectedCount ||
      matching.some((action) => action.ref !== expected.commit_sha)
    ) {
      fail(
        "CI_ACTION_PIN_INVALID",
        `${name} must use its approved immutable SHA`,
      );
    }
  }
  const usedNames = new Set(uses.map((action) => action.name));
  if (
    inventoryActions.some(
      (action) => !usedNames.has(`${action.owner}/${action.repository}`),
    )
  ) {
    fail("CI_ACTION_NOT_IN_INVENTORY", "inventory contains an unused Action");
  }
};

const validateInventoryArtifact = (
  artifacts: readonly InventoryArtifact[],
): void => {
  const artifact = artifacts[0];
  if (
    artifacts.length !== 1 ||
    artifact === undefined ||
    artifact.name !== CI_ARTIFACT.name ||
    artifact.path !== CI_ARTIFACT.path ||
    artifact.classification !== CI_ARTIFACT.classification ||
    artifact.retention_days !== CI_ARTIFACT.retention_days
  ) {
    fail(
      "ARTIFACT_INVENTORY_MISMATCH",
      "inventory must contain exactly the bounded unit-test log",
    );
  }
};

const validateCanonicalSteps = (model: WorkflowModel): void => {
  const preflight = jobSteps(model.jobs, "preflight");
  const quality = jobSteps(model.jobs, "quality");
  if (
    !isDeepStrictEqual(preflight, CANONICAL_PREFLIGHT_STEPS) ||
    !isDeepStrictEqual(quality, CANONICAL_QUALITY_STEPS)
  )
    fail(
      "CI_STEP_POLICY_INVALID",
      "preflight and quality steps must equal the canonical field/value policy",
    );
};

export const checkCiWorkflow = async (
  repositoryRoot = process.cwd(),
): Promise<void> => {
  const root = resolve(repositoryRoot);
  const workflowContent = await readUtf8(
    resolve(root, ".github/workflows/ci.yml"),
    "CI_WORKFLOW_UNREADABLE",
  );
  const parsedWorkflow = parseYaml12(
    workflowContent,
    "CI_WORKFLOW_MALFORMED",
    ".github/workflows/ci.yml",
  );
  const model = workflowModel(parsedWorkflow);
  validateWorkflowSafety(model);
  validateTriggersAndPermissions(model);
  validateWorkflowSchema(model);
  validateConcurrencyAndTelemetry(model);
  const inventory = await parseArtifactInventory(root);
  validateWorkflowActions(model.steps, inventory.actions);
  validateJobsAndBootstrap(model);
  validateMatrix(model);
  validateTestArtifact(model);
  validateInventoryArtifact(inventory.artifacts);
  validateCanonicalSteps(model);
};

export const main = async (args = process.argv.slice(2)): Promise<void> => {
  let scope: "all" | "ci" | "workspace" = "all";
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== "--scope")
      fail("CLI_ARGUMENT_INVALID", "expected --scope workspace|ci");
    const requestedScope = args[1];
    if (requestedScope !== "workspace" && requestedScope !== "ci")
      fail("CLI_ARGUMENT_INVALID", "--scope must be workspace or ci");
    scope = requestedScope as "ci" | "workspace";
  }
  if (scope === "all" || scope === "workspace")
    await checkWorkspaceBoundaries(process.cwd());
  if (scope === "all" || scope === "ci") await checkCiWorkflow();
};

if (isMainModule(import.meta.url)) await runCli(main);
