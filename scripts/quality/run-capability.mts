import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { runCapability } from "./gate-core.mts";

const D0_CROSS_PLATFORM_TIMEOUT_MS = 85 * 60 * 1000;

export const capabilityExecutionOptions = (
  milestone: "d0" | "m1",
  capId: string,
): Readonly<{ timeoutMs?: number }> =>
  milestone === "d0" && capId === "CAP-WATCH-001"
    ? { timeoutMs: D0_CROSS_PLATFORM_TIMEOUT_MS }
    : {};

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(args, new Set(["--milestone", "--cap"]));
  const milestone = milestoneFlag(flags);
  const capId = requiredFlag(flags, "--cap");
  const evidence = await runCapability(
    root,
    milestone,
    capId,
    capabilityExecutionOptions(milestone, capId),
  );
  process.stdout.write(
    `CAPABILITY_GATE PASS milestone=${milestone.toUpperCase()} cap=${evidence.cap_id} failed=0 skipped=0\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
