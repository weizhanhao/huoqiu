import { runPreparedMobileD0Evidence } from "./mobile-d0-evidence.mts";
import { QualityGateError } from "./gate-core.mts";
import {
  runWebD0GoldenEvidence,
  type D0WebGoldenSummary,
} from "./d0-web-golden-gate.mts";

type Platform = "android" | "ios";
type CheckSummary = D0WebGoldenSummary;

export type D0PreparedMobileRunner = (
  platform: Platform,
  workspace: string,
) => Promise<CheckSummary>;

export interface D0CrossPlatformDependencies {
  runMobile: (platform: Platform) => Promise<CheckSummary>;
  runWeb: () => Promise<CheckSummary>;
}

export const runPreparedMobileInWorkspace = async (
  platform: Platform,
  workspace: string,
  runPrepared: D0PreparedMobileRunner = runPreparedMobileD0Evidence,
): Promise<CheckSummary> => {
  const { failed, passed, skipped } = await runPrepared(platform, workspace);
  return { failed, passed, skipped };
};

const runMobile = async (platform: Platform): Promise<CheckSummary> =>
  await runPreparedMobileInWorkspace(platform, process.cwd());

const exact = (
  label: string,
  summary: CheckSummary,
  expectedPassed: number,
): void => {
  if (
    summary.failed !== 0 ||
    summary.skipped !== 0 ||
    summary.passed !== expectedPassed
  )
    throw new QualityGateError(
      "D0_CROSS_PLATFORM_NOT_VERIFIED",
      `${label} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}`,
    );
};

export const runD0CrossPlatformEvidence = async (
  dependencies: D0CrossPlatformDependencies = {
    runMobile,
    runWeb: runWebD0GoldenEvidence,
  },
): Promise<CheckSummary> => {
  // The protected macOS launcher owns this detached workspace plus both
  // simulator process trees. Running the raw prepared executors in sequence
  // prevents shared ports, build directories, and device state from
  // contaminating another platform's evidence.
  const web = await dependencies.runWeb();
  exact("web", web, 3);
  const ios = await dependencies.runMobile("ios");
  exact("ios", ios, 1);
  const android = await dependencies.runMobile("android");
  exact("android", android, 1);
  return { failed: 0, passed: 5, skipped: 0 };
};
