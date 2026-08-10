import { execFile as execFileCallback } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const composePath = resolve(repositoryRoot, "infra/compose.yaml");
const generatorPath = resolve(repositoryRoot, "infra/generate-local-env.mjs");
const temporaryRoots: string[] = [];

const approvedImages = {
  jaeger:
    "cr.jaegertracing.io/jaegertracing/jaeger:2.20.0@sha256:46a886260e04002d8f45e213fc39063fa11a50446048fdaa64786fc0840cb9f8",
  postgres:
    "docker.io/library/postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f",
  valkey:
    "docker.io/valkey/valkey:9.1.1@sha256:3acc0687f2a2e1091fae6450d7842dd658c941338cf0a873ddd9e14b9e4ea4dd",
} as const;

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (path) => {
      await chmod(path, 0o700).catch(() => undefined);
      await rm(path, { force: true, recursive: true });
    }),
  );
});

describe("closed-alpha local stack", () => {
  it("pins exactly the approved loopback-only services", async () => {
    const compose = parse(await readFile(composePath, "utf8")) as {
      services: Record<
        string,
        {
          healthcheck?: { test?: string[] };
          image?: string;
          ports?: string[];
          volumes?: string[];
        }
      >;
      volumes: Record<string, unknown>;
    };

    expect(Object.keys(compose.services).toSorted()).toEqual([
      "jaeger",
      "postgres",
      "valkey",
    ]);
    for (const [serviceName, image] of Object.entries(approvedImages)) {
      const service = compose.services[serviceName];
      expect(service?.image).toBe(image);
      expect(service?.healthcheck).toBeDefined();
      expect(
        service?.ports?.every((port) => port.startsWith("127.0.0.1:")),
      ).toBe(true);
    }
    expect(Object.keys(compose.volumes).toSorted()).toEqual([
      "huoqiu-postgres-data",
      "huoqiu-valkey-data",
    ]);
    expect(compose.services.jaeger?.healthcheck?.test).toEqual([
      "CMD-SHELL",
      "wget -qO- http://127.0.0.1:13133/status | grep -Eq '\"healthy\"[[:space:]]*:[[:space:]]*true'",
    ]);
    expect(compose.services.jaeger?.volumes).toBeUndefined();
    expect(compose.services.postgres?.volumes).toContain(
      "huoqiu-postgres-data:/var/lib/postgresql/data",
    );
    expect(compose.services.valkey?.volumes).toContain(
      "huoqiu-valkey-data:/data",
    );
  });

  it("requires secrets and leaves schema ownership to migrations", async () => {
    const [compose, example, initSql] = await Promise.all([
      readFile(composePath, "utf8"),
      readFile(resolve(repositoryRoot, ".env.example"), "utf8"),
      readFile(resolve(repositoryRoot, "infra/postgres/init.sql"), "utf8"),
    ]);

    expect(compose).toContain("${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}");
    expect(compose).toContain("${VALKEY_PASSWORD:?set VALKEY_PASSWORD}");
    expect(compose).not.toMatch(
      /^\s+(?:POSTGRES_PASSWORD|VALKEY_PASSWORD):\s*[^$\s]/mu,
    );
    for (const secretName of [
      "POSTGRES_PASSWORD",
      "DATABASE_URL",
      "VALKEY_PASSWORD",
      "VALKEY_URL",
      "BETTER_AUTH_SECRET",
      "ALPHA_INVITE_CODES",
      "ZERO_TRUST_HMAC_SECRET",
    ]) {
      expect(example).toContain(`${secretName}=\n`);
    }
    expect(initSql).not.toMatch(/CREATE\s+(?:TABLE|EXTENSION)/iu);
    expect(initSql).not.toMatch(/pg_trgm/iu);
  });

  it("creates a private environment exactly once", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-local-env-"));
    temporaryRoots.push(root);
    const outputPath = resolve(root, ".env");
    const { generateLocalEnv } = (await import(
      `${pathToFileURL(generatorPath).href}?test=${Date.now()}`
    )) as {
      generateLocalEnv: (path: string) => Promise<Record<string, string>>;
    };

    const generated = await generateLocalEnv(outputPath);
    const original = await readFile(outputPath, "utf8");

    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    expect(generated.POSTGRES_PASSWORD).toHaveLength(43);
    expect(generated.VALKEY_PASSWORD).toHaveLength(43);
    expect(generated.BETTER_AUTH_SECRET).toHaveLength(43);
    expect(
      new Set([
        generated.POSTGRES_PASSWORD,
        generated.VALKEY_PASSWORD,
        generated.BETTER_AUTH_SECRET,
        generated.ZERO_TRUST_HMAC_SECRET,
      ]).size,
    ).toBe(4);
    await expect(generateLocalEnv(outputPath)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(outputPath, "utf8")).toBe(original);
  });

  it("fails closed when the CLI target already exists", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "huoqiu-local-env-cli-"));
    temporaryRoots.push(root);
    const copiedGenerator = resolve(root, "infra/generate-local-env.mjs");
    await import("node:fs/promises").then(async ({ mkdir, copyFile }) => {
      await mkdir(dirname(copiedGenerator), { recursive: true });
      await copyFile(generatorPath, copiedGenerator);
    });
    await writeFile(resolve(root, ".env"), "USER_OWNED=1\n", "utf8");

    await expect(
      execFile(process.execPath, [copiedGenerator]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: "LOCAL_ENV_EXISTS\n",
    });
    expect(await readFile(resolve(root, ".env"), "utf8")).toBe(
      "USER_OWNED=1\n",
    );
  });
});
