import { isMainModule, parseStrictFlags, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

export const main = async (
  args = process.argv.slice(2),
  fallbackTarget = "unknown",
  allowedFlags: ReadonlySet<string> = new Set(["--cap"]),
): Promise<void> => {
  const flags = parseStrictFlags(args, allowedFlags);
  const target =
    flags.get("--gate")?.[0] ??
    flags.get("--cap")?.[0] ??
    flags.get("--platform")?.[0] ??
    flags.get("--milestone")?.[0] ??
    fallbackTarget;
  throw new QualityGateError(
    "NOT_IMPLEMENTED",
    `${target} has no certifiable implementation evidence yet`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
