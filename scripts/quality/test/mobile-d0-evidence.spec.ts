import { isAbsolute } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  runMobileD0Evidence,
  trustedToolCandidates,
  type CommandRequest,
  type CommandResult,
  type MobileD0EvidenceDependencies,
} from "../mobile-d0-evidence.mts";

const SHA = "a".repeat(40);

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
  "tool-pnpm-version": result({ stdout: "11.4.0\n" }),
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
          "maestro",
          platform === "ios" ? "xcrun" : "adb",
        ];
        return Object.fromEntries(
          names.map((name) => [
            name,
            {
              executable: `/trusted/${name}`,
              prefixArgs: [],
              realpath: `/trusted/${name}`,
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
      writeArtifact: vi.fn(async (directory, name, contents) => {
        artifacts.set(`${directory}/${name}`, contents);
      }),
    },
    output,
    requests,
  };
};

describe("D0 mobile evidence", () => {
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
      expect(candidates.pnpm).not.toHaveLength(0);
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
