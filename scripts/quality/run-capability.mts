import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { runCapability } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(args, new Set(["--milestone", "--cap"]));
  const milestone = milestoneFlag(flags);
  const capId = requiredFlag(flags, "--cap");
  const evidence = await runCapability(root, milestone, capId);
  process.stdout.write(
    `CAPABILITY_GATE PASS milestone=${milestone.toUpperCase()} cap=${evidence.cap_id} failed=0 skipped=0\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
