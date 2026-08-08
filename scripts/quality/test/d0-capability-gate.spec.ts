import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { executeCommand, parseCapabilitySummary } from "../gate-core.mts";

const sourceRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("D0 capability certification commands", () => {
  it("keeps manifest registration fail-closed until implementer identity is supplied", async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(sourceRoot, "quality/manifests/d0-required.json"),
        "utf8",
      ),
    ) as {
      required_caps: {
        command: { args: string[]; executable: string };
        implementer_ids: string[];
      }[];
    };

    expect(manifest.required_caps).toHaveLength(5);
    for (const item of manifest.required_caps) {
      expect(item.command).toMatchObject({
        executable: "pnpm",
        args: expect.arrayContaining([
          "scripts/quality/not-implemented-gate.mts",
        ]),
      });
      expect(item.implementer_ids).toEqual([
        "pending:capability-implementation",
      ]);
    }
  });

  it("provides a protected CI signing path without a repository private key", async () => {
    const workflow = await readFile(
      resolve(sourceRoot, ".github/workflows/d0-quality-review.yml"),
      "utf8",
    );
    const guide = await readFile(
      resolve(sourceRoot, "docs/quality/d0-certification.md"),
      "utf8",
    );

    expect(workflow).toContain("environment: quality-review");
    expect(workflow).toContain("secrets.HUOQIU_REVIEW_PRIVATE_KEY_B64");
    expect(workflow).toContain("secrets.HUOQIU_REVIEW_CHECKLIST_B64");
    expect(workflow).toContain("pnpm gate:d0");
    expect(workflow).not.toMatch(/BEGIN (?:OPENSSH|PRIVATE) KEY/u);
    expect(guide).toContain("github:<numeric-id>");
    expect(guide).toContain("Ed25519");
    expect(guide).toContain("fail closed");
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
