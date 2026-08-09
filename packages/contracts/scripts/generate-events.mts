import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod4";

import { eventRegistry } from "../src/events/index.js";

const EVENT_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
const contractsDirectory = resolve(import.meta.dirname, "..");
const canonicalDirectory = resolve(contractsDirectory, "events");

type JsonValue = boolean | null | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface CliOptions {
  readonly check: boolean;
  readonly installFrom?: string;
  readonly output?: string;
}

const compareKeys = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asJsonValue = (value: unknown, location = "$"): JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) =>
      asJsonValue(child, `${location}[${index}]`),
    );
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, asJsonValue(child, `${location}.${key}`)]),
    );
  }
  throw new TypeError(
    `Generated event schema contains unsupported value at ${location}`,
  );
};

const sortObjectKeysDeep = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([key, child]) => [key, sortObjectKeysDeep(child)]),
  );
};

const compactPrimitiveArrays = (bytes: string): string =>
  bytes.replace(
    /^(\s*"[^"\n]+": )\[\n((?:\s+(?:true|false|null|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*")(?:,)?\n)+)(\s*)\]/gmu,
    (match, prefix: string, body: string) => {
      const values = body
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line.trim().replace(/,$/u, "")) as JsonValue);
      const compactArray = `[${values
        .map((value) => JSON.stringify(value))
        .join(", ")}]`;
      const compact = `${prefix}${compactArray}`;
      return compact.length <= 80 ? compact : match;
    },
  );

const fileNameFor = (eventType: string): string =>
  `${eventType}.v1.schema.json`;

const expectedFileNames = eventRegistry
  .map((event) => fileNameFor(event.type))
  .sort(compareKeys);

const generateSchemaBytes = (): ReadonlyMap<string, string> =>
  new Map(
    eventRegistry.map((event) => {
      const generated = z.toJSONSchema(event.schema, {
        target: "draft-2020-12",
        io: "input",
        cycles: "ref",
        reused: "inline",
      });
      const document = sortObjectKeysDeep(
        asJsonValue({
          ...generated,
          $id: `urn:huoqiu:event:${event.type}:v1`,
          $schema: EVENT_SCHEMA_DIALECT,
          title: `Huoqiu event ${event.type} v1`,
          "x-event-type": event.type,
          "x-producer": event.producer,
          "x-version": event.version,
        }),
      );
      return [
        fileNameFor(event.type),
        compactPrimitiveArrays(`${JSON.stringify(document, null, 2)}\n`),
      ];
    }),
  );

const assertExactFileSet = async (
  directory: string,
  label: string,
): Promise<void> => {
  const actual = (await readdir(directory)).sort(compareKeys);
  if (JSON.stringify(actual) !== JSON.stringify(expectedFileNames)) {
    throw new Error(
      `${label} must contain exactly ${expectedFileNames.length} event schema files`,
    );
  }
};

const writeGeneratedDirectory = async (directory: string): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const existing = await readdir(directory);
  if (existing.length > 0) {
    throw new Error(`Output directory must be empty: ${directory}`);
  }
  for (const [fileName, bytes] of generateSchemaBytes()) {
    await writeFile(resolve(directory, fileName), bytes, "utf8");
  }
};

const compareDirectoryBytes = async (
  expectedDirectory: string,
  actualDirectory: string,
): Promise<void> => {
  await assertExactFileSet(expectedDirectory, "Generated directory");
  await assertExactFileSet(actualDirectory, "Candidate directory");
  for (const fileName of expectedFileNames) {
    const [expected, actual] = await Promise.all([
      readFile(resolve(expectedDirectory, fileName)),
      readFile(resolve(actualDirectory, fileName)),
    ]);
    if (!expected.equals(actual)) {
      throw new Error(`Event schema bytes drifted: ${fileName}`);
    }
  }
};

const withGeneratedTemporaryDirectory = async <T,>(
  callback: (directory: string) => Promise<T>,
): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), "huoqiu-event-schemas-"));
  try {
    await writeGeneratedDirectory(directory);
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

const installFrom = async (sourceDirectory: string): Promise<void> => {
  const source = resolve(sourceDirectory);
  await withGeneratedTemporaryDirectory(async (generatedDirectory) => {
    await compareDirectoryBytes(generatedDirectory, source);
  });

  await mkdir(canonicalDirectory, { recursive: true });
  const canonicalEntries = await readdir(canonicalDirectory);
  const unexpected = canonicalEntries.filter(
    (entry) => !expectedFileNames.includes(entry),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Canonical directory contains unexpected files: ${unexpected.join(", ")}`,
    );
  }
  await Promise.all(
    canonicalEntries.map((entry) => unlink(resolve(canonicalDirectory, entry))),
  );
  for (const fileName of expectedFileNames) {
    const bytes = await readFile(resolve(source, fileName));
    await writeFile(resolve(canonicalDirectory, fileName), bytes);
  }
};

const checkCanonical = async (): Promise<void> => {
  await withGeneratedTemporaryDirectory(async (generatedDirectory) => {
    await compareDirectoryBytes(generatedDirectory, canonicalDirectory);
  });
};

const parseCli = (arguments_: readonly string[]): CliOptions => {
  let check = false;
  let installFromPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (argument === "--install-from" || argument === "--output") {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} requires a directory`);
      }
      if (argument === "--install-from") installFromPath = value;
      else outputPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown event generator argument: ${String(argument)}`);
  }

  const selectedModes =
    Number(check) +
    Number(installFromPath !== undefined) +
    Number(outputPath !== undefined);
  if (selectedModes !== 1) {
    throw new Error(
      "Select exactly one of --output, --install-from, or --check",
    );
  }
  return {
    check,
    ...(installFromPath === undefined ? {} : { installFrom: installFromPath }),
    ...(outputPath === undefined ? {} : { output: outputPath }),
  };
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  if (options.output !== undefined) {
    const output = resolve(options.output);
    await writeGeneratedDirectory(output);
    console.log(`EVENT_SCHEMA_GENERATE PASS count=18 output=${output}`);
    return;
  }
  if (options.installFrom !== undefined) {
    await installFrom(options.installFrom);
    console.log("EVENT_SCHEMA_INSTALL PASS count=18");
    return;
  }
  await checkCanonical();
  console.log("EVENT_SCHEMA_CHECK PASS count=18");
};

await main();
