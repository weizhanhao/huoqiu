import { pathToFileURL } from "node:url";

import { QualityGateError, type Milestone } from "./gate-core.mts";

export const isMainModule = (url: string): boolean =>
  process.argv[1] !== undefined && url === pathToFileURL(process.argv[1]).href;

export const parseStrictFlags = (
  args: string[],
  allowed: ReadonlySet<string>,
  repeatable: ReadonlySet<string> = new Set(),
): Map<string, string[]> => {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const parsed = new Map<string, string[]>();
  for (let index = 0; index < normalizedArgs.length; index += 2) {
    const flag = normalizedArgs[index];
    const value = normalizedArgs[index + 1];
    if (
      flag === undefined ||
      !flag.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new QualityGateError(
        "CLI_ARGUMENT_INVALID",
        "arguments must be --flag value pairs",
      );
    }
    if (!allowed.has(flag))
      throw new QualityGateError(
        "CLI_ARGUMENT_INVALID",
        `unknown flag ${flag}`,
      );
    const existing = parsed.get(flag) ?? [];
    if (existing.length > 0 && !repeatable.has(flag)) {
      throw new QualityGateError(
        "CLI_ARGUMENT_INVALID",
        `duplicate flag ${flag}`,
      );
    }
    parsed.set(flag, [...existing, value]);
  }
  return parsed;
};

export const requiredFlag = (
  flags: Map<string, string[]>,
  name: string,
): string => {
  const value = flags.get(name)?.[0];
  if (value === undefined || value.length === 0) {
    throw new QualityGateError("CLI_ARGUMENT_INVALID", `${name} is required`);
  }
  return value;
};

export const milestoneFlag = (flags: Map<string, string[]>): Milestone => {
  const milestone = requiredFlag(flags, "--milestone");
  if (milestone !== "d0" && milestone !== "m1") {
    throw new QualityGateError(
      "CLI_ARGUMENT_INVALID",
      "--milestone must be d0 or m1",
    );
  }
  return milestone;
};

export const runCli = async (main: () => Promise<void>): Promise<void> => {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UNEXPECTED_QUALITY_GATE_ERROR";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
};
