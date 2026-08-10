import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, HEAD } from "../src/app/healthz/route";

describe("Web health route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an uncached minimal success response", async () => {
    const response = GET(new Request("http://127.0.0.1/healthz"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    await expect(response.text()).resolves.toBe("ok\n");
  });

  it("supports the public HEAD probe without a response body", async () => {
    const response = HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("");
  });

  it("attests a startup challenge with the in-memory preview secret", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const challenge = "a".repeat(64);
    vi.stubEnv("ZERO_TRUST_HMAC_SECRET", secret);

    const response = GET(
      new Request("http://127.0.0.1/healthz", {
        headers: { "x-huoqiu-preview-health-challenge": challenge },
      }),
    );
    const expected = `v1=${createHmac("sha256", secret)
      .update(`v1\npreview-health\n${challenge}`)
      .digest("hex")}`;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-huoqiu-preview-health-proof")).toBe(
      expected,
    );
  });

  it("does not emit an attestation for an invalid challenge", () => {
    vi.stubEnv("ZERO_TRUST_HMAC_SECRET", "0123456789abcdef0123456789abcdef");

    const response = GET(
      new Request("http://127.0.0.1/healthz", {
        headers: { "x-huoqiu-preview-health-challenge": "short" },
      }),
    );

    expect(response.headers.get("x-huoqiu-preview-health-proof")).toBeNull();
  });
});
