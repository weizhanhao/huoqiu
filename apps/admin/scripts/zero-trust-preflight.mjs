import process from "node:process";
import { TextEncoder } from "node:util";

const CONFIGURATION_ERROR = "ADMIN_ZERO_TRUST_CONFIGURATION_REQUIRED";
const MAX_CONFIGURED_SKEW_SECONDS = 3600;
const MINIMUM_SECRET_BYTES = 32;
const APP_ENVIRONMENTS = new Set([
  "development",
  "production",
  "staging",
  "test",
]);

const hasForbiddenSingleValueCharacter = (value) => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      character === "," ||
      /\s/u.test(character) ||
      (codePoint !== undefined &&
        (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)))
    ) {
      return true;
    }
  }

  return false;
};

const hasValidSkew = (rawValue) => {
  if (rawValue === undefined || rawValue === "") {
    return true;
  }
  if (!/^(0|[1-9]\d*)$/u.test(rawValue)) {
    return false;
  }

  const parsed = Number(rawValue);
  return (
    Number.isSafeInteger(parsed) &&
    parsed >= 1 &&
    parsed <= MAX_CONFIGURED_SKEW_SECONDS
  );
};

const hasValidConfiguration = (environment) => {
  const appEnvironment = environment.APP_ENV;
  const issuer = environment.ZERO_TRUST_ISSUER;
  const secret = environment.ZERO_TRUST_HMAC_SECRET;

  return (
    appEnvironment !== undefined &&
    APP_ENVIRONMENTS.has(appEnvironment) &&
    issuer !== undefined &&
    issuer.length > 0 &&
    issuer.length <= 256 &&
    !hasForbiddenSingleValueCharacter(issuer) &&
    secret !== undefined &&
    new TextEncoder().encode(secret).byteLength >= MINIMUM_SECRET_BYTES &&
    hasValidSkew(environment.ZERO_TRUST_MAX_SKEW_SECONDS)
  );
};

if (!hasValidConfiguration(process.env)) {
  process.stderr.write(`${CONFIGURATION_ERROR}\n`);
  process.exitCode = 78;
}
