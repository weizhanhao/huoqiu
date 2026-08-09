import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import {
  AuthService,
  type IdentitySession,
  identityHttpException,
  SuspendedActorError,
} from "./auth.service.js";
import type { ProviderRequestCredential } from "./auth-provider.port.js";

const SESSION_OPTIONAL = "huoqiu:identity:session-optional";
const SESSION_CONTEXT = Symbol("huoqiu:identity:session-context");
const SESSION_COOKIE_NAME = "__Secure-huoqiu.session_token";

export const SessionOptional = () => SetMetadata(SESSION_OPTIONAL, true);

type RequestWithSession = FastifyRequest & {
  [SESSION_CONTEXT]?: IdentitySession;
};

export const getAuthenticatedSession = (
  request: FastifyRequest,
): IdentitySession => {
  const session = (request as RequestWithSession)[SESSION_CONTEXT];
  if (session === undefined) {
    throw identityHttpException(
      HttpStatus.UNAUTHORIZED,
      "AUTH_REQUIRED",
      "Authentication is required",
    );
  }
  return session;
};

const extractCredential = (
  request: FastifyRequest,
): ProviderRequestCredential | null => {
  const authorization = request.headers.authorization;
  const cookie = request.headers.cookie;
  const hasBearer =
    typeof authorization === "string" && authorization.startsWith("Bearer ");
  const hasCookie =
    typeof cookie === "string" &&
    cookie.split(";").some((part) => {
      const normalized = part.trim();
      const separator = normalized.indexOf("=");
      return (
        separator >= 0 && normalized.slice(0, separator) === SESSION_COOKIE_NAME
      );
    });
  if (hasBearer === hasCookie) return null;
  return hasBearer
    ? { authorizationHeader: authorization, transport: "bearer" }
    : { cookieHeader: cookie as string, transport: "cookie" };
};

const authenticationRequired = () =>
  identityHttpException(
    HttpStatus.UNAUTHORIZED,
    "AUTH_REQUIRED",
    "Authentication is required",
  );

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (
      request.url === "/healthz" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return true;
    }
    const optional = this.reflector.getAllAndOverride<boolean>(
      SESSION_OPTIONAL,
      [context.getHandler(), context.getClass()],
    );
    if (optional === true) return true;

    const credential = extractCredential(request);
    if (credential === null) throw authenticationRequired();
    try {
      const session = await this.authService.resolveSession(credential);
      if (session === null) throw authenticationRequired();
      request[SESSION_CONTEXT] = session;
      return true;
    } catch (error) {
      if (error instanceof SuspendedActorError) {
        throw identityHttpException(
          HttpStatus.FORBIDDEN,
          "FORBIDDEN",
          "Actor is suspended",
        );
      }
      throw error;
    }
  }
}
