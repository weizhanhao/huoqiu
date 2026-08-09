import { describe, expect, it, vi } from "vitest";

import {
  runPreparedMobileD0Evidence,
  type CommandRequest,
  type CommandResult,
  type MobileD0Platform,
  type MobileD0ToolName,
  type PreparedMobileD0EvidenceDependencies,
  type ToolIdentity,
  type ToolSet,
} from "../mobile-d0-evidence.mts";

const workspace = "/prepared/workspace";
const expoCli = `${workspace}/apps/mobile/node_modules/expo/bin/cli`;
const mobileRoot = `${workspace}/apps/mobile`;
const registryPath = "/opt/huoqiu-quality/mobile-d0/toolchain.v1.json";

const commandResult = (
  overrides: Partial<CommandResult> = {},
): CommandResult => ({
  exitCode: 0,
  signal: null,
  stderr: "",
  stdout: "",
  ...overrides,
});

const expectedVersions: Readonly<Record<MobileD0ToolName, string>> = {
  adb: "Android Debug Bridge version 1.0.41",
  git: "git version 2.50.0",
  maestro: "2.0.0",
  node: "v24.15.0",
  pnpm: "11.4.0",
  pod: "1.16.2",
  tar: "bsdtar 3.5.3",
  xcrun: "xcrun version 70.",
};

const identity = (name: MobileD0ToolName): ToolIdentity => {
  const entrypoint =
    name === "maestro" ? "/trusted/maestro.jar" : `/trusted/${name}`;
  const executable = name === "maestro" ? "/trusted/java" : entrypoint;
  const component = (path: string) => ({
    mode: 0o100755,
    path,
    realpath: path,
    sha256: name
      .repeat(64)
      .slice(0, 64)
      .replace(/[^a-f0-9]/gu, "a"),
    uid: 0,
  });
  return {
    components:
      name === "maestro"
        ? [component(executable), component(entrypoint)]
        : [component(entrypoint)],
    executable,
    expectedVersion: expectedVersions[name],
    name,
    prefixArgs: name === "maestro" ? ["-jar", entrypoint] : [],
    realpath: entrypoint,
    registry: {
      mode: 0o100444,
      path: registryPath,
      realpath: registryPath,
      sha256: "c".repeat(64),
      uid: 0,
    },
    sha256: component(entrypoint).sha256,
  };
};

const toolSet = (platform: MobileD0Platform): ToolSet => {
  const names: MobileD0ToolName[] = [
    "git",
    "tar",
    "pnpm",
    "node",
    "maestro",
    ...(platform === "ios" ? (["xcrun", "pod"] as const) : (["adb"] as const)),
  ];
  return Object.fromEntries(names.map((name) => [name, identity(name)]));
};

const baseResponses = (
  platform: MobileD0Platform,
): Record<string, CommandResult> => ({
  "tool-node-version": commandResult({ stdout: "v24.15.0\n" }),
  "tool-maestro-version": commandResult({ stdout: "2.0.0\n" }),
  ...(platform === "ios"
    ? {
        "tool-xcrun-version": commandResult({
          stdout: "xcrun version 70.\n",
        }),
        "tool-pod-version": commandResult({ stdout: "1.16.2\n" }),
        "ios-probe": commandResult({
          stdout: JSON.stringify({
            devices: {
              runtime: [
                {
                  isAvailable: true,
                  state: "Shutdown",
                  udid: "IOS-UDID",
                },
              ],
            },
          }),
        }),
      }
    : {
        "tool-adb-version": commandResult({
          stdout: "Android Debug Bridge version 1.0.41\n",
        }),
        "android-probe": commandResult({
          stdout: "List of devices attached\nemulator-5554\tdevice\n",
        }),
      }),
  "ios-boot": commandResult(),
  "ios-boot-status": commandResult(),
  "expo-prebuild": commandResult(),
  "app-launch": commandResult(),
  "maestro-flow": commandResult({ stdout: "1 Flow Passed\n" }),
});

const harness = (
  platform: MobileD0Platform,
  options: {
    responses?: Readonly<Record<string, CommandResult>>;
    tools?: ToolSet;
    verify?: (tool: ToolIdentity) => Promise<boolean>;
  } = {},
): {
  dependencies: PreparedMobileD0EvidenceDependencies;
  requests: CommandRequest[];
  verificationNames: MobileD0ToolName[];
} => {
  const requests: CommandRequest[] = [];
  const verificationNames: MobileD0ToolName[] = [];
  const responses = { ...baseResponses(platform), ...options.responses };
  return {
    dependencies: {
      resolveTools: vi.fn(async () => options.tools ?? toolSet(platform)),
      runCommand: vi.fn(async (request) => {
        requests.push(request);
        return (
          responses[request.label] ??
          commandResult({ exitCode: 127, stderr: "unexpected command\n" })
        );
      }),
      verifyToolIdentity: vi.fn(async (tool) => {
        verificationNames.push(tool.name);
        return options.verify === undefined ? true : await options.verify(tool);
      }),
    },
    requests,
    verificationNames,
  };
};

const labels = (requests: readonly CommandRequest[]): string[] =>
  requests.map(({ label }) => label);

describe("prepared D0 mobile evidence", () => {
  it("runs the exact Android native sequence without Git or resnapshotting", async () => {
    const testHarness = harness("android");

    const report = await runPreparedMobileD0Evidence(
      "android",
      workspace,
      testHarness.dependencies,
    );

    expect(labels(testHarness.requests)).toEqual([
      "tool-node-version",
      "tool-adb-version",
      "tool-maestro-version",
      "android-probe",
      "expo-prebuild",
      "app-launch",
      "maestro-flow",
    ]);
    expect(
      testHarness.requests.some(
        ({ executable, label }) =>
          executable.endsWith("/git") ||
          /git|archive|checkout|snapshot/iu.test(label),
      ),
    ).toBe(false);
    expect(
      testHarness.requests.find(({ label }) => label === "expo-prebuild"),
    ).toMatchObject({
      args: [expoCli, "prebuild", "--no-install", "--platform", "android"],
      cwd: mobileRoot,
      executable: "/trusted/node",
      platform: "android",
    });
    expect(
      testHarness.requests.find(({ label }) => label === "app-launch"),
    ).toMatchObject({
      args: [
        expoCli,
        "run:android",
        "--no-install",
        "--device",
        "emulator-5554",
      ],
      cwd: mobileRoot,
      executable: "/trusted/node",
    });
    expect(
      testHarness.requests.find(({ label }) => label === "maestro-flow"),
    ).toMatchObject({
      args: [
        "-jar",
        "/trusted/maestro.jar",
        "--device",
        "emulator-5554",
        "test",
        "tests/e2e/maestro/d0/golden.yaml",
      ],
      cwd: workspace,
      executable: "/trusted/java",
    });
    expect(testHarness.verificationNames).toEqual([
      "node",
      "node",
      "adb",
      "adb",
      "maestro",
      "maestro",
      "adb",
      "adb",
      "node",
      "adb",
      "maestro",
      "node",
      "adb",
      "maestro",
      "node",
      "adb",
      "maestro",
      "node",
      "adb",
      "maestro",
      "maestro",
      "maestro",
      "node",
      "adb",
      "maestro",
    ]);
    expect(report).toMatchObject({
      failed: 0,
      flow_count: 1,
      passed: 1,
      platform: "android",
      report_type: "mobile-d0-prepared-raw-v1",
      schema_version: 1,
      skipped: 0,
      target_id: "emulator-5554",
    });
    expect(report).not.toHaveProperty("verified");
  });

  it("runs the exact iOS boot, native launch, and one-flow sequence", async () => {
    const testHarness = harness("ios");

    const report = await runPreparedMobileD0Evidence(
      "ios",
      workspace,
      testHarness.dependencies,
    );

    expect(labels(testHarness.requests)).toEqual([
      "tool-node-version",
      "tool-xcrun-version",
      "tool-pod-version",
      "tool-maestro-version",
      "ios-probe",
      "ios-boot",
      "ios-boot-status",
      "expo-prebuild",
      "app-launch",
      "maestro-flow",
    ]);
    expect(
      testHarness.requests.find(({ label }) => label === "ios-boot"),
    ).toMatchObject({
      args: ["simctl", "boot", "IOS-UDID"],
      executable: "/trusted/xcrun",
    });
    expect(
      testHarness.requests.find(({ label }) => label === "app-launch"),
    ).toMatchObject({
      args: [expoCli, "run:ios", "--no-install", "--device", "IOS-UDID"],
      cwd: mobileRoot,
      executable: "/trusted/node",
    });
    expect(testHarness.verificationNames).toEqual([
      "node",
      "node",
      "xcrun",
      "xcrun",
      "pod",
      "pod",
      "maestro",
      "maestro",
      "xcrun",
      "xcrun",
      "xcrun",
      "xcrun",
      "xcrun",
      "xcrun",
      "node",
      "xcrun",
      "pod",
      "node",
      "xcrun",
      "pod",
      "node",
      "xcrun",
      "pod",
      "node",
      "xcrun",
      "pod",
      "maestro",
      "maestro",
      "node",
      "xcrun",
      "pod",
      "maestro",
    ]);
    expect(report).toMatchObject({
      failed: 0,
      flow_count: 1,
      passed: 1,
      platform: "ios",
      report_type: "mobile-d0-prepared-raw-v1",
      skipped: 0,
      target_id: "IOS-UDID",
    });
    expect(report).not.toHaveProperty("verified");
  });

  it("fails before commands when a prepared-required tool is missing", async () => {
    const tools = { ...toolSet("android") };
    delete tools.maestro;
    const testHarness = harness("android", { tools });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(testHarness.requests).toEqual([]);
  });

  it("rejects a non-absolute executable before invoking it", async () => {
    const tools = { ...toolSet("android") };
    tools.node = { ...identity("node"), executable: "relative-node" };
    const testHarness = harness("android", { tools });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(testHarness.requests).toEqual([]);
  });

  it("fails when a tool identity changes across a command", async () => {
    let adbChecks = 0;
    const testHarness = harness("android", {
      verify: async (tool) => {
        if (tool.name !== "adb") return true;
        adbChecks += 1;
        return adbChecks === 1;
      },
    });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(labels(testHarness.requests)).toEqual([
      "tool-node-version",
      "tool-adb-version",
    ]);
  });

  it("fails closed when the final identity sweep detects a rotation", async () => {
    let nodeChecks = 0;
    const testHarness = harness("android", {
      verify: async (tool) => {
        if (tool.name !== "node") return true;
        nodeChecks += 1;
        return nodeChecks < 7;
      },
    });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(labels(testHarness.requests).at(-1)).toBe("maestro-flow");
  });

  it("fails closed on a version mismatch", async () => {
    const testHarness = harness("android", {
      responses: {
        "tool-node-version": commandResult({ stdout: "v99.0.0\n" }),
      },
    });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(labels(testHarness.requests)).toEqual(["tool-node-version"]);
  });

  it.each([
    "List of devices attached\nemulator-5554\tunauthorized\n",
    "not adb output\n",
  ])("fails closed on an unavailable Android target", async (stdout) => {
    const testHarness = harness("android", {
      responses: { "android-probe": commandResult({ stdout }) },
    });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(labels(testHarness.requests)).not.toContain("expo-prebuild");
  });

  it("fails closed on malformed iOS target output", async () => {
    const testHarness = harness("ios", {
      responses: { "ios-probe": commandResult({ stdout: "not json" }) },
    });

    await expect(
      runPreparedMobileD0Evidence("ios", workspace, testHarness.dependencies),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(labels(testHarness.requests)).not.toContain("expo-prebuild");
  });

  it("fails closed when native build/install/launch fails", async () => {
    const testHarness = harness("android", {
      responses: {
        "app-launch": commandResult({ exitCode: 1, stderr: "build failed\n" }),
      },
    });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
    expect(labels(testHarness.requests)).not.toContain("maestro-flow");
  });

  it.each([
    "1 Flow Passed\n1 Flow Failed\n",
    "1 Flow Passed\nERROR hidden failure\n",
    "0 Flows Passed\n",
    "Flow Passed\n",
  ])("rejects malformed or false-success Maestro output", async (stdout) => {
    const testHarness = harness("android", {
      responses: { "maestro-flow": commandResult({ stdout }) },
    });

    await expect(
      runPreparedMobileD0Evidence(
        "android",
        workspace,
        testHarness.dependencies,
      ),
    ).rejects.toThrow("D0_MOBILE_NOT_VERIFIED");
  });

  it.each([
    ["web" as unknown as MobileD0Platform, workspace],
    ["android" as const, "relative/workspace"],
    ["ios" as const, "/"],
  ])("rejects an invalid prepared boundary", async (platform, root) => {
    const testHarness = harness("android");

    await expect(
      runPreparedMobileD0Evidence(platform, root, testHarness.dependencies),
    ).rejects.toThrow();
    expect(testHarness.requests).toEqual([]);
  });
});
