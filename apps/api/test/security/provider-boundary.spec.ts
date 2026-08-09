import { readFile } from "node:fs/promises";

import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { BoundedIdempotencyRegistry } from "../../src/identity/idempotency-registry.js";

const source = async (name: string): Promise<string> =>
  await readFile(
    new URL(`../../src/identity/${name}`, import.meta.url),
    "utf8",
  );

describe("identity private boundaries", () => {
  it.each(["auth-provider.port.ts", "auth.service.ts", "auth.controller.ts"])(
    "keeps raw credential and backend identifiers out of %s",
    async (name) => {
      const content = await source(name);
      expect(content).not.toMatch(
        /authorizationHeader|cookieHeader|responseHeaderValue|providerSessionId|providerUserId|issuedCredential|set-auth-token|set-cookie/u,
      );
    },
  );

  it("coalesces concurrent work, detects conflicts, and cleans bounded entries", async () => {
    let now = 1_000;
    const registry = new BoundedIdempotencyRegistry({
      capacity: 2,
      now: () => now,
      secret: "idempotency-test-secret-with-at-least-32-characters",
      ttlMilliseconds: 10,
    });
    const work = vi.fn(async () => ({ actorId: "usr_same" }));
    const input = {
      callerId: "edge-caller",
      key: "same-key-value",
      operation: "auth.register",
      request: { email: "redacted-by-hmac" },
    };

    const outcomes = await Promise.all([
      registry.execute(input, work),
      registry.execute(input, work),
    ]);
    expect(outcomes).toEqual([
      { actorId: "usr_same" },
      { actorId: "usr_same" },
    ]);
    expect(work).toHaveBeenCalledOnce();

    let conflictStatus: number | undefined;
    try {
      await registry.execute(
        { ...input, request: { email: "different" } },
        async () => ({ actorId: "never" }),
      );
    } catch (error) {
      conflictStatus =
        error instanceof HttpException ? error.getStatus() : undefined;
    }
    expect(conflictStatus).toBe(409);

    await registry.execute(
      { ...input, key: "second-key-value" },
      async () => "second",
    );
    await registry.execute(
      { ...input, key: "third-key-value" },
      async () => "third",
    );
    expect(registry.size()).toBe(2);
    now += 11;
    expect(registry.size()).toBe(0);
  });

  it("never evicts in-flight idempotency work to make room", async () => {
    const registry = new BoundedIdempotencyRegistry({
      capacity: 1,
      secret: "idempotency-test-secret-with-at-least-32-characters",
    });
    let release = (): void => undefined;
    const pending = registry.execute(
      {
        callerId: "edge-caller",
        key: "pending-key",
        operation: "auth.login",
        request: { email: "pending@huoqiu.test" },
      },
      async () =>
        await new Promise<string>((resolve) => {
          release = () => resolve("complete");
        }),
    );
    await Promise.resolve();

    let status: number | undefined;
    try {
      await registry.execute(
        {
          callerId: "edge-caller",
          key: "another-key",
          operation: "auth.login",
          request: { email: "another@huoqiu.test" },
        },
        async () => "must-not-run",
      );
    } catch (error) {
      status = error instanceof HttpException ? error.getStatus() : undefined;
    }
    expect(status).toBe(429);
    release();
    await expect(pending).resolves.toBe("complete");
  });
});
