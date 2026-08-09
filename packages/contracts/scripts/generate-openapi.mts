import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { generateOpenApi } from "@ts-rest/open-api";
import { stringify } from "yaml";

import { m1OperationRegistry, m1Router } from "../src/m1/index.js";

const CONTRACT_VERSION = "m1.v1";
const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
const MAX_INT64 = "9223372036854775807";
const INT64_PATTERN = "^(?:0|[1-9][0-9]{0,18})$";
const INT64_ETAG_PATTERN = '^"(?:0|[1-9][0-9]{0,18})"$';
const DECIMAL_PATTERN = "^-?[0-9]+(?:\\.[0-9]+)?$";
const unauthenticatedPermissions = new Set([
  "Guest",
  "Invited Guest",
  "Public",
  "Public/Owner",
]);
const int64PropertyNames = new Set([
  "committed_version",
  "conflict_version",
  "consent_version",
  "expected_version",
  "revision",
  "sequence",
  "version",
]);
const decimalPropertyNames = new Set([
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
]);
const canonicalHeaderNames: Readonly<Record<string, string>> = {
  "idempotency-key": "Idempotency-Key",
  "if-match": "If-Match",
  "last-event-id": "Last-Event-ID",
};

type JsonValue = boolean | null | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compareKeys = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeOpenApi31 = (value: unknown): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(normalizeOpenApi31);
  }
  if (!isObject(value)) {
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      return value;
    }
    throw new TypeError(`Unsupported generated OpenAPI value: ${typeof value}`);
  }

  const normalized: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== "nullable" && child !== undefined) {
      normalized[key] = normalizeOpenApi31(child);
    }
  }

  if (typeof normalized.exclusiveMinimum === "boolean") {
    if (normalized.exclusiveMinimum && typeof normalized.minimum === "number") {
      normalized.exclusiveMinimum = normalized.minimum;
      delete normalized.minimum;
    } else {
      delete normalized.exclusiveMinimum;
    }
  }
  if (typeof normalized.exclusiveMaximum === "boolean") {
    if (normalized.exclusiveMaximum && typeof normalized.maximum === "number") {
      normalized.exclusiveMaximum = normalized.maximum;
      delete normalized.maximum;
    } else {
      delete normalized.exclusiveMaximum;
    }
  }

  if (value.nullable === true) {
    if (typeof normalized.type === "string") {
      normalized.type = [normalized.type, "null"];
      return normalized;
    }
    return { anyOf: [normalized, { type: "null" }] };
  }
  return normalized;
};

const sortObjectKeysDeep = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeysDeep);
  }
  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([key, child]) => [key, sortObjectKeysDeep(child as JsonValue)]),
  ) as JsonObject;
};

const applyInt64StringSchema = (schema: Record<string, unknown>): void => {
  Object.assign(schema, {
    maxLength: 19,
    minLength: 1,
    pattern: INT64_PATTERN,
    type: "string",
    "x-int64-maximum": MAX_INT64,
    "x-int64-minimum": "0",
    "x-int64-string": true,
  });
  delete schema.format;
};

const applyDecimalStringSchema = (schema: Record<string, unknown>): void => {
  Object.assign(schema, {
    pattern: DECIMAL_PATTERN,
    type: "string",
    "x-decimal-string": true,
  });
  delete schema.format;
};

const applySemanticStringSchemas = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(applySemanticStringSchemas);
    return;
  }
  if (!isObject(value)) {
    return;
  }

  if (isObject(value.properties)) {
    for (const [name, schema] of Object.entries(value.properties)) {
      if (!isObject(schema)) {
        continue;
      }
      if (int64PropertyNames.has(name)) {
        applyInt64StringSchema(schema);
      }
      if (decimalPropertyNames.has(name)) {
        applyDecimalStringSchema(schema);
      }
    }
  }

  if (value.in === "header" && isObject(value.schema)) {
    if (value.name === "Last-Event-ID") {
      applyInt64StringSchema(value.schema);
    }
    if (value.name === "If-Match") {
      Object.assign(value.schema, {
        maxLength: 21,
        minLength: 3,
        pattern: INT64_ETAG_PATTERN,
        type: "string",
        "x-int64-entity-tag": true,
        "x-int64-maximum": MAX_INT64,
        "x-int64-minimum": "0",
        "x-int64-string": true,
      });
      delete value.schema.format;
    }
  }

  Object.values(value).forEach(applySemanticStringSchemas);
};

const generateDocument = (): JsonObject => {
  const registrationByOperationId = new Map<
    string,
    (typeof m1OperationRegistry)[number]
  >(m1OperationRegistry.map((item) => [item.operationId, item]));
  const generated = generateOpenApi(
    m1Router,
    {
      components: {
        securitySchemes: {
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
        },
      },
      info: {
        title: "Huoqiu M1 API",
        version: CONTRACT_VERSION,
      },
    },
    {
      operationMapper: (operation) => {
        const operationId = operation.operationId;
        const registration =
          operationId === undefined
            ? undefined
            : registrationByOperationId.get(operationId);
        if (registration === undefined) {
          throw new Error(`No M1 registry entry for ${String(operationId)}`);
        }

        const parameters = operation.parameters?.map((parameter) => {
          if ("in" in parameter && parameter.in === "header") {
            return {
              ...parameter,
              name:
                canonicalHeaderNames[String(parameter.name).toLowerCase()] ??
                parameter.name,
            };
          }
          return parameter;
        });
        const requestBody = operation.requestBody
          ? { ...operation.requestBody, required: true }
          : undefined;
        const security = unauthenticatedPermissions.has(registration.permission)
          ? []
          : [{ WebSessionCookie: [] }, { AppBearer: [] }];

        return {
          ...operation,
          ...(parameters === undefined ? {} : { parameters }),
          ...(requestBody === undefined ? {} : { requestBody }),
          security,
          "x-action": registration.action,
          "x-api-id": registration.apiId,
          "x-cap-id": registration.capId,
          "x-mutation": { ...registration.mutation },
          "x-permission": registration.permission,
          "x-roles": [...registration.roles],
        };
      },
      setOperationId: true,
    },
  ) as unknown as Record<string, unknown>;

  generated.openapi = "3.1.0";
  generated.jsonSchemaDialect = JSON_SCHEMA_DIALECT;
  generated["x-contract-version"] = CONTRACT_VERSION;

  const documentPathEntries = generated.paths;
  if (!isObject(documentPathEntries)) {
    throw new TypeError("Generated OpenAPI paths are missing");
  }
  const eventsPath = documentPathEntries["/v1/me/events"];
  if (!isObject(eventsPath) || !isObject(eventsPath.get)) {
    throw new TypeError("Generated notificationStream operation is missing");
  }
  const streamOperation = eventsPath.get;
  if (!isObject(streamOperation.responses)) {
    throw new TypeError("Generated notificationStream responses are missing");
  }
  const streamSuccess = streamOperation.responses["200"];
  if (!isObject(streamSuccess)) {
    throw new TypeError("Generated notificationStream 200 response is missing");
  }
  streamSuccess.content = {
    "text/event-stream": {
      schema: {
        description:
          "Raw UTF-8 SSE wire text; chunks may end at arbitrary frame boundaries.",
        type: "string",
      },
    },
  };
  streamOperation["x-default-ts-rest-client"] = false;
  streamOperation["x-transport"] = "dedicated-sse";

  const normalized = normalizeOpenApi31(generated);
  applySemanticStringSchemas(normalized);
  return sortObjectKeysDeep(normalized) as JsonObject;
};

const renderOpenApi = (): string =>
  stringify(generateDocument(), {
    lineWidth: 0,
    sortMapEntries: false,
  });

interface CliOptions {
  readonly mode: "check" | "write";
  readonly targetPath: string;
}

const parseCliOptions = (arguments_: readonly string[]): CliOptions => {
  const args = arguments_.filter((argument) => argument !== "--");
  if (args.length === 0) {
    return {
      mode: "write",
      targetPath: resolve(import.meta.dirname, "../openapi/huoqiu.v1.yaml"),
    };
  }
  if (args[0] === "--output" && args[1] !== undefined && args.length === 2) {
    return { mode: "write", targetPath: resolve(args[1]) };
  }
  if (args[0] === "--check" && args.length <= 2) {
    return {
      mode: "check",
      targetPath:
        args[1] === undefined
          ? resolve(import.meta.dirname, "../openapi/huoqiu.v1.yaml")
          : resolve(args[1]),
    };
  }
  throw new Error("Usage: generate-openapi [--output <path> | --check [path]]");
};

const writeArtifact = async (
  targetPath: string,
  bytes: string,
): Promise<void> => {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, bytes, "utf8");
};

const checkArtifact = async (
  targetPath: string,
  bytes: string,
): Promise<void> => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "huoqiu-openapi-check-"),
  );
  try {
    const generatedPath = join(temporaryDirectory, "huoqiu.v1.yaml");
    await writeFile(generatedPath, bytes, "utf8");
    let existing: Buffer;
    try {
      existing = await readFile(targetPath);
    } catch {
      throw new Error(`OpenAPI artifact is out of date: ${targetPath}`);
    }
    const generated = await readFile(generatedPath);
    if (!generated.equals(existing)) {
      throw new Error(`OpenAPI artifact is out of date: ${targetPath}`);
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  const options = parseCliOptions(process.argv.slice(2));
  const bytes = renderOpenApi();
  if (options.mode === "check") {
    await checkArtifact(options.targetPath, bytes);
    return;
  }
  await writeArtifact(options.targetPath, bytes);
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
