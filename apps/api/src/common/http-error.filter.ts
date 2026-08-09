import { randomUUID } from "node:crypto";

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { parseAuthErrorResponse } from "../identity/auth-contract.js";
import { isIdentityHttpException } from "../identity/identity-error.js";

type ErrorDefinition = Readonly<{
  code: string;
  message: string;
}>;

const definitions: Readonly<Record<number, ErrorDefinition>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: "BAD_REQUEST",
    message: "Bad Request",
  },
  [HttpStatus.NOT_FOUND]: {
    code: "NOT_FOUND",
    message: "Not Found",
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: "PAYLOAD_TOO_LARGE",
    message: "Payload Too Large",
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal Server Error",
  },
};

const hasStatusCode = (
  exception: unknown,
): exception is Readonly<{ statusCode: number }> =>
  typeof exception === "object" &&
  exception !== null &&
  "statusCode" in exception &&
  typeof exception.statusCode === "number";

const resolveStatusCode = (exception: unknown): number => {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  if (
    hasStatusCode(exception) &&
    exception.statusCode >= 400 &&
    exception.statusCode <= 599
  ) {
    return exception.statusCode;
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
};

const resolveDefinition = (statusCode: number): ErrorDefinition =>
  definitions[statusCode] ?? {
    code: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED",
    message: statusCode >= 500 ? "Internal Server Error" : "Request Failed",
  };

const contractErrorStatuses = {
  AUTH_REQUIRED: HttpStatus.UNAUTHORIZED,
  CONFLICT: HttpStatus.CONFLICT,
  DATA_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
} as const;

type ContractErrorPayload = Readonly<{
  code: keyof typeof contractErrorStatuses;
  details: Readonly<Record<string, never>>;
  message: string;
}>;

const contractErrorPayload = (
  exception: unknown,
  statusCode: number,
): ContractErrorPayload | undefined => {
  if (!isIdentityHttpException(exception)) return undefined;
  const response = exception.getResponse();
  if (typeof response !== "object" || response === null) return undefined;
  const candidate = response as Readonly<Record<string, unknown>>;
  const code = candidate.code;
  const message = candidate.message;
  const details = candidate.details;
  if (
    typeof code !== "string" ||
    !(code in contractErrorStatuses) ||
    contractErrorStatuses[code as keyof typeof contractErrorStatuses] !==
      statusCode ||
    typeof message !== "string" ||
    typeof details !== "object" ||
    details === null ||
    Array.isArray(details) ||
    Object.keys(details).length !== 0 ||
    Object.keys(candidate).some(
      (key) => !["code", "details", "message"].includes(key),
    )
  ) {
    return undefined;
  }
  return {
    code: code as keyof typeof contractErrorStatuses,
    details: {},
    message,
  };
};

const authFallback = (
  statusCode: number,
): Readonly<{
  code: keyof typeof contractErrorStatuses;
  message: string;
  statusCode: number;
}> => {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        statusCode,
      };
    case HttpStatus.UNAUTHORIZED:
      return {
        code: "AUTH_REQUIRED",
        message: "Authentication is required",
        statusCode,
      };
    case HttpStatus.FORBIDDEN:
      return { code: "FORBIDDEN", message: "Access is forbidden", statusCode };
    case HttpStatus.NOT_FOUND:
      return {
        code: "NOT_FOUND",
        message: "Resource was not found",
        statusCode,
      };
    case HttpStatus.CONFLICT:
      return { code: "CONFLICT", message: "Request conflicts", statusCode };
    case HttpStatus.TOO_MANY_REQUESTS:
      return {
        code: "RATE_LIMITED",
        message: "Request rate is limited",
        statusCode,
      };
    default:
      return {
        code: "DATA_UNAVAILABLE",
        message: "Identity service is unavailable",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      };
  }
};

const safeTraceId = (requestId: string): string =>
  /^[A-Za-z0-9._:-]{1,128}$/u.test(requestId) ? requestId : randomUUID();

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const statusCode = resolveStatusCode(exception);
    const isAuthRoute = /^\/v1\/auth(?:\/|$)/u.test(request.url);
    const contractPayload = contractErrorPayload(exception, statusCode);
    if (isAuthRoute) {
      const fallback = authFallback(statusCode);
      const payload = parseAuthErrorResponse({
        ...(contractPayload ?? {
          code: fallback.code,
          details: {},
          message: fallback.message,
        }),
        trace_id: safeTraceId(String(request.id)),
      });
      void reply
        .header("x-request-id", String(request.id))
        .status(
          contractPayload === undefined ? fallback.statusCode : statusCode,
        )
        .send(payload);
      return;
    }
    const definition = resolveDefinition(statusCode);
    const requestId = String(request.id);

    void reply.header("x-request-id", requestId).status(statusCode).send({
      statusCode,
      code: definition.code,
      message: definition.message,
      requestId,
    });
  }
}
