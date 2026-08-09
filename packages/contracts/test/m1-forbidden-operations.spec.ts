import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { m1OperationRegistry } from "../src/m1/operation-registry.js";

const m1SourceDirectory = resolve(import.meta.dirname, "../src/m1");
const readM1Source = (): string =>
  readdirSync(m1SourceDirectory)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => readFileSync(resolve(m1SourceDirectory, name), "utf8"))
    .join("\n");

describe("M1 forbidden surfaces", () => {
  it("contains no disabled operation or product surface", () => {
    expect(JSON.stringify(m1OperationRegistry)).not.toMatch(
      /trade|private_fund|public_portfolio|push|target_price|ai_advice/iu,
    );
    expect(readM1Source()).not.toMatch(
      /trade|private_fund|public_portfolio|push|target_price|ai_advice/iu,
    );
  });

  it("keeps the public auth contract provider-neutral", () => {
    const authSource = readFileSync(
      resolve(m1SourceDirectory, "auth.contract.ts"),
      "utf8",
    );

    expect(authSource).not.toMatch(
      /better[-_ ]?auth|keycloak|realm|client_secret|access_token|refresh_token|id_token|auth_accounts|auth_sessions|auth_verifications/iu,
    );
  });
});
