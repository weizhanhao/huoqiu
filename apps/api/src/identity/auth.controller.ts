import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  AuthService,
  type IdentitySession,
  type IssuedIdentitySession,
} from "./auth.service.js";
import { getAuthenticatedSession, SessionOptional } from "./session.guard.js";

const bodyWithIdempotencyKey = (
  body: unknown,
  idempotencyKey: unknown,
): unknown =>
  typeof body === "object" && body !== null && !Array.isArray(body)
    ? { ...body, idempotencyKey }
    : { idempotencyKey };

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

const applyCredential = (
  reply: FastifyReply,
  session: IssuedIdentitySession,
): void => {
  if (session.issuedCredential.transport === "cookie") {
    void reply.header(
      "set-cookie",
      session.issuedCredential.responseHeaderValue,
    );
    return;
  }
  void reply
    .header("set-auth-token", session.issuedCredential.responseHeaderValue)
    .header("access-control-expose-headers", "set-auth-token");
};

@Controller("v1/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(201)
  @SessionOptional()
  async register(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const session = await this.authService.register(
      bodyWithIdempotencyKey(body, idempotencyKey),
    );
    applyCredential(reply, session);
    return {
      ...requestMetadata(request),
      session: publicSession(session),
    };
  }

  @Post("login")
  @HttpCode(200)
  @SessionOptional()
  async login(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const session = await this.authService.login(
      bodyWithIdempotencyKey(body, idempotencyKey),
    );
    applyCredential(reply, session);
    return {
      ...requestMetadata(request),
      session: publicSession(session),
    };
  }

  @Get("session")
  getSession(@Req() request: FastifyRequest): unknown {
    const session = getAuthenticatedSession(request);
    return {
      ...requestMetadata(request),
      session: publicSession(session),
    };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<unknown> {
    this.authService.validateLogout(
      bodyWithIdempotencyKey(body, idempotencyKey),
    );
    await this.authService.logout(getAuthenticatedSession(request));
    return { ...requestMetadata(request), revoked: true as const };
  }
}
