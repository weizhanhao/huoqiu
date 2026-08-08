import { isMainModule, parseStrictFlags, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

export const main = async (args = process.argv.slice(2)): Promise<void> => {
  const flags = parseStrictFlags(
    args,
    new Set(["--gate", "--cap", "--platform"]),
  );
  const target =
    flags.get("--gate")?.[0] ??
    flags.get("--cap")?.[0] ??
    flags.get("--platform")?.[0] ??
    "unknown";
  throw new QualityGateError(
    "NOT_IMPLEMENTED",
    `${target} has no certifiable implementation evidence yet`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
