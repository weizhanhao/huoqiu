export const AUTH_PROVIDER_PORT = Symbol("AUTH_PROVIDER_PORT");

export type AuthTransport = "bearer" | "cookie";

export type ProviderRequestCredential =
  | Readonly<{
      authorizationHeader: string;
      transport: "bearer";
    }>
  | Readonly<{
      cookieHeader: string;
      transport: "cookie";
    }>;

export type IssuedProviderCredential =
  | Readonly<{
      responseHeaderValue: string;
      transport: "bearer";
    }>
  | Readonly<{
      responseHeaderValue: string;
      transport: "cookie";
    }>;

export type ProviderSession = Readonly<{
  credential: ProviderRequestCredential;
  expiresAt: Date;
  providerSessionId: string;
  providerUserId: string;
}>;

export type IssuedProviderSession = ProviderSession &
  Readonly<{ issuedCredential: IssuedProviderCredential }>;

export interface AuthProviderPort {
  login(
    input: Readonly<{
      email: string;
      password: string;
      transport: AuthTransport;
    }>,
  ): Promise<IssuedProviderSession>;
  logout(credential: ProviderRequestCredential): Promise<void>;
  register(
    input: Readonly<{
      displayName: string;
      email: string;
      password: string;
    }>,
  ): Promise<IssuedProviderSession>;
  resolveSession(
    credential: ProviderRequestCredential,
  ): Promise<ProviderSession | null>;
  revokeActorSessions(providerUserId: string): Promise<void>;
}
