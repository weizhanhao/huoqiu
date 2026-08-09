import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getVerifiedEdgeSubject } from "./alpha-access.guard.js";
import {
  parseLoginRequest,
  parseLoginResponse,
  parseLogoutRequest,
  parseLogoutResponse,
  parseRegisterRequest,
  parseRegisterResponse,
  parseSessionResponse,
} from "./auth-contract.js";
import { CredentialBoundary } from "./auth-provider.adapter.js";
import { AuthService, type IdentitySession } from "./auth.service.js";
import { getAuthenticatedSession, SessionOptional } from "./session.guard.js";

const requestMetadata = (
  request: FastifyRequest,
): Readonly<{ request_id: string; trace_id: string }> => {
  const requestId = String(request.id);
  return { request_id: requestId, trace_id: requestId };
};

const publicSession = (session: IdentitySession) => ({
  actor: {
    actor_id: session.actor.actorId,
    consent_version: session.actor.consentVersion,
    display_name: session.actor.displayName,
    roles: [...session.actor.roles],
  },
  expires_at: session.expiresAt.toISOString(),
  transport: session.transport,
});

@Controller("v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CredentialBoundary)
    private readonly credentialBoundary: CredentialBoundary,
  ) {}

  @Post("register")
  @HttpCode(201)
  @SessionOptional()
  async register(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const session = await this.authService.register({
      ...parseRegisterRequest(request),
      callerId: getVerifiedEdgeSubject(request),
    });
    this.credentialBoundary.deliver(reply, session.credential);
    return parseRegisterResponse({
      ...requestMetadata(request),
      session: publicSession(session),
    });
  }

  @Post("login")
  @HttpCode(200)
  @SessionOptional()
  async login(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const session = await this.authService.login({
      ...parseLoginRequest(request),
      callerId: getVerifiedEdgeSubject(request),
    });
    this.credentialBoundary.deliver(reply, session.credential);
    return parseLoginResponse({
      ...requestMetadata(request),
      session: publicSession(session),
    });
  }

  @Get("session")
  getSession(@Req() request: FastifyRequest): unknown {
    return parseSessionResponse({
      ...requestMetadata(request),
      session: publicSession(getAuthenticatedSession(request)),
    });
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() request: FastifyRequest): Promise<unknown> {
    await this.authService.logout(
      {
        ...parseLogoutRequest(request),
        callerId: getVerifiedEdgeSubject(request),
      },
      getAuthenticatedSession(request),
    );
    return parseLogoutResponse({
      ...requestMetadata(request),
      revoked: true,
    });
  }
}
