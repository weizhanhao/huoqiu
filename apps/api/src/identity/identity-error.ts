import { HttpException, HttpStatus } from "@nestjs/common";

export type IdentityErrorCode =
  | "AUTH_REQUIRED"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "VALIDATION_FAILED";

const IDENTITY_ERROR = Symbol("huoqiu:identity:contract-error");

type IdentityHttpException = HttpException & {
  [IDENTITY_ERROR]: true;
};

export const identityHttpException = (
  status: number,
  code: IdentityErrorCode,
  message: string,
): HttpException => {
  const exception = new HttpException({ code, details: {}, message }, status);
  Object.defineProperty(exception, IDENTITY_ERROR, { value: true });
  return exception;
};

export const isIdentityHttpException = (
  value: unknown,
): value is IdentityHttpException =>
  value instanceof HttpException &&
  (value as Partial<IdentityHttpException>)[IDENTITY_ERROR] === true;

export const validationFailure = (): HttpException =>
  identityHttpException(
    HttpStatus.BAD_REQUEST,
    "VALIDATION_FAILED",
    "Request validation failed",
  );

export const idempotencyConflict = (): HttpException =>
  identityHttpException(
    HttpStatus.CONFLICT,
    "CONFLICT",
    "Idempotency key conflicts with another request",
  );

export const idempotencyCapacityExceeded = (): HttpException =>
  identityHttpException(
    HttpStatus.TOO_MANY_REQUESTS,
    "RATE_LIMITED",
    "Idempotency capacity is temporarily exhausted",
  );

export class SuspendedActorError extends Error {
  override readonly name = "SuspendedActorError";
}
