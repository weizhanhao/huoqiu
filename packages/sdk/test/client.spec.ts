import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { m1OperationRegistry } from "@huoqiu/contracts/m1";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

type CapturedRequest = Readonly<{
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}>;

const createCapturingFetcher = (
  response: Response,
): Readonly<{
  calls: CapturedRequest[];
  fetcher: typeof globalThis.fetch;
}> => {
  const calls: CapturedRequest[] = [];
  return {
    calls,
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return response;
    },
  };
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });

describe("M1 shared SDK client", () => {
  it("provides the client entrypoint", () => {
    expect(existsSync(`${packageRoot}/src/client.ts`)).toBe(true);
  });

  it("exports a client factory", async () => {
    const clientModule = await import("../src/client.js");

    expect(clientModule).toHaveProperty(
      "createHuoqiuClient",
      expect.any(Function),
    );
  });

  it("exposes exactly the 31 contract operations", async () => {
    const { createHuoqiuClient } = await import("../src/client.js");
    const client = createHuoqiuClient("https://api.example.test");

    expect(Object.keys(client).sort()).toEqual(
      m1OperationRegistry.map(({ operationId }) => operationId).sort(),
    );
    expect(Object.keys(client)).toHaveLength(31);
  });

  it("delegates requests to the injected fetcher", async () => {
    const { createHuoqiuClient } = await import("../src/client.js");
    const capture = createCapturingFetcher(
      jsonResponse({ items: [], next_cursor: null }),
    );
    const client = createHuoqiuClient(
      "https://api.example.test",
      capture.fetcher,
    );
    let requestError: unknown;

    try {
      await client.instrumentSearch({ query: { limit: 20, q: "AI chip" } });
    } catch (error) {
      requestError = error;
    }

    expect({ calls: capture.calls.length, requestError }).toEqual({
      calls: 1,
      requestError: undefined,
    });
  });

  it("maps query, bearer header, and cookie credentials onto a GET request", async () => {
    const { createHuoqiuClient } = await import("../src/client.js");
    const capture = createCapturingFetcher(
      jsonResponse({ items: [], next_cursor: null }),
    );
    const client = createHuoqiuClient(
      "https://api.example.test",
      capture.fetcher,
    );

    await client.instrumentSearch({
      extraHeaders: { authorization: "Bearer opaque-session-a" },
      fetchOptions: { credentials: "include" },
      query: { limit: 20, q: "AI chip" },
    });

    const request = capture.calls[0];
    expect(request).toBeDefined();
    const requestUrl = new URL(String(request?.input));
    expect(requestUrl.origin).toBe("https://api.example.test");
    expect(requestUrl.pathname).toBe("/v1/instruments/search");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      limit: "20",
      q: "AI chip",
    });
    expect(request?.init).not.toHaveProperty("body");
    expect(request?.init).toMatchObject({
      credentials: "include",
      headers: { authorization: "Bearer opaque-session-a" },
      method: "GET",
    });
  });

  it("maps path params, headers, and JSON body onto a mutation", async () => {
    const { createHuoqiuClient } = await import("../src/client.js");
    const capture = createCapturingFetcher(
      jsonResponse({ comment: { comment_id: "comment_demo_1" } }, 201),
    );
    const client = createHuoqiuClient(
      "https://api.example.test",
      capture.fetcher,
    );

    await client.commentCreate({
      body: { body: "A contract-driven comment" },
      headers: { "idempotency-key": "idem-comment-0001" },
      params: { id: "post_demo_1" },
    });

    const request = capture.calls[0];
    expect(String(request?.input)).toBe(
      "https://api.example.test/v1/posts/post_demo_1/comments",
    );
    expect(request?.init).toMatchObject({
      body: JSON.stringify({ body: "A contract-driven comment" }),
      headers: {
        "content-type": "application/json",
        "idempotency-key": "idem-comment-0001",
      },
      method: "POST",
    });
  });

  it("returns typed HTTP errors without collapsing their status or body", async () => {
    const { createHuoqiuClient } = await import("../src/client.js");
    const errorBody = {
      code: "AUTH_REQUIRED",
      details: {},
      message: "Sign in is required",
      trace_id: "trace_sdk_001",
    };
    const capture = createCapturingFetcher(jsonResponse(errorBody, 401));
    const client = createHuoqiuClient(
      "https://api.example.test",
      capture.fetcher,
    );

    const response = await client.authGetSession();

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorBody);
    expect(response.headers).toBeInstanceOf(Headers);
  });

  it("propagates transport failures without hiding the original cause", async () => {
    const { createHuoqiuClient } = await import("../src/client.js");
    const transportFailure = new Error("synthetic transport failure");
    const failingFetcher: typeof globalThis.fetch = async () => {
      throw transportFailure;
    };
    const client = createHuoqiuClient(
      "https://api.example.test",
      failingFetcher,
    );

    await expect(client.authGetSession()).rejects.toBe(transportFailure);
  });
});
