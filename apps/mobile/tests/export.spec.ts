import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const exportDirectory = mkdtempSync(join(tmpdir(), "huoqiu-mobile-export-"));
let exportedHtml = "";

const parseAttributes = (source: string): ReadonlyMap<string, string> =>
  new Map(
    [...source.matchAll(/([^\s=]+)="([^"]*)"/gu)].map((match) => [
      match[1] ?? "",
      match[2] ?? "",
    ]),
  );

beforeAll(() => {
  const childEnvironment = {
    ...process.env,
    CI: "1",
    FORCE_COLOR: "0",
  };

  execFileSync(
    "pnpm",
    [
      "exec",
      "expo",
      "export",
      "--platform",
      "web",
      "--output-dir",
      exportDirectory,
    ],
    {
      cwd: mobileRoot,
      env: childEnvironment,
      maxBuffer: 20 * 1024 * 1024,
      stdio: "pipe",
    },
  );
  exportedHtml = readFileSync(join(exportDirectory, "index.html"), "utf8");
}, 60_000);

afterAll(() => {
  rmSync(exportDirectory, { force: true, recursive: true });
});

describe("Expo web export document metadata", () => {
  it("exports the 火球 document title", () => {
    const titles = [
      ...exportedHtml.matchAll(/<title(?:\s[^>]*)?>([^<]*)<\/title>/gu),
    ]
      .map((match) => match[1]?.trim())
      .filter((title): title is string => title !== undefined);

    expect(titles).toEqual(["火球"]);
  });

  it("exports a zh-CN document language", () => {
    const htmlElement = exportedHtml.match(/<html\b(?<attributes>[^>]*)>/u);

    expect(htmlElement?.groups?.attributes).toBeDefined();
    expect(
      parseAttributes(htmlElement?.groups?.attributes ?? "").get("lang"),
    ).toBe("zh-CN");
  });
});
