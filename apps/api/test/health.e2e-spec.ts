import { Controller, Get, Module } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  BODY_LIMIT_BYTES,
  createHttpApp,
  DEFAULT_HTTP_HOST,
  startHttpServer,
} from "../src/main.js";

const openApplications = new Set<NestFastifyApplication>();

const track = (application: NestFastifyApplication): NestFastifyApplication => {
  openApplications.add(application);
  return application;
};

afterEach(async () => {
  await Promise.all(
    [...openApplications].map(async (application) => {
      await application.close();
      openApplications.delete(application);
    }),
  );
});

@Controller("error-probe")
class ErrorProbeController {
  @Get()
  fail(): never {
    throw new Error("database-password=must-never-leak");
  }
}

@Module({ controllers: [ErrorProbeController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Test module carries Nest runtime metadata.
class ErrorProbeModule {}

describe("HTTP application boundary", () => {
  it("serves the real health endpoint with security headers and a request ID", async () => {
    const application = track(await createHttpApp());
    const server = application.getHttpAdapter().getInstance();

    const response = await server.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["x-request-id"]).toMatch(/\S+/u);
  });

  it("keeps the same correlation ID in the response header and error envelope", async () => {
    const application = track(await createHttpApp());
    const server = application.getHttpAdapter().getInstance();

    const response = await server.inject({
      method: "GET",
      url: "/does-not-exist",
      headers: { "x-request-id": "test-request-404" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["x-request-id"]).toBe("test-request-404");
    expect(response.json()).toEqual({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Not Found",
      requestId: "test-request-404",
    });
  });

  it("does not leak unexpected exception details", async () => {
    const application = track(
      await createHttpApp({ rootModule: ErrorProbeModule }),
    );
    const server = application.getHttpAdapter().getInstance();

    const response = await server.inject({
      method: "GET",
      url: "/error-probe",
      headers: { "x-request-id": "test-request-500" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      requestId: "test-request-500",
    });
    expect(response.body).not.toContain("database-password");
    expect(response.body).not.toContain("stack");
  });

  it("rejects request bodies larger than one MiB at the HTTP boundary", async () => {
    const application = track(await createHttpApp());
    const server = application.getHttpAdapter().getInstance();
    const response = await server.inject({
      method: "POST",
      url: "/healthz",
      headers: {
        "content-type": "application/json",
        "x-request-id": "test-request-large-body",
      },
      payload: JSON.stringify({ value: "x".repeat(BODY_LIMIT_BYTES) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "Payload Too Large",
      requestId: "test-request-large-body",
    });
  });

  it("binds a real server to loopback by default", async () => {
    expect(DEFAULT_HTTP_HOST).toBe("127.0.0.1");

    const application = track(await startHttpServer({ port: 0 }));

    expect(await application.getUrl()).toMatch(/^http:\/\/127\.0\.0\.1:/u);
  });
});
