import "reflect-metadata";

import fastifyHelmet from "@fastify/helmet";
import type { NestApplicationOptions, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { HttpErrorFilter } from "./common/http-error.filter.js";
import { isDirectRun } from "./runtime/direct-run.js";

export const BODY_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 3000;

type CreateHttpAppOptions = Readonly<{
  bodyLimit?: number;
  logger?: NestApplicationOptions["logger"];
  rootModule?: Type<unknown>;
}>;

type StartHttpServerOptions = CreateHttpAppOptions &
  Readonly<{
    host?: string;
    port?: number;
  }>;

const resolveEnvironmentPort = (): number => {
  const rawPort = process.env.PORT;
  if (rawPort === undefined) {
    return DEFAULT_HTTP_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  return port;
};

export const createHttpApp = async (
  options: CreateHttpAppOptions = {},
): Promise<NestFastifyApplication> => {
  const adapter = new FastifyAdapter({
    bodyLimit: options.bodyLimit ?? BODY_LIMIT_BYTES,
    requestIdHeader: "x-request-id",
  });
  const application = await NestFactory.create<NestFastifyApplication>(
    options.rootModule ?? AppModule,
    adapter,
    {
      logger:
        options.logger ??
        (process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"]),
    },
  );

  await application.register(fastifyHelmet, { global: true });
  const server = application.getHttpAdapter().getInstance();
  server.addHook("onRequest", (request, reply, done) => {
    void reply.header("x-request-id", String(request.id));
    done();
  });
  application.useGlobalFilters(new HttpErrorFilter());

  await application.init();
  await server.ready();

  return application;
};

export const startHttpServer = async (
  options: StartHttpServerOptions = {},
): Promise<NestFastifyApplication> => {
  const application = await createHttpApp(options);

  try {
    await application.listen({
      host: options.host ?? process.env.HTTP_HOST ?? DEFAULT_HTTP_HOST,
      port: options.port ?? resolveEnvironmentPort(),
    });
    return application;
  } catch (error: unknown) {
    await application.close();
    throw error;
  }
};

if (isDirectRun(import.meta.url)) {
  void startHttpServer().catch((error: unknown) => {
    console.error("API failed to start", error);
    process.exitCode = 1;
  });
}
