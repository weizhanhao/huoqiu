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
import { assertZeroTrustConfiguration } from "./identity/alpha-access.guard.js";
import { isDirectRun } from "./runtime/direct-run.js";
import { reportProcessReady } from "./runtime/process-ready.js";
import { runHttpProcess } from "./runtime/run-http-process.js";

export const BODY_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 3000;

type CreateHttpAppOptions = Readonly<{
  autoFlushLogs?: boolean;
  bodyLimit?: number;
  bufferLogs?: boolean;
  logger?: NestApplicationOptions["logger"];
  rootModule?: Type<unknown>;
}>;

type StartHttpServerOptions = CreateHttpAppOptions &
  Readonly<{
    host?: string;
    port?: number;
  }>;

export type HttpListenOptions = Readonly<{
  host: string;
  port: number;
}>;

export type ManagedHttpApplication = Readonly<{
  close(): Promise<void>;
  listen(options: HttpListenOptions): Promise<unknown>;
}>;

const resolveEnvironmentPort = (): number => {
  const rawPort = process.env.PORT;
  if (rawPort === undefined) {
    return DEFAULT_HTTP_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new HttpConfigurationError("PORT must be an integer from 1 to 65535");
  }

  return port;
};

export const createHttpApp = async (
  options: CreateHttpAppOptions = {},
): Promise<NestFastifyApplication> => {
  assertZeroTrustConfiguration(process.env);
  const adapter = new FastifyAdapter({
    bodyLimit: options.bodyLimit ?? BODY_LIMIT_BYTES,
    requestIdHeader: "x-request-id",
  });
  const application = await NestFactory.create<NestFastifyApplication>(
    options.rootModule ?? AppModule,
    adapter,
    {
      autoFlushLogs: options.autoFlushLogs ?? true,
      bufferLogs: options.bufferLogs ?? false,
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

export const listenHttpApplication = async <
  TApplication extends ManagedHttpApplication,
>(
  application: TApplication,
  options: HttpListenOptions,
): Promise<TApplication> => {
  try {
    await application.listen(options);
    return application;
  } catch (error: unknown) {
    await application.close();
    throw error;
  }
};

export const startHttpServer = async (
  options: StartHttpServerOptions = {},
): Promise<NestFastifyApplication> => {
  const listenOptions = {
    host: options.host ?? process.env.HTTP_HOST ?? DEFAULT_HTTP_HOST,
    port: options.port ?? resolveEnvironmentPort(),
  } satisfies HttpListenOptions;
  const application = await createHttpApp(options);

  return listenHttpApplication(application, listenOptions);
};

class HttpConfigurationError extends Error {
  override readonly name = "HttpConfigurationError";
}

const hasErrorCode = (error: unknown): error is Readonly<{ code: string }> =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string";

const classifyStartupFailure = (error: unknown): string => {
  if (error instanceof HttpConfigurationError) {
    return "INVALID_CONFIGURATION";
  }

  if (hasErrorCode(error)) {
    if (error.code === "EADDRINUSE") {
      return "ADDRESS_IN_USE";
    }
    if (error.code === "EACCES" || error.code === "EPERM") {
      return "PERMISSION_DENIED";
    }
  }

  return "STARTUP_FAILED";
};

const startProductionHttpServer = async (): Promise<NestFastifyApplication> => {
  const application = await startHttpServer({
    autoFlushLogs: false,
    bufferLogs: true,
  });
  application.flushLogs();
  return application;
};

if (isDirectRun(import.meta.url)) {
  void runHttpProcess(startProductionHttpServer, {
    onReady: async (application) => {
      reportProcessReady({
        event: "http.ready",
        url: await application.getUrl(),
      });
    },
  }).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "api.failed",
        reason: classifyStartupFailure(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
