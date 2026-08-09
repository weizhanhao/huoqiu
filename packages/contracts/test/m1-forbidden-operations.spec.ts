import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { m1OperationRegistry } from "../src/m1/operation-registry.js";

const forbiddenSurfacePattern =
  /trade|private[-_ ]?fund|public[-_ ]?portfolio|push|target[-_ ]?price|ai[-_ ]?advice/iu;
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
      forbiddenSurfacePattern,
    );
    expect(readM1Source()).not.toMatch(forbiddenSurfacePattern);
  });

  it.each([
    "private_fund",
    "privateFund",
    "private-fund",
    "public_portfolio",
    "publicPortfolio",
    "public-portfolio",
    "target_price",
    "targetPrice",
    "ai_advice",
    "aiAdvice",
  ])("detects forbidden naming variant %s", (surface) => {
    expect(surface).toMatch(forbiddenSurfacePattern);
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
