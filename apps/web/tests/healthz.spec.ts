import { describe, expect, it } from "vitest";

import { GET, HEAD } from "../src/app/healthz/route";

describe("Web health route", () => {
  it("returns an uncached minimal success response", async () => {
    const response = GET();

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
});
