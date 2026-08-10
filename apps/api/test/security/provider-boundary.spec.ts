import { readFile } from "node:fs/promises";

import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  createProcessLocalBetterAuthRuntime,
  CredentialBoundary,
} from "../../src/identity/auth-provider.adapter.js";
import { BoundedIdempotencyStore } from "../../src/identity/idempotency-store.js";

const source = async (name: string): Promise<string> =>
  await readFile(
    new URL(`../../src/identity/${name}`, import.meta.url),
    "utf8",
  );

describe("identity private boundaries", () => {
  it("does not let a separate credential boundary resolve another boundary's capability", async () => {
    const runtime = await createProcessLocalBetterAuthRuntime({
      secret: "credential-boundary-test-secret-with-at-least-32-characters",
    });

    try {
      const issuer = new CredentialBoundary(runtime);
      const unrelatedBoundary = new CredentialBoundary(runtime);
      const credential = issuer.fromIssued(
        new Headers({ "set-auth-token": "boundary-isolated-token" }),
        "bearer",
      );

      expect(issuer.requestHeaders(credential).get("authorization")).toBe(
        "Bearer boundary-isolated-token",
      );
      expect(() => unrelatedBoundary.requestHeaders(credential)).toThrow(
        "AUTH_CREDENTIAL_INVALID",
      );
    } finally {
      await runtime.close();
    }
  });

  it.each(["auth-provider.port.ts", "auth.service.ts", "auth.controller.ts"])(
    "keeps raw credential and backend identifiers out of %s",
    async (name) => {
      const content = await source(name);
      expect(content).not.toMatch(
        /authorizationHeader|cookieHeader|responseHeaderValue|providerSessionId|providerUserId|issuedCredential|set-auth-token|set-cookie/u,
      );
    },
  );

  it("coalesces concurrent work, detects conflicts, and cleans expired settled entries", async () => {
    let now = 1_000;
    const registry = new BoundedIdempotencyStore({
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
    let capacityStatus: number | undefined;
    try {
      await registry.execute(
        { ...input, key: "third-key-value" },
        async () => "third",
      );
    } catch (error) {
      capacityStatus =
        error instanceof HttpException ? error.getStatus() : undefined;
    }
    expect(capacityStatus).toBe(429);
    expect(registry.size()).toBe(2);
    now += 11;
    expect(registry.size()).toBe(0);
  });

  it("retains in-flight work past the TTL and starts TTL at settlement", async () => {
    let now = 1_000;
    const registry = new BoundedIdempotencyStore({
      capacity: 1,
      now: () => now,
      secret: "idempotency-test-secret-with-at-least-32-characters",
      ttlMilliseconds: 10,
    });
    let release = (): void => undefined;
    const input = {
      callerId: "edge-caller",
      key: "long-running-key",
      operation: "auth.login",
      request: { email: "pending@huoqiu.test" },
    };
    const pending = registry.execute(
      input,
      async () =>
        await new Promise<string>((resolve) => {
          release = () => resolve("first-result");
        }),
    );
    await Promise.resolve();

    now = 2_000;
    const duplicateWork = vi.fn(async () => "duplicate-result");
    const replay = registry.execute(input, duplicateWork);
    await Promise.resolve();
    expect(duplicateWork).not.toHaveBeenCalled();

    release();
    await expect(Promise.all([pending, replay])).resolves.toEqual([
      "first-result",
      "first-result",
    ]);

    now = 2_009;
    await expect(registry.replay<string>(input)).resolves.toBe("first-result");
    now = 2_010;
    await expect(
      registry.execute(input, async () => "after-expiry"),
    ).resolves.toBe("after-expiry");
  });

  it("fails closed at capacity without evicting an unexpired settled replay", async () => {
    let now = 5_000;
    const registry = new BoundedIdempotencyStore({
      capacity: 1,
      now: () => now,
      secret: "idempotency-test-secret-with-at-least-32-characters",
      ttlMilliseconds: 100,
    });
    const first = {
      callerId: "edge-caller",
      key: "stable-key",
      operation: "auth.register",
      request: { email: "stable@huoqiu.test" },
    };
    await expect(registry.execute(first, async () => "stable")).resolves.toBe(
      "stable",
    );
    await expect(registry.replay<string>(first)).resolves.toBe("stable");

    const displacedWork = vi.fn(async () => "displaced");
    await expect(
      registry.execute({ ...first, key: "different-key" }, displacedWork),
    ).rejects.toMatchObject({ status: 429 });
    expect(displacedWork).not.toHaveBeenCalled();
    await expect(registry.replay<string>(first)).resolves.toBe("stable");

    now = 5_101;
    await expect(
      registry.execute({ ...first, key: "different-key" }, displacedWork),
    ).resolves.toBe("displaced");
  });

  it("never evicts in-flight idempotency work to make room", async () => {
    const registry = new BoundedIdempotencyStore({
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
