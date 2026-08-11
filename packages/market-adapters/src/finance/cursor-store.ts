import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type { FinanceCursorStore } from "./scheduler.js";

const CURSOR_FILENAME = "cursors-v1.json";
const MAX_CURSOR_FILE_BYTES = 64 * 1_024;
const MAX_SOURCES = 64;
const sourcePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const cursorPattern = /^[A-Za-z0-9._~:+/=-]{1,2048}$/u;
const processWriteQueues = new Map<string, Promise<void>>();

type FinanceCursorState = Readonly<{
  schemaVersion: 1;
  cursors: Readonly<Record<string, string>>;
}>;

const emptyState = (): FinanceCursorState => ({
  schemaVersion: 1,
  cursors: {},
});

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as Error & { code?: unknown }).code === "ENOENT";

const validateSource = (source: string): string => {
  if (typeof source !== "string" || !sourcePattern.test(source)) {
    throw new TypeError("Finance cursor source violates its contract");
  }
  return source;
};

const validateCursor = (cursor: string): string => {
  if (typeof cursor !== "string" || !cursorPattern.test(cursor)) {
    throw new TypeError("Finance ingestion cursor violates its contract");
  }
  return cursor;
};

const parseState = (value: unknown): FinanceCursorState => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("schemaVersion" in value) ||
    !("cursors" in value)
  ) {
    throw new TypeError("Finance cursor state violates its contract");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const cursors = candidate.cursors;
  if (
    candidate.schemaVersion !== 1 ||
    typeof cursors !== "object" ||
    cursors === null ||
    Array.isArray(cursors)
  ) {
    throw new TypeError("Finance cursor state violates its contract");
  }

  const entries = Object.entries(cursors);
  if (entries.length > MAX_SOURCES) {
    throw new RangeError("Finance cursor state exceeds its source limit");
  }
  const validated = entries
    .map(
      ([source, cursor]) =>
        [validateSource(source), validateCursor(cursor as string)] as const,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  return { schemaVersion: 1, cursors: Object.fromEntries(validated) };
};

const readStateFile = async (path: string): Promise<FinanceCursorState> => {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isMissingFile(error)) return emptyState();
    throw error;
  }

  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) {
      throw new TypeError("Finance cursor state must be a regular file");
    }
    if (metadata.size > MAX_CURSOR_FILE_BYTES) {
      throw new RangeError("Finance cursor state exceeds its byte limit");
    }
    const contents = await file.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(contents, "utf8") > MAX_CURSOR_FILE_BYTES) {
      throw new RangeError("Finance cursor state exceeds its byte limit");
    }
    try {
      return parseState(JSON.parse(contents));
    } catch (error) {
      if (error instanceof RangeError) throw error;
      throw new TypeError("Finance cursor state is invalid", { cause: error });
    }
  } finally {
    await file.close();
  }
};

const writeSyncedFile = async (
  path: string,
  contents: string,
): Promise<void> => {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(contents, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
};

export class AtomicJsonFinanceCursorStore implements FinanceCursorStore {
  readonly #directory: string;
  readonly #path: string;

  constructor(input: Readonly<{ directory: string }>) {
    if (!isAbsolute(input.directory)) {
      throw new TypeError("Finance cursor directory must be an absolute path");
    }
    this.#directory = input.directory;
    this.#path = join(input.directory, CURSOR_FILENAME);
  }

  async read(sourceInput: string): Promise<string | undefined> {
    const source = validateSource(sourceInput);
    const state = await readStateFile(this.#path);
    return state.cursors[source];
  }

  async commit(
    sourceInput: string,
    cursorInput: string | undefined,
  ): Promise<void> {
    const source = validateSource(sourceInput);
    const cursor =
      cursorInput === undefined ? undefined : validateCursor(cursorInput);
    const previous = processWriteQueues.get(this.#path) ?? Promise.resolve();
    const operation = previous.then(() =>
      this.#commitSerialized(source, cursor),
    );
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    processWriteQueues.set(this.#path, settled);
    void settled.then(() => {
      if (processWriteQueues.get(this.#path) === settled) {
        processWriteQueues.delete(this.#path);
      }
    });
    return operation;
  }

  async #commitSerialized(
    source: string,
    cursor: string | undefined,
  ): Promise<void> {
    const current = await readStateFile(this.#path);
    const draft = new Map(Object.entries(current.cursors));
    if (cursor === undefined) draft.delete(source);
    else draft.set(source, cursor);
    const next = parseState({
      schemaVersion: 1,
      cursors: Object.fromEntries(
        [...draft.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    });
    const contents = `${JSON.stringify(next)}\n`;
    if (Buffer.byteLength(contents, "utf8") > MAX_CURSOR_FILE_BYTES) {
      throw new RangeError("Finance cursor state exceeds its byte limit");
    }

    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(
      this.#directory,
      `.cursors-v1.${randomUUID()}.tmp`,
    );
    try {
      await writeSyncedFile(temporaryPath, contents);
      await rename(temporaryPath, this.#path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
