import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { assembleEvidenceFromRawReport } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(
    args,
    new Set(["--milestone", "--cap", "--raw-report"]),
  );
  const evidence = await assembleEvidenceFromRawReport(
    root,
    milestoneFlag(flags),
    requiredFlag(flags, "--cap"),
    requiredFlag(flags, "--raw-report"),
  );
  process.stdout.write(
    `EVIDENCE_ASSEMBLED cap=${evidence.cap_id} commit=${evidence.commit_sha}\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
