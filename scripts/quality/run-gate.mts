import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  runCli,
} from "./cli.mts";
import { runGate } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(args, new Set(["--milestone"]));
  process.stdout.write(`${await runGate(root, milestoneFlag(flags))}\n`);
};

if (isMainModule(import.meta.url)) await runCli(main);
