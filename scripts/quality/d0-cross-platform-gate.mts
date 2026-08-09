import { runMobileD0Evidence } from "./mobile-d0-evidence.mts";
import { QualityGateError } from "./gate-core.mts";
import {
  runWebD0GoldenEvidence,
  type D0WebGoldenSummary,
} from "./d0-web-golden-gate.mts";

type Platform = "android" | "ios";
type CheckSummary = D0WebGoldenSummary;

export interface D0CrossPlatformDependencies {
  runMobile: (platform: Platform) => Promise<CheckSummary>;
  runWeb: () => Promise<CheckSummary>;
}

const runMobile = async (platform: Platform): Promise<CheckSummary> => {
  await runMobileD0Evidence(["--platform", platform]);
  return { failed: 0, passed: 1, skipped: 0 };
};

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
  // The protected macOS runner owns both simulator processes. Running these in
  // sequence prevents shared ports, build directories, and device state from
  // contaminating the evidence of another platform.
  const web = await dependencies.runWeb();
  exact("web", web, 3);
  const ios = await dependencies.runMobile("ios");
  exact("ios", ios, 1);
  const android = await dependencies.runMobile("android");
  exact("android", android, 1);
  return { failed: 0, passed: 5, skipped: 0 };
};
