import { randomUUID } from "node:crypto";

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

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
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
} as const;

const contractErrorMessages = new Set([
  "Actor is suspended",
  "Actor was not found",
  "Alpha access is required",
  "Authentication failed",
  "Authentication is required",
  "Invitation is unavailable",
  "Request validation failed",
  "Valid edge proof is required",
]);

type ContractErrorPayload = Readonly<{
  code: keyof typeof contractErrorStatuses;
  details: Readonly<Record<string, never>>;
  message: string;
}>;

const contractErrorPayload = (
  exception: unknown,
  statusCode: number,
): ContractErrorPayload | undefined => {
  if (!(exception instanceof HttpException)) return undefined;
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
    !contractErrorMessages.has(message) ||
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

const safeTraceId = (requestId: string): string =>
  /^[A-Za-z0-9._:-]{1,128}$/u.test(requestId) ? requestId : randomUUID();

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const statusCode = resolveStatusCode(exception);
    const contractPayload = contractErrorPayload(exception, statusCode);
    if (contractPayload !== undefined) {
      void reply
        .header("x-request-id", String(request.id))
        .status(statusCode)
        .send({
          ...contractPayload,
          trace_id: safeTraceId(String(request.id)),
        });
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
