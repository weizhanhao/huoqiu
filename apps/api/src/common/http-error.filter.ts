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

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const statusCode = resolveStatusCode(exception);
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
