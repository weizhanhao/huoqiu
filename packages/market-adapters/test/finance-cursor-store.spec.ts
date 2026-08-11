import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AtomicJsonFinanceCursorStore } from "../src/finance/cursor-store.js";

const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "huoqiu-cursors-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("atomic JSON finance cursor store", () => {
  it("persists bounded opaque cursors and clears a completed source", async () => {
    const directory = await createDirectory();
    const store = new AtomicJsonFinanceCursorStore({ directory });

    expect(await store.read("sec-edgar")).toBeUndefined();
    await store.commit("sec-edgar", "CIK0000320193-submissions-001.json");
    expect(await store.read("sec-edgar")).toBe(
      "CIK0000320193-submissions-001.json",
    );

    await store.commit("sec-edgar", undefined);
    expect(await store.read("sec-edgar")).toBeUndefined();
    expect(
      JSON.parse(await readFile(join(directory, "cursors-v1.json"), "utf8")),
    ).toEqual({ schemaVersion: 1, cursors: {} });
  });

  it("serializes concurrent source commits without losing either cursor", async () => {
    const directory = await createDirectory();
    const firstStore = new AtomicJsonFinanceCursorStore({ directory });
    const secondStore = new AtomicJsonFinanceCursorStore({ directory });

    await Promise.all([
      firstStore.commit("sec-edgar", "sec-next"),
      secondStore.commit("gdelt-gkg", "gdelt-next"),
      firstStore.commit("nbs-cn-releases", "nbs-next"),
    ]);

    expect(await firstStore.read("sec-edgar")).toBe("sec-next");
    expect(await secondStore.read("gdelt-gkg")).toBe("gdelt-next");
    expect(await firstStore.read("nbs-cn-releases")).toBe("nbs-next");
    expect(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("writes a private regular file and rejects corrupt state instead of resetting progress", async () => {
    const directory = await createDirectory();
    const store = new AtomicJsonFinanceCursorStore({ directory });
    await store.commit("sec-edgar", "sec-next");

    const metadata = await stat(join(directory, "cursors-v1.json"));
    expect(metadata.isFile()).toBe(true);
    expect(metadata.mode & 0o777).toBe(0o600);

    await writeFile(join(directory, "cursors-v1.json"), "{broken", "utf8");
    await expect(store.read("sec-edgar")).rejects.toThrow("cursor state");
    await expect(store.commit("gdelt-gkg", "gdelt-next")).rejects.toThrow(
      "cursor state",
    );
    expect(await readFile(join(directory, "cursors-v1.json"), "utf8")).toBe(
      "{broken",
    );
  });

  it.each([
    ["invalid source", "../source", "cursor"],
    ["empty cursor", "sec-edgar", ""],
    ["control cursor", "sec-edgar", "unsafe\nvalue"],
    ["oversized cursor", "sec-edgar", "x".repeat(2_049)],
  ])("rejects an %s before writing", async (_label, source, cursor) => {
    const directory = await createDirectory();
    const store = new AtomicJsonFinanceCursorStore({ directory });

    await expect(store.commit(source, cursor)).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects symlinked and oversized cursor files before reading their contents", async () => {
    const directory = await createDirectory();
    const outside = join(directory, "outside.json");
    await writeFile(
      outside,
      JSON.stringify({ schemaVersion: 1, cursors: { "sec-edgar": "next" } }),
      "utf8",
    );
    await symlink(outside, join(directory, "cursors-v1.json"));
    const store = new AtomicJsonFinanceCursorStore({ directory });

    await expect(store.read("sec-edgar")).rejects.toThrow();
    await rm(join(directory, "cursors-v1.json"));
    await writeFile(
      join(directory, "cursors-v1.json"),
      "x".repeat(65 * 1_024),
      "utf8",
    );
    await expect(store.read("sec-edgar")).rejects.toThrow("byte limit");
  });
});
