import { m1Router } from "@huoqiu/contracts/m1";
import type { FastifyRequest } from "fastify";

import { validationFailure } from "./identity-error.js";

export type RegisterBody = ReturnType<typeof m1Router.authRegister.body.parse>;
export type LoginBody = ReturnType<typeof m1Router.authLogin.body.parse>;
export type LogoutBody = ReturnType<typeof m1Router.authLogout.body.parse>;

export type IdempotentRequest<TBody> = Readonly<{
  body: TBody;
  idempotencyKey: string;
}>;

const rawHeaderValues = (
  request: FastifyRequest,
  name: string,
): readonly string[] => {
  const values: string[] = [];
  const rawHeaders = request.raw.rawHeaders;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) {
      const value = rawHeaders[index + 1];
      if (value !== undefined) values.push(value);
    }
  }
  if (values.length > 0) return values;
  const value = request.headers[name];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return [];
};

const parseIdempotencyKey = (
  request: FastifyRequest,
  parseHeaders: (input: unknown) => Readonly<{ "idempotency-key": string }>,
): string => {
  const values = rawHeaderValues(request, "idempotency-key");
  const value = values[0];
  if (values.length !== 1 || value === undefined || /[\r\n,]/u.test(value)) {
    throw validationFailure();
  }
  try {
    return parseHeaders({ "idempotency-key": value })["idempotency-key"];
  } catch {
    throw validationFailure();
  }
};

const parseBody = <T>(parse: (input: unknown) => T, body: unknown): T => {
  try {
    return parse(body);
  } catch {
    throw validationFailure();
  }
};

export const parseRegisterRequest = (
  request: FastifyRequest,
): IdempotentRequest<RegisterBody> => ({
  body: parseBody(m1Router.authRegister.body.parse, request.body),
  idempotencyKey: parseIdempotencyKey(
    request,
    m1Router.authRegister.headers.parse,
  ),
});

export const parseLoginRequest = (
  request: FastifyRequest,
): IdempotentRequest<LoginBody> => ({
  body: parseBody(m1Router.authLogin.body.parse, request.body),
  idempotencyKey: parseIdempotencyKey(
    request,
    m1Router.authLogin.headers.parse,
  ),
});

export const parseLogoutRequest = (
  request: FastifyRequest,
): IdempotentRequest<LogoutBody> => ({
  body: parseBody(m1Router.authLogout.body.parse, request.body),
  idempotencyKey: parseIdempotencyKey(
    request,
    m1Router.authLogout.headers.parse,
  ),
});

export const parseRegisterResponse = (response: unknown): unknown =>
  m1Router.authRegister.responses[201].parse(response);

export const parseLoginResponse = (response: unknown): unknown =>
  m1Router.authLogin.responses[200].parse(response);

export const parseSessionResponse = (response: unknown): unknown =>
  m1Router.authGetSession.responses[200].parse(response);

export const parseLogoutResponse = (response: unknown): unknown =>
  m1Router.authLogout.responses[200].parse(response);

export const parseAuthErrorResponse = (response: unknown): unknown =>
  m1Router.authRegister.responses[400].parse(response);
