import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";

import { m1OperationRegistry } from "../src/m1/operation-registry.js";
import { m1Router } from "../src/m1/router.js";

type JsonValue = boolean | null | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface ApprovedOperation {
  readonly api_id: string;
  readonly operation_id: string;
  readonly method: string;
  readonly path: string;
  readonly cap_id: string;
  readonly action: string;
}

interface GeneratedOperation {
  readonly method: string;
  readonly path: string;
  readonly operation: JsonObject;
}

const INT64_PATTERN = "^(?:0|[1-9][0-9]{0,18})$";
const INT64_ETAG_PATTERN = '^"(?:0|[1-9][0-9]{0,18})"$';
const DECIMAL_PATTERN = "^-?[0-9]+(?:\\.[0-9]+)?$";
const MAX_INT64 = "9223372036854775807";
const httpMethods = new Set(["delete", "get", "patch", "post", "put"]);
const contractsDirectory = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(contractsDirectory, "../..");
const oracleDirectory = resolve(repositoryRoot, "quality/oracles/m1");
const defaultOpenApiPath = resolve(
  contractsDirectory,
  "openapi/huoqiu.v1.yaml",
);
const candidatePath = process.env.OPENAPI_CANDIDATE
  ? resolve(process.env.OPENAPI_CANDIDATE)
  : defaultOpenApiPath;

const requireObject = (value: unknown, label: string): JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonObject;
};

const requireArray = (
  value: JsonValue | undefined,
  label: string,
): readonly JsonValue[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
};

const requireString = (value: JsonValue | undefined, label: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
};

const readApprovedHash = (oraclePath: string): string => {
  const manifest = readFileSync(
    resolve(oracleDirectory, "approved.sha256"),
    "utf8",
  );
  for (const line of manifest.trim().split("\n")) {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/u);
    if (match?.[2] === oraclePath && match[1] !== undefined) {
      return match[1];
    }
  }
  throw new Error(`No approved hash for ${oraclePath}`);
};

const collectOperations = (
  document: JsonObject,
): readonly GeneratedOperation[] => {
  const paths = requireObject(document.paths, "paths");
  return Object.entries(paths).flatMap(([path, pathValue]) => {
    const pathObject = requireObject(pathValue, `paths.${path}`);
    return Object.entries(pathObject).flatMap(([method, operation]) =>
      httpMethods.has(method)
        ? [
            {
              method: method.toUpperCase(),
              path,
              operation: requireObject(operation, `${method} ${path}`),
            },
          ]
        : [],
    );
  });
};

const compareKeys = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const expectDeepSortedKeys = (value: JsonValue, location = "$"): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectDeepSortedKeys(item, `${location}[${index}]`),
    );
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }

  const keys = Object.keys(value);
  expect(keys, location).toEqual([...keys].sort(compareKeys));
  for (const [key, child] of Object.entries(value)) {
    expectDeepSortedKeys(child, `${location}.${key}`);
  }
};

const collectPropertySchemas = (
  value: JsonValue,
  names: ReadonlySet<string>,
  output: JsonObject[] = [],
): readonly JsonObject[] => {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectPropertySchemas(child, names, output);
    }
    return output;
  }
  if (typeof value !== "object" || value === null) {
    return output;
  }

  const properties = value.properties;
  if (
    typeof properties === "object" &&
    properties !== null &&
    !Array.isArray(properties)
  ) {
    for (const [name, schema] of Object.entries(properties)) {
      if (names.has(name)) {
        output.push(requireObject(schema, `properties.${name}`));
      }
    }
  }
  for (const child of Object.values(value)) {
    collectPropertySchemas(child, names, output);
  }
  return output;
};

const findHeader = (
  operation: JsonObject,
  expectedName: string,
): JsonObject | undefined => {
  const parameters = requireArray(
    operation.parameters,
    `${String(operation.operationId)}.parameters`,
  );
  return parameters
    .map((parameter) => requireObject(parameter, "parameter"))
    .find(
      (parameter) =>
        parameter.in === "header" && parameter.name === expectedName,
    );
};

const runGenerator = (arguments_: readonly string[]) =>
  spawnSync("pnpm", ["generate:openapi", "--", ...arguments_], {
    cwd: contractsDirectory,
    encoding: "utf8",
    env: process.env,
  });

let approvedOperations: readonly ApprovedOperation[];
let document: JsonObject;
let openApiBytes: string;
let operations: readonly GeneratedOperation[];
let operationsById: ReadonlyMap<string, GeneratedOperation>;

beforeAll(() => {
  const oraclePath = "quality/oracles/m1/api-operations.v1.json";
  const oracleBytes = readFileSync(resolve(repositoryRoot, oraclePath));
  const actualHash = createHash("sha256").update(oracleBytes).digest("hex");

  expect(actualHash).toBe(readApprovedHash(oraclePath));
  approvedOperations = JSON.parse(
    oracleBytes.toString("utf8"),
  ) as readonly ApprovedOperation[];

  openApiBytes = readFileSync(candidatePath, "utf8");
  document = requireObject(parse(openApiBytes), "OpenAPI document");
  operations = collectOperations(document);
  operationsById = new Map(
    operations.map((item) => [
      requireString(item.operation.operationId, "operationId"),
      item,
    ]),
  );
});

describe("generated M1 OpenAPI", () => {
  it("uses OpenAPI 3.1 and stable contract metadata without machine-local data", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.jsonSchemaDialect).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(document["x-contract-version"]).toBe("m1.v1");
    expect(openApiBytes).not.toContain(repositoryRoot);
    expect(openApiBytes).not.toMatch(
      /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u,
    );
    expectDeepSortedKeys(document);
  });

  it("matches all six independently approved oracle fields for exactly 31 operations", () => {
    expect(operations).toHaveLength(31);
    expect(operationsById.size).toBe(31);

    const normalized = approvedOperations.map((approved) => {
      const generated = operationsById.get(approved.operation_id);
      expect(generated, approved.operation_id).toBeDefined();
      if (generated === undefined) {
        throw new Error(`Missing operation ${approved.operation_id}`);
      }
      const operation = generated.operation;
      return {
        api_id: requireString(operation["x-api-id"], "x-api-id"),
        operation_id: requireString(operation.operationId, "operationId"),
        method: generated.method,
        path: generated.path.replace(/\{([A-Za-z0-9_]+)\}/gu, ":$1"),
        cap_id: requireString(operation["x-cap-id"], "x-cap-id"),
        action: requireString(operation["x-action"], "x-action"),
      };
    });

    expect(normalized).toEqual(approvedOperations);
  });

  it("copies permission, roles, mutation, statuses, and headers from the registry", () => {
    for (const registration of m1OperationRegistry) {
      const generated = operationsById.get(registration.operationId);
      expect(generated, registration.operationId).toBeDefined();
      if (generated === undefined) {
        continue;
      }
      const operation = generated.operation;
      expect(operation["x-permission"], registration.operationId).toBe(
        registration.permission,
      );
      expect(operation["x-roles"], registration.operationId).toEqual(
        registration.roles,
      );
      expect(operation["x-mutation"], registration.operationId).toEqual(
        registration.mutation,
      );

      const route = m1Router[registration.operationId];
      const responses = requireObject(
        operation.responses,
        `${registration.operationId}.responses`,
      );
      expect(Object.keys(responses).sort(), registration.operationId).toEqual(
        Object.keys(route.responses).sort(),
      );
      expect(Object.keys(responses)).not.toContain("default");
      for (const status of Object.keys(responses)) {
        const response = requireObject(
          responses[status],
          `${registration.operationId}.responses.${status}`,
        );
        const content = requireObject(
          response.content,
          `${registration.operationId}.responses.${status}.content`,
        );
        if (Number(status) >= 400) {
          expect(
            content["application/json"],
            `${registration.operationId} ${status}`,
          ).toBeDefined();
        } else if (registration.operationId !== "notificationStream") {
          expect(
            content["application/json"],
            `${registration.operationId} ${status}`,
          ).toBeDefined();
        }
      }

      const idempotencyHeader = findHeader(operation, "Idempotency-Key");
      const requiresIdempotency =
        registration.mutation.kind === "command" &&
        registration.mutation.idempotencyKey;
      expect(Boolean(idempotencyHeader), registration.operationId).toBe(
        requiresIdempotency,
      );
      if (idempotencyHeader !== undefined) {
        expect(idempotencyHeader.required).toBe(true);
        expect(idempotencyHeader.schema).toMatchObject({
          maxLength: 128,
          minLength: 8,
          type: "string",
        });
      }

      const ifMatchHeader = findHeader(operation, "If-Match");
      const requiresIfMatch =
        registration.mutation.kind === "command" &&
        "concurrency" in registration.mutation &&
        registration.mutation.concurrency === "if-match";
      expect(Boolean(ifMatchHeader), registration.operationId).toBe(
        requiresIfMatch,
      );
    }
  });

  it("models provider-neutral Web cookie or App bearer security from registry permissions", () => {
    const components = requireObject(document.components, "components");
    const schemes = requireObject(
      components.securitySchemes,
      "components.securitySchemes",
    );
    expect(schemes).toEqual({
      AppBearer: {
        description: "Provider-neutral App bearer session credential.",
        scheme: "bearer",
        type: "http",
      },
      WebSessionCookie: {
        description: "Provider-neutral HttpOnly Web session cookie.",
        in: "cookie",
        name: "huoqiu_session",
        type: "apiKey",
      },
    });

    const unauthenticatedPermissions = new Set([
      "Guest",
      "Invited Guest",
      "Public",
      "Public/Owner",
    ]);
    for (const registration of m1OperationRegistry) {
      const operation = operationsById.get(registration.operationId)?.operation;
      expect(operation, registration.operationId).toBeDefined();
      if (operation === undefined) {
        continue;
      }
      const security = requireArray(
        operation.security,
        `${registration.operationId}.security`,
      );
      expect(security, registration.operationId).toEqual(
        unauthenticatedPermissions.has(registration.permission)
          ? []
          : [{ WebSessionCookie: [] }, { AppBearer: [] }],
      );
    }

    expect(openApiBytes).not.toMatch(
      /better[-_ ]?auth|keycloak|realm|client_secret|access_token|refresh_token|id_token|auth_accounts|auth_sessions|auth_verifications/iu,
    );
  });

  it("keeps the notification stream on a dedicated non-buffering SSE transport", () => {
    const operation = operationsById.get("notificationStream")?.operation;
    expect(operation).toBeDefined();
    if (operation === undefined) {
      return;
    }
    expect(operation["x-transport"]).toBe("dedicated-sse");
    expect(operation["x-default-ts-rest-client"]).toBe(false);
    expect(requireString(operation.description, "SSE description")).toMatch(
      /do not use the default ts-rest client.+buffers text/iu,
    );

    const responses = requireObject(operation.responses, "SSE responses");
    const success = requireObject(responses["200"], "SSE 200 response");
    const content = requireObject(success.content, "SSE 200 content");
    expect(Object.keys(content)).toEqual(["text/event-stream"]);
    const mediaType = requireObject(
      content["text/event-stream"],
      "SSE media type",
    );
    expect(mediaType.schema).toMatchObject({ type: "string" });
    expect(content["application/json"]).toBeUndefined();

    const lastEventId = findHeader(operation, "Last-Event-ID");
    expect(lastEventId).toBeDefined();
    expect(lastEventId?.required).toBeUndefined();
  });

  it("uses JSON Schema 2020-12 null unions and no OpenAPI 3.0 nullable keyword", () => {
    const visit = (value: JsonValue): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== "object" || value === null) {
        return;
      }
      expect(value).not.toHaveProperty("nullable");
      if ("exclusiveMinimum" in value) {
        expect(typeof value.exclusiveMinimum).toBe("number");
      }
      if ("exclusiveMaximum" in value) {
        expect(typeof value.exclusiveMaximum).toBe("number");
      }
      Object.values(value).forEach(visit);
    };
    visit(document);

    const ledgerSchemas = collectPropertySchemas(
      document,
      new Set(["listing_id", "reverses_entry_id"]),
    );
    expect(ledgerSchemas.some((schema) => Array.isArray(schema.type))).toBe(
      true,
    );
  });

  it("preserves canonical int64 and decimal strings as machine-readable string schemas", () => {
    const int64Schemas = collectPropertySchemas(
      document,
      new Set([
        "committed_version",
        "conflict_version",
        "consent_version",
        "expected_version",
        "revision",
        "sequence",
        "version",
      ]),
    );
    expect(int64Schemas.length).toBeGreaterThan(20);
    for (const schema of int64Schemas) {
      expect(schema).toMatchObject({
        maxLength: 19,
        minLength: 1,
        pattern: INT64_PATTERN,
        type: "string",
        "x-int64-maximum": MAX_INT64,
        "x-int64-minimum": "0",
        "x-int64-string": true,
      });
      expect(schema.type).not.toBe("number");
      expect(schema.type).not.toBe("integer");
    }

    const sseOperation = operationsById.get("notificationStream")?.operation;
    if (sseOperation === undefined) {
      throw new Error("Missing notificationStream");
    }
    const lastEventIdSchema = requireObject(
      findHeader(sseOperation, "Last-Event-ID")?.schema,
      "Last-Event-ID schema",
    );
    expect(lastEventIdSchema).toMatchObject({
      maxLength: 19,
      minLength: 1,
      pattern: INT64_PATTERN,
      type: "string",
      "x-int64-string": true,
    });

    const moderationOperation = operationsById.get(
      "moderationDecisionCreate",
    )?.operation;
    if (moderationOperation === undefined) {
      throw new Error("Missing moderationDecisionCreate");
    }
    const ifMatchSchema = requireObject(
      findHeader(moderationOperation, "If-Match")?.schema,
      "If-Match schema",
    );
    expect(ifMatchSchema).toMatchObject({
      maxLength: 21,
      minLength: 3,
      pattern: INT64_ETAG_PATTERN,
      type: "string",
      "x-int64-string": true,
    });

    const decimalSchemas = collectPropertySchemas(
      document,
      new Set([
        "amount",
        "average_price",
        "cash_balance",
        "change",
        "change_percent",
        "close",
        "high",
        "low",
        "market_price",
        "market_value",
        "open",
        "opening_cash",
        "price",
        "quantity",
        "volume",
      ]),
    );
    expect(decimalSchemas.length).toBeGreaterThan(20);
    for (const schema of decimalSchemas) {
      expect(schema).toMatchObject({
        pattern: DECIMAL_PATTERN,
        type: "string",
        "x-decimal-string": true,
      });
      expect(schema.type).not.toBe("number");
      expect(schema.type).not.toBe("integer");
    }
  });

  it("contains no disabled M1 product surface", () => {
    expect(openApiBytes).not.toMatch(
      /trade|private[-_ ]?fund|public[-_ ]?portfolio|push|target[-_ ]?price|ai[-_ ]?advice/iu,
    );
  });

  it("regenerates byte-for-byte and checks files without consulting git", () => {
    const firstDirectory = mkdtempSync(join(tmpdir(), "huoqiu-openapi-first-"));
    const secondDirectory = mkdtempSync(
      join(tmpdir(), "huoqiu-openapi-second-"),
    );
    try {
      const firstPath = join(firstDirectory, "huoqiu.v1.yaml");
      const secondPath = join(secondDirectory, "huoqiu.v1.yaml");
      const firstResult = runGenerator(["--output", firstPath]);
      const secondResult = runGenerator(["--output", secondPath]);
      expect(firstResult.status, firstResult.stderr).toBe(0);
      expect(secondResult.status, secondResult.stderr).toBe(0);
      expect(readFileSync(firstPath, "utf8")).toBe(openApiBytes);
      expect(readFileSync(secondPath, "utf8")).toBe(openApiBytes);

      const validCheck = runGenerator(["--check", firstPath]);
      expect(validCheck.status, validCheck.stderr).toBe(0);

      writeFileSync(firstPath, `${openApiBytes}# deliberate tamper\n`, "utf8");
      const invalidCheck = runGenerator(["--check", firstPath]);
      expect(invalidCheck.status).not.toBe(0);
      expect(`${invalidCheck.stdout}${invalidCheck.stderr}`).toMatch(
        /OpenAPI artifact is out of date/iu,
      );
    } finally {
      rmSync(firstDirectory, { force: true, recursive: true });
      rmSync(secondDirectory, { force: true, recursive: true });
    }
  });
});
