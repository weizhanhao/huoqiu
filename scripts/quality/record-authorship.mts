import {
  isMainModule,
  milestoneFlag,
  parseStrictFlags,
  requiredFlag,
  runCli,
} from "./cli.mts";
import { QualityGateError, recordAuthorship } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(
    args,
    new Set(["--milestone", "--commit-sha", "--implementer-id"]),
  );
  const implementerIds = flags.get("--implementer-id") ?? [];
  if (implementerIds.length === 0)
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "--implementer-id is required",
    );
  const milestone = milestoneFlag(flags);
  const attestation = await recordAuthorship(
    root,
    requiredFlag(flags, "--commit-sha"),
    implementerIds,
    { milestone },
  );
  process.stdout.write(
    `AUTHORSHIP_RECORDED issuer=${attestation.issuer_id} commit=${attestation.head_sha}\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
