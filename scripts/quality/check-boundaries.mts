import type { Dirent } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

import ts from "typescript";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";
type WorkspaceKind = "app" | "package";

interface WorkspaceProject {
  dependencies: Map<string, string>;
  directory: string;
  kind: WorkspaceKind;
  manifestPath: string;
  name: string;
}

const DEPENDENCY_SECTIONS: readonly DependencySection[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
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
const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const FORBIDDEN_SOURCE =
  /^(?:bitbucket:|file:|git(?:\+[^:]+)?:|github:|gitlab:|https?:|link:)/i;

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
  if (projects.length === 0)
    fail(
      "WORKSPACE_PROJECTS_MISSING",
      "no apps/* or packages/* manifests found",
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
      if (!EXACT_VERSION.test(version)) {
        fail(
          "DIRECT_DEPENDENCY_NOT_EXACT",
          `${project.manifestPath}: ${name}@${version}`,
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

  const imports: string[] = [];
  const recordSpecifier = (node: ts.Expression | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node))
      imports.push(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      recordSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      recordSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      recordSpecifier(node.arguments[0]);
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
      if (parts.some((part) => EXCLUDED_SOURCE_SEGMENTS.has(part))) continue;
      if (entry.isSymbolicLink()) fail("WORKSPACE_SYMLINK_FORBIDDEN", path);
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
      for (const specifier of sourceImports(path, content)) {
        const match = /^(@huoqiu\/[^/]+)/.exec(specifier);
        const importedPackage = match?.[1];
        if (
          importedPackage !== undefined &&
          importedPackage !== project.name &&
          !project.dependencies.has(importedPackage)
        ) {
          fail(
            "UNDECLARED_WORKSPACE_IMPORT",
            `${path}: ${importedPackage} is not declared by ${project.name}`,
          );
        }
      }
    }
  };

  for (const project of projects) {
    for (const sourceRoot of ["src", "app"]) {
      await visit(project, resolve(project.directory, sourceRoot));
    }
  }
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
    packagePatterns.length !== 2 ||
    packagePatterns[0] !== "- apps/*" ||
    packagePatterns[1] !== "- packages/*"
  ) {
    fail(
      "PNPM_WORKSPACE_GLOBS_INVALID",
      "packages must be exactly apps/* and packages/*",
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
    const json = content.startsWith("# prettier-ignore\n")
      ? content.slice("# prettier-ignore\n".length)
      : content;
    parsed = JSON.parse(json);
  } catch (error) {
    if (error instanceof QualityGateError) throw error;
    const detail =
      error instanceof Error ? error.message : "invalid JSON-compatible YAML";
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

const countExactLine = (lines: readonly string[], expected: string): number =>
  lines.filter((line) => line.trim() === expected).length;

const topLevelBlock = (lines: readonly string[], name: string): string[] => {
  const start = lines.findIndex((line) => line === `${name}:`);
  if (start < 0) return [];
  const end = lines.findIndex(
    (line, index) => index > start && /^\S[^:]*:/.test(line),
  );
  return lines.slice(start + 1, end < 0 ? undefined : end);
};

const jobBlocks = (lines: readonly string[]): Map<string, string[]> => {
  const jobsStart = lines.findIndex((line) => line === "jobs:");
  if (jobsStart < 0) return new Map();
  const blocks = new Map<string, string[]>();
  let activeName: string | undefined;
  for (let index = jobsStart + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (/^\S/.test(line)) break;
    const job = /^ {2}([A-Za-z][A-Za-z0-9_-]*):\s*$/.exec(line)?.[1];
    if (job !== undefined) {
      activeName = job;
      blocks.set(job, []);
      continue;
    }
    if (activeName !== undefined) blocks.get(activeName)?.push(line);
  }
  return blocks;
};

const validateWorkflowSafety = (workflow: string): void => {
  if (/^\s*pull_request_target\s*:/m.test(workflow))
    fail("CI_TRIGGER_INVALID", "pull_request_target is forbidden");
  if (/\bcontinue-on-error\s*:/i.test(workflow))
    fail("CI_CONTINUE_ON_ERROR_FORBIDDEN", "continue-on-error is forbidden");
  if (/\|\|\s*true\b/i.test(workflow))
    fail("CI_ERROR_SUPPRESSION_FORBIDDEN", "|| true is forbidden");
  if (/\$\{\{\s*secrets\./i.test(workflow))
    fail("CI_SECRET_FORBIDDEN", "repository secrets are forbidden");
  if (/--(?:no-frozen-lockfile|trust-lockfile)\b/i.test(workflow))
    fail("CI_INSTALL_INVALID", "lockfile trust/frozen bypass is forbidden");
  if (/minimum[-A-Za-z]*release[-A-Za-z]*age[-A-Za-z]*exclude/i.test(workflow))
    fail("CI_INSTALL_INVALID", "release-age exemptions are forbidden");
};

const validateTriggersAndPermissions = (lines: readonly string[]): void => {
  const triggerKeys = topLevelBlock(lines, "on")
    .map((line) => /^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*$/.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  if (
    triggerKeys.length !== 2 ||
    triggerKeys[0] !== "push" ||
    triggerKeys[1] !== "pull_request"
  ) {
    fail(
      "CI_TRIGGER_INVALID",
      "triggers must be exactly push and pull_request",
    );
  }
  const permissionLines = topLevelBlock(lines, "permissions").filter(
    (line) => line.trim().length > 0,
  );
  if (
    permissionLines.length !== 1 ||
    permissionLines[0]?.trim() !== "contents: read" ||
    lines.some((line) => /^\s+permissions\s*:/.test(line))
  ) {
    fail(
      "CI_PERMISSIONS_EXCESS",
      "permissions must be top-level contents: read only",
    );
  }
};

const validateConcurrencyAndTelemetry = (lines: readonly string[]): void => {
  const concurrency = topLevelBlock(lines, "concurrency")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (
    concurrency.length !== 2 ||
    concurrency[0] !==
      "group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}" ||
    concurrency[1] !==
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}"
  ) {
    fail(
      "CI_CONCURRENCY_INVALID",
      "PR-aware concurrency cancellation is required",
    );
  }
  for (const setting of [
    'NEXT_TELEMETRY_DISABLED: "1"',
    'EXPO_NO_TELEMETRY: "1"',
    'TURBO_TELEMETRY_DISABLED: "1"',
  ]) {
    if (countExactLine(lines, setting) !== 1)
      fail("CI_TELEMETRY_INVALID", `${setting} is required exactly once`);
  }
};

const validateJobsAndBootstrap = (lines: readonly string[]): void => {
  const jobs = jobBlocks(lines);
  if (jobs.size !== 2 || !jobs.has("preflight") || !jobs.has("quality")) {
    fail("CI_JOB_POLICY_INVALID", "jobs must be exactly preflight and quality");
  }
  const preflight = jobs.get("preflight") ?? [];
  const quality = jobs.get("quality") ?? [];
  if (
    countExactLine(preflight, "runs-on: ubuntu-24.04") !== 1 ||
    countExactLine(quality, "runs-on: ubuntu-24.04") !== 1 ||
    countExactLine(preflight, "timeout-minutes: 20") !== 1 ||
    countExactLine(quality, "timeout-minutes: 30") !== 1
  ) {
    fail("CI_JOB_POLICY_INVALID", "both jobs need fixed runners and timeouts");
  }
  const requiredBootstrapLines = new Map([
    ["persist-credentials: false", 2],
    ["version: 11.4.0", 2],
    ["runtime: node@24.15.0", 2],
    ["install: false", 2],
    ["cache: false", 2],
  ]);
  for (const [line, expectedCount] of requiredBootstrapLines) {
    if (countExactLine(lines, line) !== expectedCount)
      fail("CI_BOOTSTRAP_INVALID", `${line} must occur ${expectedCount} times`);
  }
  if (
    countExactLine(
      lines,
      "run: pnpm install --frozen-lockfile --strict-peer-dependencies",
    ) !== 2
  ) {
    fail(
      "CI_INSTALL_INVALID",
      "each job must run the exact strict frozen install",
    );
  }
  for (const command of [
    'test "$(node --version)" = "v24.15.0"',
    'test "$(pnpm --version)" = "11.4.0"',
    "run: git diff --exit-code",
  ]) {
    if (countExactLine(preflight, command) !== 1)
      fail("CI_PREFLIGHT_INVALID", `${command} is required in preflight`);
  }
};

const validateMatrix = (lines: readonly string[], workflow: string): void => {
  if (
    countExactLine(
      lines,
      "lane: [format, lint, typecheck, test, build, boundaries]",
    ) !== 1
  ) {
    fail("CI_MATRIX_INVALID", "matrix must contain the six fixed lanes");
  }
  if (
    /(?:eval|pnpm|npm|npx|bash|sh)\s+[^\n]*\$\{\{\s*matrix\./i.test(workflow) ||
    countExactLine(lines, 'case "${{ matrix.lane }}" in') !== 1
  ) {
    fail(
      "CI_MATRIX_COMMAND_UNSAFE",
      "matrix expressions must only select a fixed case",
    );
  }
  for (const command of [
    "format) pnpm format:check ;;",
    "lint) pnpm lint ;;",
    "typecheck) pnpm typecheck ;;",
    "build) pnpm build ;;",
    "boundaries) pnpm qa:boundaries ;;",
    "*) exit 64 ;;",
  ]) {
    if (countExactLine(lines, command) !== 1)
      fail("CI_MATRIX_INVALID", `${command} is required exactly once`);
  }
};

const validateTestArtifact = (
  lines: readonly string[],
  workflow: string,
): void => {
  if (
    countExactLine(lines, "set -euo pipefail") !== 2 ||
    countExactLine(lines, "pnpm test 2>&1 | tee test-results/unit.log") !== 1 ||
    (workflow.match(/\btee\s+/g) ?? []).length !== 1
  ) {
    fail(
      "CI_TEST_LOG_INVALID",
      "the test lane must preserve pipefail and tee only test-results/unit.log",
    );
  }
  const uploadPaths = lines
    .map((line) => /^\s+path:\s*(.+?)\s*$/.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  const uploadPath = uploadPaths[0];
  if (uploadPaths.length !== 1 || uploadPath !== CI_ARTIFACT.path) {
    return fail(
      "CI_ARTIFACT_PATH_FORBIDDEN",
      "the only upload path is test-results/unit.log",
    );
  }
  for (const forbidden of [
    /(?:^|\/)\.env/i,
    /(?:^|\/)(?:database|db)[._-]?(?:dump|sql)/i,
    /(?:^|\/)(?:node_modules|\.next|dist|evidence)(?:\/|$)/i,
    /[*?{}[\]]/,
  ]) {
    if (forbidden.test(uploadPath))
      fail("CI_ARTIFACT_PATH_FORBIDDEN", uploadPath);
  }
  for (const setting of [
    "if: ${{ always() && matrix.lane == 'test' }}",
    `name: ${CI_ARTIFACT.name}`,
    "if-no-files-found: error",
    `retention-days: ${CI_ARTIFACT.retention_days}`,
  ]) {
    if (countExactLine(lines, setting) !== 1)
      fail("CI_ARTIFACT_POLICY_INVALID", `${setting} is required exactly once`);
  }
};

const validateWorkflowActions = (
  lines: readonly string[],
  inventoryActions: readonly InventoryAction[],
): void => {
  const uses = lines
    .map((line) =>
      /^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)(?:\s+#.*)?$/.exec(line),
    )
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: match[1] as string, ref: match[2] as string }));
  for (const action of uses) {
    if (!/^[a-f\d]{40}$/.test(action.ref))
      fail("CI_ACTION_UNPINNED", `${action.name}@${action.ref}`);
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
    ) {
      fail("CI_ACTION_NOT_IN_INVENTORY", `${action.name}@${action.ref}`);
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

export const checkCiWorkflow = async (
  repositoryRoot = process.cwd(),
): Promise<void> => {
  const root = resolve(repositoryRoot);
  const workflow = await readUtf8(
    resolve(root, ".github/workflows/ci.yml"),
    "CI_WORKFLOW_UNREADABLE",
  );
  validateWorkflowSafety(workflow);
  const lines = workflow
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, "").replace(/\s+$/, ""));
  validateTriggersAndPermissions(lines);
  validateConcurrencyAndTelemetry(lines);
  validateJobsAndBootstrap(lines);
  validateMatrix(lines, workflow);
  validateTestArtifact(lines, workflow);
  const inventory = await parseArtifactInventory(root);
  validateWorkflowActions(lines, inventory.actions);
  validateInventoryArtifact(inventory.artifacts);
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
