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

import { getVerifiedEdgeSubject } from "./alpha-access.guard.js";
import { parseLogoutRequest } from "./auth-contract.js";
import { CredentialBoundary } from "./auth-provider.adapter.js";
import { AuthService, type IdentitySession } from "./auth.service.js";
import {
  identityHttpException,
  SuspendedActorError,
} from "./identity-error.js";

const SESSION_OPTIONAL = "huoqiu:identity:session-optional";
const SESSION_CONTEXT = Symbol("huoqiu:identity:session-context");

export const SessionOptional = () => SetMetadata(SESSION_OPTIONAL, true);

type RequestWithSession = FastifyRequest & {
  [SESSION_CONTEXT]?: IdentitySession;
};

export const getAuthenticatedSession = (
  request: FastifyRequest,
): IdentitySession => {
  const session = (request as RequestWithSession)[SESSION_CONTEXT];
  if (session === undefined) throw authenticationRequired();
  return session;
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
    @Inject(CredentialBoundary)
    private readonly credentialBoundary: CredentialBoundary,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (
      request.url === "/healthz" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return true;
    }

    const inspection = this.credentialBoundary.inspect(request);
    if (inspection.kind === "invalid") throw authenticationRequired();
    const optional = this.reflector.getAllAndOverride<boolean>(
      SESSION_OPTIONAL,
      [context.getHandler(), context.getClass()],
    );
    if (optional === true) return true;
    if (inspection.kind === "none") throw authenticationRequired();

    try {
      const session = await this.authService.resolveSession(
        inspection.credential,
      );
      if (session !== null) {
        request[SESSION_CONTEXT] = session;
        return true;
      }

      if (request.method === "POST" && request.url === "/v1/auth/logout") {
        const parsed = parseLogoutRequest(request);
        const replay = await this.authService.findLogoutReplay(
          {
            ...parsed,
            callerId: getVerifiedEdgeSubject(request),
          },
          inspection.credential,
        );
        if (replay !== null) {
          request[SESSION_CONTEXT] = replay;
          return true;
        }
      }
      throw authenticationRequired();
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
