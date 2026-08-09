export type ZeroTrustConfiguration = Readonly<{
  hmacSecret: string;
  issuer: string;
  maxSkewSeconds: number;
}>;

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const DEFAULT_MAX_SKEW_SECONDS = 300;
const MAX_MAX_SKEW_SECONDS = 3600;
const MAX_IDENTITY_FIELD_LENGTH = 256;
const CONTROL_CHARACTER_PATTERN = /\p{C}/u;
const POSITIVE_DECIMAL_PATTERN = /^[1-9]\d*$/u;

const configurationFailure = (): Error =>
  new Error("ZERO_TRUST_CONFIGURATION_INVALID");

const hasControlCharacter = (value: string): boolean =>
  CONTROL_CHARACTER_PATTERN.test(value);

const isValidIdentityField = (value: string | undefined): value is string =>
  value !== undefined &&
  value.length > 0 &&
  value.length <= MAX_IDENTITY_FIELD_LENGTH &&
  value.trim() === value &&
  !hasControlCharacter(value);

const readMaxSkewSeconds = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_MAX_SKEW_SECONDS;
  }

  if (!POSITIVE_DECIMAL_PATTERN.test(value)) {
    throw configurationFailure();
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_MAX_SKEW_SECONDS
  ) {
    throw configurationFailure();
  }

  return parsed;
};

export const loadZeroTrustConfiguration = (
  environment: RuntimeEnvironment,
): ZeroTrustConfiguration => {
  const hmacSecret = environment.ZERO_TRUST_HMAC_SECRET;
  const issuer = environment.ZERO_TRUST_ISSUER;

  if (
    hmacSecret === undefined ||
    new TextEncoder().encode(hmacSecret).byteLength < 32 ||
    !isValidIdentityField(issuer)
  ) {
    throw configurationFailure();
  }

  return {
    hmacSecret,
    issuer,
    maxSkewSeconds: readMaxSkewSeconds(environment.ZERO_TRUST_MAX_SKEW_SECONDS),
  };
};

export const assertZeroTrustStartupConfiguration = (
  environment: RuntimeEnvironment,
): void => {
  if (
    environment.APP_ENV === "production" ||
    environment.APP_ENV === "staging"
  ) {
    loadZeroTrustConfiguration(environment);
  }
};
