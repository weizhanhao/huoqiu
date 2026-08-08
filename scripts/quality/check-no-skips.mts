import { readFile } from "node:fs/promises";

import { isMainModule, parseStrictFlags, runCli } from "./cli.mts";
import {
  QualityGateError,
  safeRepositoryPath,
  scanForInvalidTestMarkers,
} from "./gate-core.mts";

export const checkNoSkips = async (
  root: string,
  reports: string[],
): Promise<void> => {
  if (reports.length === 0)
    throw new QualityGateError(
      "REQUIRED_TEST_INVALID",
      "at least one report is required",
    );
  for (const report of reports) {
    const contents = await readFile(
      safeRepositoryPath(root, report, "EVIDENCE_PATH_INVALID"),
      "utf8",
    );
    const markers = scanForInvalidTestMarkers(contents);
    if (markers.length > 0) {
      throw new QualityGateError(
        "REQUIRED_TEST_INVALID",
        `${report}: ${markers.join(",")}`,
      );
    }
  }
};

export const main = async (
  args = process.argv.slice(2),
  root = process.cwd(),
): Promise<void> => {
  const flags = parseStrictFlags(
    args,
    new Set(["--report"]),
    new Set(["--report"]),
  );
  await checkNoSkips(root, flags.get("--report") ?? []);
  process.stdout.write(
    `NO_SKIPS PASS reports=${flags.get("--report")?.length ?? 0}\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
