import { fileURLToPath } from "node:url";

export const isDirectRun = (
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1],
): boolean => entryPath !== undefined && fileURLToPath(moduleUrl) === entryPath;
