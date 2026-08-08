import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

it("waits for the worker.ready handshake instead of a fixed startup sleep", async () => {
  const source = await readFile(
    fileURLToPath(new URL("worker-process.spec.ts", import.meta.url)),
    "utf8",
  );

  expect(source).not.toMatch(/\bdelay\s*\(\s*200\s*\)/);
  expect(source).toContain('event === "worker.ready"');
});
