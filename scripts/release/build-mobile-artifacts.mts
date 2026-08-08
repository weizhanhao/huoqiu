import { pathToFileURL } from "node:url";

import { main as failNotImplemented } from "../quality/not-implemented-gate.mts";

export const main = async (args = process.argv.slice(2)): Promise<void> =>
  await failNotImplemented(args, "mobile-artifacts", new Set());

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "NOT_IMPLEMENTED"}\n`,
    );
    process.exitCode = 1;
  }
}
