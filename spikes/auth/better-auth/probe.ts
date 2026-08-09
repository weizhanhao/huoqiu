import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer } from "better-auth/plugins/bearer";
import { DatabaseSync } from "node:sqlite";

export interface AuthProbeRequest {
  method: "GET" | "POST";
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface AuthProbeResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  json: () => unknown;
}

export interface AuthProbe {
  adapterType: string;
  lifecycleEvents: string[];
  inject: (request: AuthProbeRequest) => Promise<AuthProbeResponse>;
  close: () => Promise<void>;
}

const baseURL = "https://auth.huoqiu.test";
const authSecret =
  "huoqiu-auth-spike-secret-with-at-least-thirty-two-characters";

export const createBetterAuthProbe = async (): Promise<AuthProbe> => {
  const database = new DatabaseSync(":memory:");
  const lifecycleEvents: string[] = [];
  const auth = betterAuth({
    baseURL,
    database,
    emailAndPassword: { enabled: true },
    plugins: [bearer({ requireSignature: true })],
    secret: authSecret,
    trustedOrigins: [baseURL],
    advanced: {
      cookiePrefix: "huoqiu",
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    },
  });

  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();

  class AuthSpikeModule {
    readonly provider = "better-auth";
  }
  Module({
    imports: [
      AuthModule.forRoot({
        auth,
        disableGlobalAuthGuard: true,
        bodyParser: {
          json: { enabled: true, limit: "1mb" },
          urlencoded: { enabled: false },
        },
        middleware: (request, _response, next) => {
          lifecycleEvents.push(`${request.method} ${request.originalUrl}`);
          next();
        },
      }),
    ],
  })(AuthSpikeModule);

  const adapter = new FastifyAdapter({ trustProxy: true });
  const fastify = adapter.getInstance();
  let app: NestFastifyApplication | undefined;
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AuthSpikeModule,
      adapter,
      { bodyParser: false, logger: false },
    );
    await app.init();
    await fastify.ready();
  } catch (error) {
    await app?.close();
    database.close();
    throw error;
  }

  let closed = false;
  return {
    adapterType: app.getHttpAdapter().getType(),
    lifecycleEvents,
    inject: async (request) => {
      const headers =
        request.body === undefined
          ? request.headers
          : { ...request.headers, "content-type": "application/json" };
      const response = await fastify.inject({
        method: request.method,
        url: request.path,
        headers,
        ...(request.body === undefined
          ? {}
          : { payload: JSON.stringify(request.body) }),
      });
      const responseHeaders = Object.fromEntries(
        Object.entries(response.headers).map(([name, value]) => [
          name,
          typeof value === "number" ? String(value) : value,
        ]),
      );
      return {
        statusCode: response.statusCode,
        headers: responseHeaders,
        json: () => response.json(),
      };
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await app.close();
      database.close();
    },
  };
};
