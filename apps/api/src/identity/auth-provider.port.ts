export const AUTH_PROVIDER_PORT = Symbol("AUTH_PROVIDER_PORT");

export type AuthTransport = "bearer" | "cookie";

declare const credentialCapabilityBrand: unique symbol;

/**
 * An opaque authority over one authentication credential.
 *
 * The public application boundary can compare the irreversible fingerprint
 * and transport, but only the private adapter can recover request or delivery
 * material from the capability.
 */
export type AuthCredentialCapability = Readonly<{
  fingerprint: string;
  transport: AuthTransport;
  [credentialCapabilityBrand]: true;
}>;

export type AuthSubjectSession = Readonly<{
  credential: AuthCredentialCapability;
  expiresAt: Date;
  subjectId: string;
}>;

export interface AuthProviderPort {
  login(
    input: Readonly<{
      email: string;
      password: string;
      transport: AuthTransport;
    }>,
  ): Promise<AuthSubjectSession>;
  logout(credential: AuthCredentialCapability): Promise<void>;
  register(
    input: Readonly<{
      displayName: string;
      email: string;
      password: string;
    }>,
  ): Promise<AuthSubjectSession>;
  resolveSession(
    credential: AuthCredentialCapability,
  ): Promise<AuthSubjectSession | null>;
  revokeSubjectSessions(subjectId: string): Promise<void>;
}
