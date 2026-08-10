import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const randomSecret = () => randomBytes(32).toString("base64url");

const encodeUrlComponent = (value) => encodeURIComponent(value);

export const createLocalEnvironment = () => {
  const postgresPassword = randomSecret();
  const valkeyPassword = randomSecret();
  const databaseName = "huoqiu_local";
  const databaseUser = "huoqiu_local";

  return Object.freeze({
    ALPHA_INVITE_CODES: `alpha-${randomSecret()}`,
    APP_ENV: "local",
    BETTER_AUTH_SECRET: randomSecret(),
    DATABASE_URL: `postgresql://${databaseUser}:${encodeUrlComponent(postgresPassword)}@127.0.0.1:5432/${databaseName}`,
    HTTP_HOST: "127.0.0.1",
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    OTEL_SERVICE_NAME: "huoqiu-api",
    PORT: "3000",
    POSTGRES_DB: databaseName,
    POSTGRES_PASSWORD: postgresPassword,
    POSTGRES_USER: databaseUser,
    VALKEY_PASSWORD: valkeyPassword,
    VALKEY_URL: `redis://:${encodeUrlComponent(valkeyPassword)}@127.0.0.1:6379/0`,
    ZERO_TRUST_HMAC_SECRET: randomSecret(),
    ZERO_TRUST_ISSUER: "http://127.0.0.1:8787",
    ZERO_TRUST_MAX_SKEW_SECONDS: "300",
  });
};

const serializeEnvironment = (environment) =>
  `${Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;

export const generateLocalEnv = async (outputPath) => {
  const environment = createLocalEnvironment();
  await writeFile(outputPath, serializeEnvironment(environment), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return environment;
};

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1];
const isDirectRun = (() => {
  if (invokedPath === undefined) return false;
  try {
    return realpathSync(resolve(invokedPath)) === realpathSync(modulePath);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  const outputPath = resolve(dirname(modulePath), "../.env");
  generateLocalEnv(outputPath)
    .then(() => {
      process.stdout.write(`LOCAL_ENV_CREATED ${outputPath}\n`);
    })
    .catch((error) => {
      const code = error && typeof error === "object" ? error.code : undefined;
      process.stderr.write(
        `${code === "EEXIST" ? "LOCAL_ENV_EXISTS" : "LOCAL_ENV_CREATE_FAILED"}\n`,
      );
      process.exitCode = 1;
    });
}
