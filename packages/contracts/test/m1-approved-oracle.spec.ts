import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { m1OperationRegistry } from "../src/m1/operation-registry.js";

interface ApprovedOperation {
  api_id: string;
  operation_id: string;
  method: string;
  path: string;
  cap_id: string;
  action: string;
}

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const oracleDirectory = resolve(repositoryRoot, "quality/oracles/m1");

const readApprovedHashes = (): ReadonlyMap<string, string> => {
  const manifest = readFileSync(
    resolve(oracleDirectory, "approved.sha256"),
    "utf8",
  );
  const entries = manifest
    .trim()
    .split("\n")
    .map((line) => line.match(/^([a-f0-9]{64}) {2}(.+)$/u))
    .map((match) => {
      if (match?.[1] === undefined || match[2] === undefined) {
        throw new Error("Malformed approved SHA manifest");
      }
      return [match[2], match[1]] as const;
    });

  return new Map(entries);
};

describe("independently approved M1 operation oracle", () => {
  it("verifies the approved SHA before comparing every registry field", () => {
    const oraclePath = "quality/oracles/m1/api-operations.v1.json";
    const oracleBytes = readFileSync(resolve(repositoryRoot, oraclePath));
    const approvedHash = readApprovedHashes().get(oraclePath);

    expect(approvedHash).toBeDefined();
    expect(createHash("sha256").update(oracleBytes).digest("hex")).toBe(
      approvedHash,
    );

    const approved = JSON.parse(
      oracleBytes.toString("utf8"),
    ) as readonly ApprovedOperation[];
    const normalizedRegistry = m1OperationRegistry.map((item) => ({
      api_id: item.apiId,
      operation_id: item.operationId,
      method: item.method,
      path: item.path,
      cap_id: item.capId,
      action: item.action,
    }));

    expect(normalizedRegistry).toEqual(approved);
  });
});
