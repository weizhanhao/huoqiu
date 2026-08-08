import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { recordReview } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(
    args,
    new Set(["--milestone", "--commit-sha", "--dimension"]),
  );
  const dimension = flags.get("--dimension")?.[0];
  const review = await recordReview(
    root,
    milestoneFlag(flags),
    requiredFlag(flags, "--commit-sha"),
    dimension === undefined ? {} : { dimension },
  );
  process.stdout.write(
    `REVIEW_RECORDED reviewer=${review.reviewer_id} commit=${review.commit_sha}\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
