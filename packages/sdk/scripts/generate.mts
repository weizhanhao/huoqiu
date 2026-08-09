import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { approvedEventTypes } from "@huoqiu/contracts/events";
import { m1OperationRegistry } from "@huoqiu/contracts/m1";

const CONTRACT_VERSION = "m1.v1";
const API_ORACLE_HASH =
  "f97b4b41f03f1731d47058b36bcc8551869161ca6331e647b03c3683a20a759d";
const EVENT_ORACLE_HASH =
  "b43899ba72e8e3b70d6f3bb8f99e4769719db38907f0dd9a6ea97a33329c2331";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(packageRoot, "../..");
const apiOraclePath = resolve(
  repoRoot,
  "quality/oracles/m1/api-operations.v1.json",
);
const eventOraclePath = resolve(
  repoRoot,
  "quality/oracles/m1/event-types.v1.json",
);
const approvedHashesPath = resolve(
  repoRoot,
  "quality/oracles/m1/approved.sha256",
);

interface ApiOracleEntry {
  readonly action: string;
  readonly api_id: string;
  readonly cap_id: string;
  readonly method: string;
  readonly operation_id: string;
  readonly path: string;
}

interface EventOracleEntry {
  readonly event_type: string;
  readonly producer: string;
  readonly version: number;
}

interface GeneratedArtifacts {
  readonly manifest: string;
  readonly types: string;
}

const sha256 = (source: string | Buffer): string =>
  createHash("sha256").update(source).digest("hex");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Oracle field ${key} must be a non-empty string`);
  }
  return value;
};

const parseApiOracle = (source: string): readonly ApiOracleEntry[] => {
  const value = JSON.parse(source) as unknown;
  if (!Array.isArray(value)) {
    throw new Error("API oracle must be an array");
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("API oracle entries must be objects");
    }
    return {
      action: requireString(entry, "action"),
      api_id: requireString(entry, "api_id"),
      cap_id: requireString(entry, "cap_id"),
      method: requireString(entry, "method"),
      operation_id: requireString(entry, "operation_id"),
      path: requireString(entry, "path"),
    };
  });
};

const parseEventOracle = (source: string): readonly EventOracleEntry[] => {
  const value = JSON.parse(source) as unknown;
  if (!Array.isArray(value)) {
    throw new Error("Event oracle must be an array");
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("Event oracle entries must be objects");
    }
    const version = entry["version"];
    if (version !== 1) {
      throw new Error("Every M1 event oracle entry must use version 1");
    }
    return {
      event_type: requireString(entry, "event_type"),
      producer: requireString(entry, "producer"),
      version,
    };
  });
};

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must contain only unique values`);
  }
};

const assertApprovedHashFile = (
  source: string,
  apiHash: string,
  eventHash: string,
): void => {
  const approved = new Map(
    source
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const match = /^(?<hash>[a-f0-9]{64})\s+(?<path>\S+)$/u.exec(line);
        if (!match?.groups) {
          throw new Error("approved.sha256 contains an invalid line");
        }
        return [match.groups["path"], match.groups["hash"]] as const;
      }),
  );
  if (
    approved.get("quality/oracles/m1/api-operations.v1.json") !== apiHash ||
    approved.get("quality/oracles/m1/event-types.v1.json") !== eventHash
  ) {
    throw new Error("approved.sha256 does not approve the M1 API/event oracle");
  }
};

const renderStringTuple = (values: readonly string[]): string =>
  `[\n${values.map((value) => `  ${JSON.stringify(value)},`).join("\n")}\n]`;

const renderTypes = (apiIds: readonly string[]): string => `import type {
  AppRoute,
  ClientInferRequest,
  ClientInferResponses,
} from "@ts-rest/core";
import { approvedEventTypes } from "@huoqiu/contracts/events";
import type { AppRouter } from "@huoqiu/contracts/m1";

export const contractVersion = ${JSON.stringify(CONTRACT_VERSION)} as const;
export const m1ApiIds = ${renderStringTuple(apiIds)} as const;
export { approvedEventTypes as m1EventTypes };

export type HuoqiuAppRouter = AppRouter;
export type HuoqiuOperationName = keyof AppRouter;
export type HuoqiuOperationRequest<Name extends HuoqiuOperationName> =
  AppRouter[Name] extends AppRoute
    ? ClientInferRequest<AppRouter[Name]>
    : never;
export type HuoqiuOperationResponse<Name extends HuoqiuOperationName> =
  AppRouter[Name] extends AppRoute
    ? ClientInferResponses<AppRouter[Name]>
    : never;
export type M1ApiId = (typeof m1ApiIds)[number];
export type M1EventType = (typeof approvedEventTypes)[number];
`;

const createArtifacts = async (): Promise<GeneratedArtifacts> => {
  const [apiOracleBuffer, eventOracleBuffer, approvedHashes] =
    await Promise.all([
      readFile(apiOraclePath),
      readFile(eventOraclePath),
      readFile(approvedHashesPath, "utf8"),
    ]);
  const apiHash = sha256(apiOracleBuffer);
  const eventHash = sha256(eventOracleBuffer);
  if (apiHash !== API_ORACLE_HASH || eventHash !== EVENT_ORACLE_HASH) {
    throw new Error(
      "M1 API/event oracle hash does not match the approved hash",
    );
  }
  assertApprovedHashFile(approvedHashes, apiHash, eventHash);

  const apiOracle = parseApiOracle(apiOracleBuffer.toString("utf8"));
  const eventOracle = parseEventOracle(eventOracleBuffer.toString("utf8"));
  if (apiOracle.length !== 31 || m1OperationRegistry.length !== 31) {
    throw new Error("M1 SDK requires exactly 31 API operations");
  }
  if (eventOracle.length !== 18 || approvedEventTypes.length !== 18) {
    throw new Error("M1 SDK requires exactly 18 event types");
  }

  const publicOperations = m1OperationRegistry.map(
    ({ action, apiId, capId, method, operationId, path }) => ({
      action,
      api_id: apiId,
      cap_id: capId,
      method,
      operation_id: operationId,
      path,
    }),
  );
  if (JSON.stringify(publicOperations) !== JSON.stringify(apiOracle)) {
    throw new Error("Public M1 operation registry differs from the API oracle");
  }

  const oracleEventTypes = eventOracle.map(({ event_type }) => event_type);
  if (JSON.stringify(approvedEventTypes) !== JSON.stringify(oracleEventTypes)) {
    throw new Error("Public event types differ from the event oracle");
  }

  const apiIds = m1OperationRegistry.map(({ apiId }) => apiId);
  assertUnique(apiIds, "M1 API IDs");
  assertUnique(approvedEventTypes, "M1 event types");

  return {
    manifest: `${JSON.stringify(
      {
        api_ids: apiIds,
        contract_version: CONTRACT_VERSION,
        event_types: approvedEventTypes,
        oracle_sha256: {
          api_operations: apiHash,
          event_types: eventHash,
        },
      },
      null,
      2,
    )}\n`,
    types: renderTypes(apiIds),
  };
};

const writeArtifacts = async (
  outputDirectory: string,
  artifacts: GeneratedArtifacts,
): Promise<void> => {
  const typesPath = resolve(outputDirectory, "src/types.ts");
  const manifestPath = resolve(outputDirectory, "generated-manifest.json");
  await mkdir(dirname(typesPath), { recursive: true });
  await Promise.all([
    writeFile(typesPath, artifacts.types, "utf8"),
    writeFile(manifestPath, artifacts.manifest, "utf8"),
  ]);
};

const readArtifacts = async (
  sourceDirectory: string,
): Promise<GeneratedArtifacts> => ({
  manifest: await readFile(
    resolve(sourceDirectory, "generated-manifest.json"),
    "utf8",
  ),
  types: await readFile(resolve(sourceDirectory, "src/types.ts"), "utf8"),
});

const assertArtifactsMatch = (
  actual: GeneratedArtifacts,
  expected: GeneratedArtifacts,
  label: string,
): void => {
  if (
    actual.types !== expected.types ||
    actual.manifest !== expected.manifest
  ) {
    throw new Error(`${label} differs from regenerated SDK artifacts`);
  }
};

type GenerateCommand =
  | Readonly<{ kind: "check" }>
  | Readonly<{ kind: "install"; sourceDirectory: string }>
  | Readonly<{ kind: "output"; outputDirectory: string }>;

const parseCommand = (args: readonly string[]): GenerateCommand => {
  if (args.length === 1 && args[0] === "--check") {
    return { kind: "check" };
  }
  if (args.length === 2 && args[0] === "--output" && args[1]) {
    return { kind: "output", outputDirectory: resolve(args[1]) };
  }
  if (args.length === 2 && args[0] === "--install-from" && args[1]) {
    return { kind: "install", sourceDirectory: resolve(args[1]) };
  }
  throw new Error(
    "Usage: generate.mts --output <directory> | --install-from <directory> | --check",
  );
};

const main = async (): Promise<void> => {
  const generationMode = parseCommand(process.argv.slice(2));
  if (generationMode.kind === "output") {
    await writeArtifacts(
      generationMode.outputDirectory,
      await createArtifacts(),
    );
    process.stdout.write("SDK_GENERATION_OUTPUT PASS\n");
    return;
  }

  if (generationMode.kind === "install") {
    const expected = await createArtifacts();
    assertArtifactsMatch(
      await readArtifacts(generationMode.sourceDirectory),
      expected,
      "SDK candidate",
    );
    await writeArtifacts(packageRoot, expected);
    process.stdout.write("SDK_GENERATION_INSTALL PASS\n");
    return;
  }

  const checkDirectory = await mkdtemp(resolve(tmpdir(), "huoqiu-sdk-check-"));
  try {
    const expected = await createArtifacts();
    await writeArtifacts(checkDirectory, expected);
    const regenerated = await readArtifacts(checkDirectory);
    assertArtifactsMatch(
      await readArtifacts(packageRoot),
      regenerated,
      "Installed SDK",
    );
  } finally {
    await rm(checkDirectory, { force: true, recursive: true });
  }
  process.stdout.write("SDK_GENERATION_CHECK PASS\n");
};

await main();
