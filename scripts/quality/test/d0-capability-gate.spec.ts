import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  executeCommand,
  parseCapabilitySummary,
} from "../gate-core.mts";

const sourceRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("D0 capability certification commands", () => {
  it("registers real per-capability commands instead of pending placeholders", async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(sourceRoot, "quality/manifests/d0-required.json"),
        "utf8",
      ),
    ) as {
      required_caps: Array<{
        command: { args: string[]; executable: string };
        implementer_ids: string[];
      }>;
    };

    expect(manifest.required_caps).toHaveLength(5);
    for (const item of manifest.required_caps) {
      expect(item.command).toMatchObject({
        executable: "pnpm",
        args: expect.arrayContaining([
          "scripts/quality/d0-capability-gate.mts",
        ]),
      });
      expect(item.command.args).not.toContain(
        "scripts/quality/not-implemented-gate.mts",
      );
      expect(item.implementer_ids).toEqual([
        expect.stringMatching(/^github:[1-9][0-9]*$/u),
      ]);
    }
  });

  it("runs a real watchlist capability and emits one normalized passing result", async () => {
    const execution = await executeCommand(sourceRoot, {
      executable: "pnpm",
      args: [
        "exec",
        "tsx",
        "scripts/quality/d0-capability-gate.mts",
        "--cap",
        "CAP-WATCH-001",
      ],
    });

    expect(execution.exit_code).toBe(0);
    expect(parseCapabilitySummary(execution.stdout)).toMatchObject({
      failed: 0,
      fixture_version: "d0.v1",
      invalid_test_markers: [],
      p0: 0,
      p1: 0,
      passed: 3,
      skipped: 0,
    });
  });
});
