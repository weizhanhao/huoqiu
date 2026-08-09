import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  MOBILE_D0_TOOLCHAIN_REGISTRY_PATH,
  mobileD0RequiredToolNames,
  mobileD0SafeEnvironment,
  mobileD0VersionContract,
  parseAndroidMobileTarget,
  parseIosMobileTarget,
  parseMaestroFlowTotals,
  parseMobileD0Platform,
  resolveProtectedMobileTools,
  resolveTrustedTools,
  runMobileD0Evidence,
  trustedToolCandidates,
  verifyToolIdentity,
  verifyTrustedToolIdentity,
  type CommandRequest,
  type CommandResult,
  type MobileD0EvidenceDependencies,
  type MobileD0ToolName,
  type ToolIdentity,
  type ToolSet,
  type ToolchainResolverDependencies,
} from "../mobile-d0-evidence.mts";

const SHA = "a".repeat(40);
const sourceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const protectedRoot = "/opt/huoqiu-quality/mobile-d0";
const protectedPaths = {
  adb: `${protectedRoot}/android/platform-tools/adb`,
  androidGradleSeedMarker: `${protectedRoot}/android/gradle-home-seed/.huoqiu-reviewed`,
  iosCacheSeedMarker: `${protectedRoot}/ios/native-home-seed/.huoqiu-reviewed`,
  iosPod: `${protectedRoot}/ios/bin/pod`,
  java: `${protectedRoot}/java/bin/java`,
  maestro: `${protectedRoot}/maestro/maestro-cli.jar`,
  node: `${protectedRoot}/node/bin/node`,
  pnpm: `${protectedRoot}/pnpm/pnpm.cjs`,
  pnpmStore: `${protectedRoot}/pnpm/store`,
  pnpmStoreFile: `${protectedRoot}/pnpm/store/v10/files/00/lockfile-package`,
} as const;

const digest = (contents: string): string =>
  createHash("sha256").update(contents).digest("hex");

const requiredIdentity = (
  tools: ToolSet,
  name: MobileD0ToolName,
): ToolIdentity => {
  const identity = tools[name];
  if (identity === undefined) throw new Error(`missing test tool: ${name}`);
  return identity;
};

const requiredRegistryEntry = <T>(
  tools: Readonly<Record<string, T>>,
  name: string,
): T => {
  const entry = tools[name];
  if (entry === undefined) throw new Error(`missing registry fixture: ${name}`);
  return entry;
};

const protectedAndroidRegistry = (
  overrides: Readonly<Record<string, unknown>> = {},
): {
  dependencies: ToolchainResolverDependencies;
  files: Map<string, string>;
  registry: Record<string, unknown>;
} => {
  const files = new Map<string, string>([
    ["/usr/bin/git", "trusted git"],
    ["/usr/bin/tar", "trusted tar"],
    ["/usr/bin/xcrun", "trusted xcrun"],
    [protectedPaths.node, "trusted node"],
    [protectedPaths.pnpm, "trusted pnpm"],
    [protectedPaths.pnpmStoreFile, "trusted offline package"],
    [protectedPaths.adb, "trusted adb"],
    [protectedPaths.androidGradleSeedMarker, "reviewed gradle seed"],
    [protectedPaths.iosPod, "trusted CocoaPods launcher"],
    [protectedPaths.iosCacheSeedMarker, "reviewed CocoaPods cache seed"],
    [protectedPaths.java, "trusted java"],
    [protectedPaths.maestro, "trusted maestro"],
  ]);
  const component = (path: string): Record<string, string> => ({
    path,
    sha256: digest(files.get(path) ?? ""),
  });
  const registry: Record<string, unknown> = {
    schema_version: 1,
    tools: {
      adb: {
        components: [
          component(protectedPaths.adb),
          component(protectedPaths.androidGradleSeedMarker),
        ],
        expected_version: "Android Debug Bridge version 1.0.41",
      },
      git: {
        components: [component("/usr/bin/git")],
        expected_version: "git version 2.50.0",
      },
      maestro: {
        components: [
          component(protectedPaths.java),
          component(protectedPaths.maestro),
        ],
        expected_version: "2.0.0",
      },
      node: {
        components: [component(protectedPaths.node)],
        expected_version: "v24.15.0",
      },
      pnpm: {
        components: [
          component(protectedPaths.node),
          component(protectedPaths.pnpm),
          component(protectedPaths.pnpmStoreFile),
        ],
        expected_version: "11.4.0",
      },
      pod: {
        components: [
          component(protectedPaths.iosPod),
          component(protectedPaths.iosCacheSeedMarker),
        ],
        expected_version: "1.16.2",
      },
      tar: {
        components: [component("/usr/bin/tar")],
        expected_version: "bsdtar 3.5.3",
      },
      xcrun: {
        components: [component("/usr/bin/xcrun")],
        expected_version: "xcrun version 70.",
      },
    },
    ...overrides,
  };
  const directories = (): Set<string> => {
    const result = new Set<string>(["/", protectedPaths.pnpmStore]);
    for (const path of [MOBILE_D0_TOOLCHAIN_REGISTRY_PATH, ...files.keys()]) {
      let cursor = dirname(path);
      while (!result.has(cursor)) {
        result.add(cursor);
        cursor = dirname(cursor);
      }
    }
    return result;
  };
  return {
    dependencies: {
      readDirectory: vi.fn(async (path) => {
        const prefix = path === "/" ? "/" : `${path}/`;
        return [
          ...new Set(
            [...directories(), ...files.keys()]
              .filter((candidate) => candidate.startsWith(prefix))
              .map((candidate) => candidate.slice(prefix.length).split("/")[0])
              .filter(
                (name): name is string => name !== undefined && name.length > 0,
              ),
          ),
        ].sort();
      }),
      readBytes: vi.fn(async (path) => {
        if (path === MOBILE_D0_TOOLCHAIN_REGISTRY_PATH)
          return Buffer.from(JSON.stringify(registry));
        const contents = files.get(path);
        if (contents === undefined) throw new Error(`ENOENT: ${path}`);
        return Buffer.from(contents);
      }),
      realpath: vi.fn(async (path) => path),
      stat: vi.fn(async (path) => {
        const isFile =
          path === MOBILE_D0_TOOLCHAIN_REGISTRY_PATH || files.has(path);
        const isDirectory = directories().has(path);
        if (!isFile && !isDirectory) throw new Error(`ENOENT: ${path}`);
        return {
          isDirectory: () => isDirectory,
          isFile: () => isFile,
          mode: isFile ? 0o100755 : 0o40755,
          uid: 0,
        };
      }),
    },
    files,
    registry,
  };
};

const result = (overrides: Partial<CommandResult> = {}): CommandResult => ({
  exitCode: 0,
  signal: null,
  stderr: "",
  stdout: "",
  ...overrides,
});

const versionResults: Readonly<Record<string, CommandResult>> = {
  "tool-adb-version": result({
    stdout: "Android Debug Bridge version 1.0.41\n",
  }),
  "tool-git-version": result({ stdout: "git version 2.50.0\n" }),
  "tool-maestro-version": result({ stdout: "2.0.0\n" }),
  "tool-node-version": result({ stdout: "v24.15.0\n" }),
  "tool-pnpm-version": result({ stdout: "11.4.0\n" }),
  "tool-pod-version": result({ stdout: "1.16.2\n" }),
  "tool-tar-version": result({ stdout: "bsdtar 3.5.3\n" }),
  "tool-xcrun-version": result({ stdout: "xcrun version 70.\n" }),
};

const actionLabels = (requests: readonly CommandRequest[]): string[] =>
  requests
    .map(({ label }) => label)
    .filter((label) => !label.startsWith("tool-"));

const harness = (
  responses: Readonly<Record<string, CommandResult>>,
): {
  artifacts: Map<string, string>;
  cleanup: ReturnType<typeof vi.fn>;
  dependencies: MobileD0EvidenceDependencies;
  output: string[];
  requests: CommandRequest[];
} => {
  const artifacts = new Map<string, string>();
  const cleanup = vi.fn(async () => undefined);
  const output: string[] = [];
  const requests: CommandRequest[] = [];
  return {
    artifacts,
    cleanup,
    dependencies: {
      artifactDirectory: (commit, platform) =>
        `/evidence/${commit}/mobile-d0/${platform}`,
      createSnapshot: vi.fn(async () => ({
        archivePath: "/temporary/source.tar",
        cleanup,
        root: "/snapshot",
        temporaryRoot: "/temporary",
      })),
      discoverCommit: vi.fn(async () => SHA),
      ensureArtifactDirectory: vi.fn(async () => undefined),
      now: () => new Date("2026-08-08T16:00:00.000Z"),
      output: (line) => output.push(line),
      repositoryRoot: "/repository",
      resolveTools: vi.fn(async (platform) => {
        const names = [
          "git",
          "tar",
          "pnpm",
          ...(platform === "ios" ? ["pod"] : []),
          "node",
          "maestro",
          platform === "ios" ? "xcrun" : "adb",
        ];
        return Object.fromEntries(
          names.map((name) => [
            name,
            {
              components: [
                {
                  mode: 0o100755,
                  path: `/trusted/${name}`,
                  realpath: `/trusted/${name}`,
                  sha256: "b".repeat(64),
                  uid: 0,
                },
              ],
              executable: `/trusted/${name}`,
              expectedVersion:
                versionResults[`tool-${name}-version`]?.stdout.trim() ?? "",
              name,
              prefixArgs: [],
              realpath: `/trusted/${name}`,
              registry: {
                mode: 0o100644,
                path: MOBILE_D0_TOOLCHAIN_REGISTRY_PATH,
                realpath: MOBILE_D0_TOOLCHAIN_REGISTRY_PATH,
                sha256: "c".repeat(64),
                uid: 0,
              },
              sha256: "b".repeat(64),
            },
          ]),
        );
      }),
      runCommand: vi.fn(async (request) => {
        requests.push(request);
        return (
          responses[request.label] ??
          versionResults[request.label] ??
          (request.label === "snapshot-archive" ||
          request.label === "snapshot-extract"
            ? result()
            : result({ exitCode: 127 }))
        );
      }),
      verifyToolIdentity: vi.fn(async () => true),
      writeArtifact: vi.fn(async (directory, name, contents) => {
        artifacts.set(`${directory}/${name}`, contents);
      }),
    },
    output,
    requests,
  };
};

describe("D0 mobile evidence", () => {
  it("resolves the protected Android pnpm, adb, and Maestro launch identities", async () => {
    const resolver = protectedAndroidRegistry();

    const tools = await resolveTrustedTools("android", resolver.dependencies);

    expect(trustedToolCandidates("android")).toMatchObject({
      adb: [protectedPaths.adb],
      maestro: [protectedPaths.maestro],
      pnpm: [protectedPaths.pnpm],
    });
    expect(tools).toMatchObject({
      adb: {
        executable: protectedPaths.adb,
        prefixArgs: [],
      },
      maestro: {
        executable: protectedPaths.java,
        prefixArgs: ["-jar", protectedPaths.maestro],
        realpath: protectedPaths.maestro,
      },
      pnpm: {
        executable: protectedPaths.node,
        prefixArgs: [protectedPaths.pnpm],
        realpath: protectedPaths.pnpm,
      },
    });
    expect(tools.pnpm?.components.map(({ path }) => path)).toContain(
      protectedPaths.pnpmStoreFile,
    );
  });

  it("resolves the protected iOS pnpm, xcrun, and Maestro identities", async () => {
    const resolver = protectedAndroidRegistry();

    const tools = await resolveTrustedTools("ios", resolver.dependencies);

    expect(tools).toMatchObject({
      maestro: {
        executable: protectedPaths.java,
        prefixArgs: ["-jar", protectedPaths.maestro],
      },
      pnpm: {
        executable: protectedPaths.node,
        prefixArgs: [protectedPaths.pnpm],
      },
      pod: {
        executable: protectedPaths.iosPod,
        prefixArgs: [],
      },
      xcrun: {
        executable: "/usr/bin/xcrun",
        prefixArgs: [],
      },
    });
  });

  it("exports a reusable immutable resolver result and identity verifier", async () => {
    const resolver = protectedAndroidRegistry();

    const tools = await resolveTrustedTools("android", resolver.dependencies);

    expect(resolveProtectedMobileTools).toBeTypeOf("function");
    expect(verifyToolIdentity).toBeTypeOf("function");
    expect(Object.isFrozen(tools)).toBe(true);
    expect(Object.isFrozen(tools.pnpm)).toBe(true);
    expect(Object.isFrozen(tools.pnpm?.components)).toBe(true);
    expect(Object.isFrozen(tools.pnpm?.prefixArgs)).toBe(true);
    await expect(
      verifyTrustedToolIdentity(
        requiredIdentity(tools, "pnpm"),
        resolver.dependencies,
      ),
    ).resolves.toBe(true);
  });

  it("resolves and verifies independently of checkout and .git state", async () => {
    const resolver = protectedAndroidRegistry();

    const tools = await resolveTrustedTools("android", resolver.dependencies);
    await expect(
      verifyTrustedToolIdentity(
        requiredIdentity(tools, "pnpm"),
        resolver.dependencies,
      ),
    ).resolves.toBe(true);

    const touchedPaths = [
      ...vi.mocked(resolver.dependencies.readBytes).mock.calls,
      ...vi.mocked(resolver.dependencies.readDirectory).mock.calls,
      ...vi.mocked(resolver.dependencies.realpath).mock.calls,
      ...vi.mocked(resolver.dependencies.stat).mock.calls,
    ].flat();
    expect(touchedPaths.some((path) => path.includes(".git"))).toBe(false);
    expect(touchedPaths.some((path) => path.startsWith(sourceRoot))).toBe(
      false,
    );
  });

  it("fails closed for an invalid runtime platform at the reusable resolver boundary", async () => {
    const resolver = protectedAndroidRegistry();

    await expect(
      resolveTrustedTools("web" as unknown as "android", resolver.dependencies),
    ).resolves.toEqual({});
    expect(() =>
      mobileD0RequiredToolNames("web" as unknown as "android"),
    ).toThrow("platform must be ios or android");
    expect(() =>
      mobileD0SafeEnvironment("web" as unknown as "android"),
    ).toThrow("platform must be ios or android");
  });

  it("exports pure prepared-snapshot integration helpers", () => {
    expect(parseMobileD0Platform(["--platform", "ios"])).toBe("ios");
    expect(
      parseAndroidMobileTarget(
        "List of devices attached\nemulator-5554\tdevice\n",
      ),
    ).toEqual({ id: "emulator-5554" });
    expect(
      parseIosMobileTarget(
        JSON.stringify({
          devices: {
            runtime: [
              {
                isAvailable: true,
                state: "Booted",
                udid: "IOS-UDID",
              },
            ],
          },
        }),
      ),
    ).toEqual({ id: "IOS-UDID", state: "Booted" });
    expect(mobileD0VersionContract("pod").args).toEqual(["--version"]);
    expect(mobileD0SafeEnvironment("android")).toMatchObject({
      ANDROID_SDK_ROOT: `${protectedRoot}/android`,
      JAVA_HOME: `${protectedRoot}/java`,
      NODE: protectedPaths.node,
    });
    expect(parseMaestroFlowTotals("1 Flow Passed\n")).toEqual({
      failed: 0,
      passed: 1,
      skipped: 0,
    });
  });

  it("rejects a copied identity with forged prefix arguments", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = await resolveTrustedTools("android", resolver.dependencies);
    const forgedIdentity = {
      ...requiredIdentity(tools, "pnpm"),
      prefixArgs: [join(sourceRoot, "scripts", "forged-pnpm.cjs")],
    };

    await expect(
      verifyTrustedToolIdentity(forgedIdentity, resolver.dependencies),
    ).resolves.toBe(false);
  });

  it("rejects a copied identity with a forged expected version", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = await resolveTrustedTools("android", resolver.dependencies);

    await expect(
      verifyTrustedToolIdentity(
        {
          ...requiredIdentity(tools, "maestro"),
          expectedVersion: "2.1.0",
        },
        resolver.dependencies,
      ),
    ).resolves.toBe(false);
  });

  it("rejects a registry symlink whose realpath escapes the protected prefix", async () => {
    const resolver = protectedAndroidRegistry();
    const originalRealpath = resolver.dependencies.realpath;
    resolver.dependencies.realpath = vi.fn(async (path) =>
      path === MOBILE_D0_TOOLCHAIN_REGISTRY_PATH
        ? "/tmp/attacker-controlled/toolchain.v1.json"
        : await originalRealpath(path),
    );

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a protected root symlink even when its target is root-owned", async () => {
    const resolver = protectedAndroidRegistry();
    const escapedRoot = "/srv/huoqiu-quality/mobile-d0";
    const escapedRegistry = `${escapedRoot}/toolchain.v1.json`;
    const originalReadBytes = resolver.dependencies.readBytes;
    const originalRealpath = resolver.dependencies.realpath;
    const originalStat = resolver.dependencies.stat;
    resolver.dependencies.realpath = vi.fn(async (path) => {
      if (path === protectedRoot) return escapedRoot;
      if (path === MOBILE_D0_TOOLCHAIN_REGISTRY_PATH) return escapedRegistry;
      return await originalRealpath(path);
    });
    resolver.dependencies.readBytes = vi.fn(async (path) =>
      path === escapedRegistry
        ? Buffer.from(JSON.stringify(resolver.registry))
        : await originalReadBytes(path),
    );
    resolver.dependencies.stat = vi.fn(async (path) => {
      if (path === escapedRegistry || escapedRegistry.startsWith(`${path}/`))
        return {
          isDirectory: () => path !== escapedRegistry,
          isFile: () => path === escapedRegistry,
          mode: path === escapedRegistry ? 0o100644 : 0o40755,
          uid: 0,
        };
      return await originalStat(path);
    });

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it.each([
    {
      label: "non-root-owned registry",
      mode: 0o100644,
      path: MOBILE_D0_TOOLCHAIN_REGISTRY_PATH,
      uid: 501,
    },
    {
      label: "group-writable registry",
      mode: 0o100664,
      path: MOBILE_D0_TOOLCHAIN_REGISTRY_PATH,
      uid: 0,
    },
    {
      label: "group-writable registry parent",
      mode: 0o40775,
      path: protectedRoot,
      uid: 0,
    },
  ])("rejects a $label", async ({ mode, path, uid }) => {
    const resolver = protectedAndroidRegistry();
    const originalStat = resolver.dependencies.stat;
    resolver.dependencies.stat = vi.fn(async (candidate) => {
      const metadata = await originalStat(candidate);
      return candidate === path ? { ...metadata, mode, uid } : metadata;
    });

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a registry containing a repository-owned tool component", async () => {
    const resolver = protectedAndroidRegistry();
    const repositoryComponent = join(sourceRoot, "scripts", "forged-pnpm.cjs");
    resolver.files.set(repositoryComponent, "forged pnpm");
    const tools = resolver.registry.tools as Record<
      string,
      { components: Record<string, string>[] }
    >;
    tools.pnpm?.components.splice(1, 1, {
      path: repositoryComponent,
      sha256: digest("forged pnpm"),
    });
    const originalStat = resolver.dependencies.stat;
    resolver.dependencies.stat = vi.fn(async (path) => {
      if (
        path === repositoryComponent ||
        repositoryComponent.startsWith(`${path}/`)
      )
        return {
          isDirectory: () => path !== repositoryComponent,
          isFile: () => path === repositoryComponent,
          mode: path === repositoryComponent ? 0o100755 : 0o40755,
          uid: 0,
        };
      return await originalStat(path);
    });

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects registry-supplied prefix arguments", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = resolver.registry.tools as Record<
      string,
      Record<string, unknown>
    >;
    tools.pnpm = {
      ...tools.pnpm,
      prefix_args: [join(sourceRoot, "scripts", "forged-pnpm.cjs")],
    };

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects control characters in an expected registry version", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = resolver.registry.tools as Record<
      string,
      Record<string, unknown>
    >;
    tools.pnpm = {
      ...tools.pnpm,
      expected_version: "11.4.0\u001bforged suffix",
    };

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("invalidates a resolved tool when the protected registry changes before reuse", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = await resolveTrustedTools("android", resolver.dependencies);
    const registryTools = resolver.registry.tools as Record<
      string,
      Record<string, unknown>
    >;
    registryTools.pnpm = {
      ...registryTools.pnpm,
      expected_version: "11.4.1",
    };

    await expect(
      verifyTrustedToolIdentity(
        requiredIdentity(tools, "pnpm"),
        resolver.dependencies,
      ),
    ).resolves.toBe(false);
  });

  it("invalidates pnpm when an offline-store component changes before reuse", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = await resolveTrustedTools("android", resolver.dependencies);
    resolver.files.set(
      protectedPaths.pnpmStoreFile,
      "tampered offline package",
    );

    await expect(
      verifyTrustedToolIdentity(
        requiredIdentity(tools, "pnpm"),
        resolver.dependencies,
      ),
    ).resolves.toBe(false);
  });

  it("rejects a runtime version that differs from the protected registry pin", async () => {
    const testHarness = harness({
      "tool-maestro-version": result({ stdout: "2.1.0\n" }),
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({
        stdout: "List of devices attached\nemulator-5554\tdevice\n",
      }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=maestro_unavailable:tool_identity_invalid",
    ]);
    expect(actionLabels(testHarness.requests)).not.toContain("maestro-flow");
  });

  it("rejects a home-directory tool component", async () => {
    const resolver = protectedAndroidRegistry();
    const homeAdb = "/Users/runner/Library/Android/sdk/platform-tools/adb";
    const tools = resolver.registry.tools as Record<
      string,
      { components: Record<string, string>[] }
    >;
    requiredRegistryEntry(tools, "adb").components = [
      { path: homeAdb, sha256: digest("forged home adb") },
    ];

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a group-writable protected tool component", async () => {
    const resolver = protectedAndroidRegistry();
    const originalStat = resolver.dependencies.stat;
    resolver.dependencies.stat = vi.fn(async (path) => {
      const metadata = await originalStat(path);
      return path === protectedPaths.adb
        ? { ...metadata, mode: 0o100775 }
        : metadata;
    });

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a protected component symlink that resolves into a home directory", async () => {
    const resolver = protectedAndroidRegistry();
    const escapedAdb = "/Users/runner/forged-adb";
    resolver.files.set(escapedAdb, "trusted adb");
    const originalRealpath = resolver.dependencies.realpath;
    const originalStat = resolver.dependencies.stat;
    resolver.dependencies.realpath = vi.fn(async (path) =>
      path === protectedPaths.adb ? escapedAdb : await originalRealpath(path),
    );
    resolver.dependencies.stat = vi.fn(async (path) => {
      if (path === escapedAdb || escapedAdb.startsWith(`${path}/`))
        return {
          isDirectory: () => path !== escapedAdb,
          isFile: () => path === escapedAdb,
          mode: path === escapedAdb ? 0o100755 : 0o40755,
          uid: 0,
        };
      return await originalStat(path);
    });

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a composite tool declaration missing its fixed launcher", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = resolver.registry.tools as Record<
      string,
      { components: Record<string, string>[] }
    >;
    requiredRegistryEntry(tools, "maestro").components.shift();

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects an undeclared file in a protected distribution closure", async () => {
    const resolver = protectedAndroidRegistry();
    resolver.files.set(
      `${protectedRoot}/pnpm/lib/unhashed-runtime.cjs`,
      "unhashed runtime dependency",
    );

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a writable protected pnpm store", async () => {
    const resolver = protectedAndroidRegistry();
    const originalStat = resolver.dependencies.stat;
    resolver.dependencies.stat = vi.fn(async (path) => {
      const metadata = await originalStat(path);
      return path === protectedPaths.pnpmStore
        ? { ...metadata, mode: 0o40775 }
        : metadata;
    });

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it("rejects a protected pnpm store symlink that escapes to a home directory", async () => {
    const resolver = protectedAndroidRegistry();
    const originalRealpath = resolver.dependencies.realpath;
    resolver.dependencies.realpath = vi.fn(async (path) =>
      path === protectedPaths.pnpmStore
        ? "/Users/runner/.pnpm-store"
        : await originalRealpath(path),
    );

    await expect(
      resolveTrustedTools("android", resolver.dependencies),
    ).resolves.toEqual({});
  });

  it.each([
    {
      component: protectedPaths.androidGradleSeedMarker,
      platform: "android" as const,
      tool: "adb",
    },
    {
      component: protectedPaths.iosCacheSeedMarker,
      platform: "ios" as const,
      tool: "pod",
    },
  ])(
    "rejects $platform when its protected native cache seed is absent",
    async ({ component, platform, tool }) => {
      const resolver = protectedAndroidRegistry();
      resolver.files.delete(component);
      const tools = resolver.registry.tools as Record<
        string,
        { components: Record<string, string>[] }
      >;
      requiredRegistryEntry(tools, tool).components = requiredRegistryEntry(
        tools,
        tool,
      ).components.filter(({ path }) => path !== component);

      await expect(
        resolveTrustedTools(platform, resolver.dependencies),
      ).resolves.toEqual({});
    },
  );

  it("independently rejects a forged identity whose canonical entrypoint escapes its root", async () => {
    const resolver = protectedAndroidRegistry();
    const tools = await resolveTrustedTools("android", resolver.dependencies);
    const original = requiredIdentity(tools, "adb");
    const escapedAdb = "/usr/bin/forged-adb";
    resolver.files.set(escapedAdb, "trusted adb");
    const originalRealpath = resolver.dependencies.realpath;
    resolver.dependencies.realpath = vi.fn(async (path) =>
      path === protectedPaths.adb ? escapedAdb : await originalRealpath(path),
    );
    const originalComponent = original.components[0];
    if (originalComponent === undefined)
      throw new Error("missing adb component identity");
    const forgedComponent = {
      ...originalComponent,
      realpath: escapedAdb,
    };

    await expect(
      verifyTrustedToolIdentity(
        {
          ...original,
          components: [forgedComponent],
          executable: escapedAdb,
          realpath: escapedAdb,
        },
        resolver.dependencies,
      ),
    ).resolves.toBe(false);
  });

  it("writes NOT_VERIFIED evidence when the trusted registry yields no tools", async () => {
    const testHarness = harness({});
    testHarness.dependencies.resolveTools = vi.fn(async () => ({}));

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=tool_identity_missing:node",
    ]);
    expect(
      JSON.parse(
        testHarness.artifacts.get(
          `/evidence/${SHA}/mobile-d0/android/summary.json`,
        ) ?? "null",
      ),
    ).toMatchObject({ verified: false });
    expect(actionLabels(testHarness.requests)).toEqual([]);
  });

  it("installs the snapshot offline from the fixed protected pnpm store", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({ stdout: "List of devices attached\n" }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(
      testHarness.requests.find(({ label }) => label === "snapshot-install")
        ?.args,
    ).toEqual([
      "install",
      "--frozen-lockfile",
      "--offline",
      "--strict-peer-dependencies",
      "--store-dir",
      `${protectedRoot}/pnpm/store`,
      "--package-import-method=copy",
      "--config.verify-store-integrity=true",
      "--config.side-effects-cache=false",
    ]);
  });

  it("executes Expo through the protected Node identity without a pnpm exec shim", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({ stdout: "List of devices attached\n" }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    for (const label of ["expo-export", "expo-prebuild"]) {
      const request = testHarness.requests.find(
        (candidate) => candidate.label === label,
      );
      expect(request?.executable).toBe("/trusted/node");
      expect(request?.args[0]).toBe(
        "/snapshot/apps/mobile/node_modules/expo/bin/cli",
      );
      expect(request?.args).not.toContain("exec");
    }
  });

  it("rejects unknown or malformed platform arguments before running tools", async () => {
    const testHarness = harness({});

    await expect(
      runMobileD0Evidence(["--platform", "web"], testHarness.dependencies),
    ).rejects.toThrow("CLI_ARGUMENT_INVALID");
    await expect(
      runMobileD0Evidence(
        ["--platform", "ios", "--platform", "android"],
        testHarness.dependencies,
      ),
    ).rejects.toThrow("CLI_ARGUMENT_INVALID");
    expect(testHarness.requests).toHaveLength(0);
  });

  it("refuses to certify an uncommitted worktree", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result({ stdout: " M apps/mobile/app/search.tsx\n" }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "ios"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_CONTEXT_INVALID");

    expect(actionLabels(testHarness.requests)).toEqual([
      "git-head",
      "git-status",
    ]);
    expect(testHarness.output).toHaveLength(0);
  });

  it("records honest fallback evidence when iOS tooling is unavailable", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "ios-probe": result({
        exitCode: 72,
        stderr: "xcrun: simctl unavailable\n",
      }),
      "snapshot-install": result({ stdout: "installed\n" }),
      "expo-export": result({ stdout: "exported 9 routes\n" }),
      "expo-prebuild": result({ stdout: "generated ios\n" }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "ios"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(actionLabels(testHarness.requests)).toEqual([
      "git-head",
      "git-status",
      "ios-probe",
      "snapshot-archive",
      "snapshot-extract",
      "snapshot-install",
      "expo-export",
      "expo-prebuild",
    ]);
    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=ios reason=ios_xcrun_unavailable:xcrun_simctl_unavailable",
    ]);
    expect(
      testHarness.artifacts.get(
        `/evidence/${SHA}/mobile-d0/ios/expo-export.log`,
      ),
    ).toContain("exported 9 routes");
    expect(
      testHarness.artifacts.get(
        `/evidence/${SHA}/mobile-d0/ios/expo-prebuild.log`,
      ),
    ).toContain("generated ios");
    expect(
      testHarness.artifacts.get(`/evidence/${SHA}/mobile-d0/ios/summary.json`),
    ).toContain('"verified": false');
    expect(testHarness.cleanup).toHaveBeenCalledOnce();
  });

  it("preserves the exact executable-launch blocker instead of reporting unknown", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({
        exitCode: 127,
        stdout: "spawn adb ENOENT\n",
      }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=android_adb_unavailable:spawn_adb_enoent",
    ]);
  });

  it("boots an available iOS simulator and verifies exactly one Maestro flow", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "ios-probe": result({
        stdout: JSON.stringify({
          devices: {
            "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
              {
                isAvailable: true,
                name: "iPhone 17",
                state: "Shutdown",
                udid: "IOS-UDID",
              },
            ],
          },
        }),
      }),
      "maestro-probe": result({ stdout: "2.0.0\n" }),
      "snapshot-install": result({ stdout: "installed\n" }),
      "expo-export": result({ stdout: "exported 9 routes\n" }),
      "expo-prebuild": result({ stdout: "generated ios\n" }),
      "ios-boot": result(),
      "ios-boot-status": result({ stdout: "Finished\n" }),
      "app-launch": result({ stdout: "installed app\n" }),
      "maestro-flow": result({ stdout: "1 Flow Passed\n" }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "ios"], testHarness.dependencies),
    ).resolves.toBeUndefined();

    const requestByLabel = new Map(
      testHarness.requests.map((request) => [request.label, request]),
    );
    expect(requestByLabel.get("ios-boot")?.args).toEqual([
      "simctl",
      "boot",
      "IOS-UDID",
    ]);
    expect(requestByLabel.get("app-launch")?.args).toContain("IOS-UDID");
    expect(requestByLabel.get("maestro-flow")?.args).toEqual([
      "--device",
      "IOS-UDID",
      "test",
      "tests/e2e/maestro/d0/golden.yaml",
    ]);
    expect(testHarness.output).toEqual([
      `D0_MOBILE VERIFIED platform=ios commit=${SHA} flows=1`,
    ]);
    expect(
      testHarness.artifacts.get(`/evidence/${SHA}/mobile-d0/ios/summary.json`),
    ).toContain('"verified": true');
  });

  it("uses an attached Android device and rejects a false-success Maestro log", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({
        stdout: "List of devices attached\nemulator-5554\tdevice\n",
      }),
      "maestro-probe": result({ stdout: "2.0.0\n" }),
      "snapshot-install": result(),
      "expo-export": result({ stdout: "exported\n" }),
      "expo-prebuild": result({ stdout: "generated android\n" }),
      "app-launch": result(),
      "maestro-flow": result({ stdout: "Flow finished without summary\n" }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=maestro_flow_result_missing",
    ]);
    expect(
      testHarness.requests.find(({ label }) => label === "app-launch")?.args,
    ).toContain("emulator-5554");
    expect(testHarness.cleanup).toHaveBeenCalledOnce();
  });

  it("rejects exit-zero output containing one passed and one failed flow", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({
        stdout: "List of devices attached\nemulator-5554\tdevice\n",
      }),
      "maestro-probe": result({ stdout: "2.0.0\n" }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
      "app-launch": result(),
      "maestro-flow": result({
        stdout: "1 Flow Passed\n1 Flow Failed\n0 Flows Skipped\n",
      }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=maestro_flow_result_invalid",
    ]);
  });

  it("logs git head/status and snapshot archive/extract after establishing artifacts", async () => {
    const events: string[] = [];
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "ios-probe": result({ exitCode: 72, stderr: "unavailable\n" }),
      "snapshot-archive": result(),
      "snapshot-extract": result(),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
    });
    const originalRun = testHarness.dependencies.runCommand;
    testHarness.dependencies.runCommand = vi.fn(async (request) => {
      events.push(`run:${request.label}`);
      return await originalRun(request);
    });
    testHarness.dependencies.writeArtifact = vi.fn(
      async (directory, name, contents) => {
        events.push(`write:${name}`);
        testHarness.artifacts.set(`${directory}/${name}`, contents);
      },
    );

    await expect(
      runMobileD0Evidence(["--platform", "ios"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    for (const label of [
      "git-head",
      "git-status",
      "snapshot-archive",
      "snapshot-extract",
    ]) {
      expect(
        testHarness.artifacts.get(
          `/evidence/${SHA}/mobile-d0/ios/${label}.log`,
        ),
      ).toContain(`"label":"${label}"`);
    }
    expect(events.indexOf("write:git-head.log")).toBeLessThan(
      events.indexOf("run:git-status"),
    );
  });

  it("ignores a hostile PATH and only launches recorded absolute tool identities", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({ exitCode: 127, stderr: "unavailable\n" }),
      "snapshot-archive": result(),
      "snapshot-extract": result(),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
    });
    const originalPath = process.env.PATH;
    process.env.PATH = "/attacker-controlled/bin";
    try {
      const candidates = trustedToolCandidates("android");
      expect(candidates.git).not.toHaveLength(0);
      expect(candidates.tar).not.toHaveLength(0);
      expect(candidates.adb).toEqual([protectedPaths.adb]);
      expect(candidates.maestro).toEqual([protectedPaths.maestro]);
      expect(candidates.pnpm).toEqual([protectedPaths.pnpm]);
      expect(Object.values(candidates).flat()).not.toContain(
        "/attacker-controlled/bin/git",
      );
      await expect(
        runMobileD0Evidence(
          ["--platform", "android"],
          testHarness.dependencies,
        ),
      ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    } finally {
      process.env.PATH = originalPath;
    }

    expect(testHarness.requests).not.toHaveLength(0);
    expect(
      testHarness.requests.every(({ executable }) => isAbsolute(executable)),
    ).toBe(true);
    const summary = JSON.parse(
      testHarness.artifacts.get(
        `/evidence/${SHA}/mobile-d0/android/summary.json`,
      ) ?? "null",
    ) as { tools?: Record<string, unknown> } | null;
    expect(summary?.tools).toMatchObject({
      git: { realpath: expect.any(String), sha256: expect.any(String) },
      pnpm: { realpath: expect.any(String), sha256: expect.any(String) },
      tar: { realpath: expect.any(String), sha256: expect.any(String) },
    });
  });

  it("fails closed end-to-end when HOME, PATH, and the runtime directory contain forged tools", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "huoqiu-d0-hostile-"));
    const repository = join(temporaryRoot, "repository");
    const fakeHome = join(temporaryRoot, "home");
    const fakeRuntime = join(temporaryRoot, "runtime");
    const fakeAdb = join(
      fakeHome,
      "Library",
      "Android",
      "sdk",
      "platform-tools",
      "adb",
    );
    const fakeMaestro = join(fakeHome, ".maestro", "bin", "maestro");
    const fakeNode = join(fakeRuntime, "node");
    const fakePnpm = join(fakeRuntime, "pnpm");
    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        execFile(
          "/usr/bin/git",
          ["clone", "-q", "--shared", sourceRoot, repository],
          (error) => (error === null ? resolvePromise() : rejectPromise(error)),
        );
      });
      await copyFile(
        join(sourceRoot, "scripts", "quality", "mobile-d0-evidence.mts"),
        join(repository, "scripts", "quality", "mobile-d0-evidence.mts"),
      );
      await new Promise<void>((resolvePromise, rejectPromise) => {
        execFile(
          "/usr/bin/git",
          [
            "-C",
            repository,
            "-c",
            "user.name=D0 hostile test",
            "-c",
            "user.email=d0-hostile@example.invalid",
            "commit",
            "--allow-empty",
            "-qam",
            "test hostile production resolver",
          ],
          (error) => (error === null ? resolvePromise() : rejectPromise(error)),
        );
      });
      const commit = await new Promise<string>(
        (resolvePromise, rejectPromise) => {
          execFile(
            "/usr/bin/git",
            ["-C", repository, "rev-parse", "HEAD"],
            (error, stdout) =>
              error === null
                ? resolvePromise(stdout.trim())
                : rejectPromise(error),
          );
        },
      );
      await appendFile(
        join(repository, ".git", "info", "exclude"),
        "\nnode_modules\n",
      );
      await symlink(
        join(sourceRoot, "node_modules"),
        join(repository, "node_modules"),
      );
      await mkdir(dirname(fakeAdb), { recursive: true });
      await mkdir(dirname(fakeMaestro), { recursive: true });
      await mkdir(fakeRuntime, { recursive: true });
      await copyFile(process.execPath, fakeNode);
      await writeFile(
        fakePnpm,
        [
          "const args = process.argv.slice(2);",
          'process.stdout.write(args[0] === "--version" ? "11.4.0\\n" : "forged pnpm success\\n");',
          "",
        ].join("\n"),
      );
      await writeFile(
        fakeAdb,
        '#!/bin/sh\nif [ "$1" = "version" ]; then echo "Android Debug Bridge version 1.0.41"; else printf "List of devices attached\\nFORGED-DEVICE\\tdevice\\n"; fi\n',
      );
      await writeFile(
        fakeMaestro,
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2.0.0"; else echo "1 Flow Passed"; fi\n',
      );
      await Promise.all([
        chmod(fakeNode, 0o700),
        chmod(fakePnpm, 0o600),
        chmod(fakeAdb, 0o700),
        chmod(fakeMaestro, 0o700),
      ]);

      const evidenceScript = await realpath(
        join(repository, "scripts", "quality", "mobile-d0-evidence.mts"),
      );
      const execution = await new Promise<{
        exitCode: number;
        stderr: string;
        stdout: string;
      }>((resolvePromise) => {
        execFile(
          fakeNode,
          [evidenceScript, "--platform", "android"],
          {
            cwd: repository,
            env: {
              HOME: fakeHome,
              PATH: "/attacker-controlled/bin",
            },
          },
          (error, stdout, stderr) => {
            resolvePromise({
              exitCode:
                error === null
                  ? 0
                  : typeof error.code === "number"
                    ? error.code
                    : 1,
              stderr,
              stdout,
            });
          },
        );
      });

      expect(
        execution.exitCode,
        `${execution.stdout}\n${execution.stderr}`,
      ).not.toBe(0);
      expect(`${execution.stdout}\n${execution.stderr}`).toContain(
        "D0_MOBILE NOT_VERIFIED",
      );
      expect(`${execution.stdout}\n${execution.stderr}`).not.toContain(
        "D0_MOBILE VERIFIED",
      );
      const summary = JSON.parse(
        await readFile(
          join(
            repository,
            "artifacts",
            "evidence",
            commit,
            "mobile-d0",
            "android",
            "summary.json",
          ),
          "utf8",
        ),
      ) as {
        reason?: unknown;
        tool_errors?: unknown;
        verified?: unknown;
      };
      expect(summary).toMatchObject({
        reason: "tool_identity_missing:node",
        verified: false,
      });
      expect(summary.tool_errors).toEqual(
        expect.arrayContaining(["adb", "maestro", "node", "pnpm"]),
      );
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it("fails closed before evidence commands when a core tool version is outside policy", async () => {
    const testHarness = harness({
      "tool-pnpm-version": result({ stdout: "99.0.0\n" }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "ios"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=ios reason=tool_identity_invalid:pnpm",
    ]);
    expect(actionLabels(testHarness.requests)).toEqual([]);
  });

  it("writes NOT_VERIFIED when an immutable tool identity changes before reuse", async () => {
    const testHarness = harness({});
    let gitChecks = 0;
    testHarness.dependencies.verifyToolIdentity = vi.fn(async (identity) => {
      if (!identity.realpath.endsWith("/git")) return true;
      gitChecks += 1;
      return gitChecks <= 2;
    });

    await expect(
      runMobileD0Evidence(["--platform", "ios"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=ios reason=tool_identity_changed:git",
    ]);
    expect(actionLabels(testHarness.requests)).toEqual([]);
  });

  it("writes NOT_VERIFIED when a tool identity changes during a command", async () => {
    const testHarness = harness({});
    let nodeChecks = 0;
    testHarness.dependencies.verifyToolIdentity = vi.fn(async (identity) => {
      if (identity.name !== "node") return true;
      nodeChecks += 1;
      return nodeChecks === 1;
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=tool_identity_invalid:node",
    ]);
    expect(actionLabels(testHarness.requests)).toEqual([]);
  });

  it("revalidates native support closure around the protected Node launch", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({
        stdout: "List of devices attached\nemulator-5554\tdevice\n",
      }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
      "app-launch": result(),
    });
    let adbChecks = 0;
    testHarness.dependencies.verifyToolIdentity = vi.fn(async (identity) => {
      if (identity.name !== "adb") return true;
      adbChecks += 1;
      return adbChecks < 8;
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=android_build_or_launch_failed",
    ]);
    expect(actionLabels(testHarness.requests)).toContain("app-launch");
    expect(actionLabels(testHarness.requests)).not.toContain("maestro-flow");
  });

  it("performs a final all-tool identity sweep before VERIFIED", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({
        stdout: "List of devices attached\nemulator-5554\tdevice\n",
      }),
      "snapshot-install": result(),
      "expo-export": result(),
      "expo-prebuild": result(),
      "app-launch": result(),
      "maestro-flow": result({ stdout: "1 Flow Passed\n" }),
    });
    let nodeChecks = 0;
    testHarness.dependencies.verifyToolIdentity = vi.fn(async (identity) => {
      if (identity.name !== "node") return true;
      nodeChecks += 1;
      return nodeChecks < 9;
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(testHarness.output).toEqual([
      "D0_MOBILE NOT_VERIFIED platform=android reason=tool_identity_changed:node",
    ]);
    expect(testHarness.output).not.toContain(
      expect.stringContaining("D0_MOBILE VERIFIED"),
    );
  });

  it("runs both fallback captures even when snapshot installation fails", async () => {
    const testHarness = harness({
      "git-head": result({ stdout: `${SHA}\n` }),
      "git-status": result(),
      "android-probe": result({ stdout: "List of devices attached\n" }),
      "snapshot-install": result({ exitCode: 1, stderr: "offline miss\n" }),
      "expo-export": result({ exitCode: 1, stderr: "no modules\n" }),
      "expo-prebuild": result({ exitCode: 1, stderr: "no modules\n" }),
    });

    await expect(
      runMobileD0Evidence(["--platform", "android"], testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");

    expect(actionLabels(testHarness.requests)).toEqual([
      "git-head",
      "git-status",
      "android-probe",
      "snapshot-archive",
      "snapshot-extract",
      "snapshot-install",
      "expo-export",
      "expo-prebuild",
    ]);
    expect(testHarness.output[0]).toContain("android_no_connected_device");
    expect(testHarness.cleanup).toHaveBeenCalledOnce();
  });
});
