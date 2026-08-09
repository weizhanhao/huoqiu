import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ClientInferRequest, ClientInferResponses } from "@ts-rest/core";
import { approvedEventTypes } from "@huoqiu/contracts/events";
import { m1OperationRegistry, type AppRouter } from "@huoqiu/contracts/m1";
import { describe, expect, it } from "vitest";

import {
  contractVersion,
  m1ApiIds,
  m1EventTypes,
  type HuoqiuAppRouter,
  type HuoqiuOperationName,
  type HuoqiuOperationRequest,
  type HuoqiuOperationResponse,
} from "../src/types.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

describe("generated M1 SDK types", () => {
  it("installs both generated artifacts", () => {
    expect(existsSync(`${packageRoot}/src/types.ts`)).toBe(true);
    expect(existsSync(`${packageRoot}/generated-manifest.json`)).toBe(true);
  });

  it("provides the public package entrypoint", () => {
    expect(existsSync(`${packageRoot}/src/index.ts`)).toBe(true);
  });

  it("re-exports the client and generated runtime catalog", async () => {
    const sdk = await import("../src/index.js");

    expect(Object.keys(sdk).sort()).toEqual(
      [
        "contractVersion",
        "createHuoqiuClient",
        "m1ApiIds",
        "m1EventTypes",
      ].sort(),
    );
  });

  it("derives operation request and response types directly from AppRouter", () => {
    const routerTypeMatches: Equal<HuoqiuAppRouter, AppRouter> = true;
    const operationNamesMatch: Equal<HuoqiuOperationName, keyof AppRouter> =
      true;
    const requestTypeMatches: Equal<
      HuoqiuOperationRequest<"instrumentSearch">,
      ClientInferRequest<AppRouter["instrumentSearch"]>
    > = true;
    const responseTypeMatches: Equal<
      HuoqiuOperationResponse<"instrumentSearch">,
      ClientInferResponses<AppRouter["instrumentSearch"]>
    > = true;

    expect([
      routerTypeMatches,
      operationNamesMatch,
      requestTypeMatches,
      responseTypeMatches,
    ]).toEqual([true, true, true, true]);
  });

  it("exports exactly the approved generated IDs and public event types", () => {
    expect(contractVersion).toBe("m1.v1");
    expect(m1ApiIds).toEqual(m1OperationRegistry.map(({ apiId }) => apiId));
    expect(m1ApiIds).toHaveLength(31);
    expect(m1EventTypes).toBe(approvedEventTypes);
    expect(m1EventTypes).toHaveLength(18);
  });

  it("does not hand-copy operation methods or provider-private auth state", () => {
    const typesSource = readFileSync(`${packageRoot}/src/types.ts`, "utf8");
    const clientSource = readFileSync(`${packageRoot}/src/client.ts`, "utf8");
    const generatorSource = readFileSync(
      `${packageRoot}/scripts/generate.mts`,
      "utf8",
    );

    for (const { apiId, operationId } of m1OperationRegistry) {
      expect(typesSource).not.toContain(JSON.stringify(operationId));
      expect(generatorSource).not.toContain(JSON.stringify(apiId));
      expect(generatorSource).not.toContain(JSON.stringify(operationId));
    }
    for (const eventType of approvedEventTypes) {
      expect(typesSource).not.toContain(JSON.stringify(eventType));
      expect(generatorSource).not.toContain(JSON.stringify(eventType));
    }
    expect(`${typesSource}\n${clientSource}`).not.toMatch(
      /(?:better-auth|better_auth|keycloak|refresh_token|access_token)/iu,
    );
  });
});
