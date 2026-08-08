import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { recordAuthorship } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
  environment = process.env,
): Promise<void> => {
  const flags = parseStrictFlags(
    args,
    new Set(["--milestone", "--commit-sha"]),
  );
  const milestone = milestoneFlag(flags);
  const attestation = await recordAuthorship(
    root,
    requiredFlag(flags, "--commit-sha"),
    { milestone, environment },
  );
  process.stdout.write(
    `AUTHORSHIP_RECORDED issuer=${attestation.issuer_id} commit=${attestation.head_sha}\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
