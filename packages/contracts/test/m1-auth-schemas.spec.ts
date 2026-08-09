import { readFileSync } from "node:fs";

import * as publicAuthSchemas from "@huoqiu/contracts/m1/auth-schemas";
import { describe, expect, it } from "vitest";

import { authContract } from "../src/m1/auth.contract.js";
import * as authContractExports from "../src/m1/auth.contract.js";
import * as authoritativeAuthSchemas from "../src/m1/auth.schemas.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { exports: Record<string, string> };
const schemaExportNames = [
  "actorRoleSchema",
  "actorSchema",
  "authLoginBodySchema",
  "authLogoutBodySchema",
  "authRegisterBodySchema",
  "authSessionResponseSchema",
  "authTransportSchema",
  "sessionViewSchema",
] as const;

describe("M1 authoritative auth schemas", () => {
  it("publishes the narrow auth schema entrypoint", () => {
    expect(packageJson.exports["./m1/auth-schemas"]).toBe(
      "./src/m1/auth.schemas.ts",
    );
  });

  it("installs the exported schema objects directly into every auth route", () => {
    for (const schemaName of schemaExportNames) {
      expect(publicAuthSchemas[schemaName]).toBe(
        authoritativeAuthSchemas[schemaName],
      );
      expect(authContractExports[schemaName]).toBe(
        publicAuthSchemas[schemaName],
      );
    }
    expect(authContract.authRegister.body).toBe(
      publicAuthSchemas.authRegisterBodySchema,
    );
    expect(authContract.authLogin.body).toBe(
      publicAuthSchemas.authLoginBodySchema,
    );
    expect(authContract.authLogout.body).toBe(
      publicAuthSchemas.authLogoutBodySchema,
    );
    expect(authContract.authRegister.responses[201]).toBe(
      publicAuthSchemas.authSessionResponseSchema,
    );
    expect(authContract.authLogin.responses[200]).toBe(
      publicAuthSchemas.authSessionResponseSchema,
    );
    expect(authContract.authGetSession.responses[200]).toBe(
      publicAuthSchemas.authSessionResponseSchema,
    );
  });
});
