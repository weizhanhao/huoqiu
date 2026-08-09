import { readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const collectFiles = (directory: string): string[] => {
  if (!exists(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target) : [target];
  });
};

const exists = (directory: string): boolean => {
  try {
    readdirSync(directory);
    return true;
  } catch {
    return false;
  }
};

describe("client DTO ownership", () => {
  it("rejects handwritten app DTO files", () => {
    const appRoot = join(repoRoot, "apps");
    const handwrittenDtos = readdirSync(appRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => collectFiles(join(appRoot, entry.name, "src")))
      .filter(
        (filePath) =>
          extname(filePath) === ".ts" && filePath.endsWith("dto.ts"),
      )
      .map((filePath) => filePath.slice(repoRoot.length + 1))
      .sort();

    expect(handwrittenDtos).toEqual([]);
  });
});
