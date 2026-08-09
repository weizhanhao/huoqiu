import * as ExpoSecureStore from "expo-secure-store";

export type SecureSession = Readonly<{
  accessToken: string;
  expiresAtEpochMs: number;
  refreshToken?: string;
  userId: string;
}>;

export type SecureStoreAdapter = Readonly<{
  deleteItemAsync: (key: string) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
}>;

export type SecureSessionStore = Readonly<{
  clear: () => Promise<void>;
  persist: (session: SecureSession) => Promise<void>;
  restore: () => Promise<SecureSession | null>;
}>;

export class SecureSessionStorageError extends Error {
  public constructor() {
    super("Secure session storage operation failed");
    this.name = "SecureSessionStorageError";
  }
}

export type SecureSessionStoreOptions = Readonly<{
  now: () => number;
}>;

const sessionKey = "huoqiu.auth.session";
export const secureSessionSchemaVersion = 1 as const;

type SessionSlot = "a" | "b";

type SessionHead = Readonly<{
  generation: number;
  schemaVersion: typeof secureSessionSchemaVersion;
  slot: SessionSlot;
}>;

type SessionEnvelope = Readonly<{
  generation: number;
  schemaVersion: typeof secureSessionSchemaVersion;
  session: SecureSession;
}>;

const headKey = `${sessionKey}.head`;
const slotKey = (slot: SessionSlot): string => `${sessionKey}.slot.${slot}`;
const tombstoneKey = `${sessionKey}.tombstone`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

const isNonEmptyBoundedString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 16_384;

const isGeneration = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isSecureSession = (value: unknown): value is SecureSession =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "accessToken",
    "expiresAtEpochMs",
    "refreshToken",
    "userId",
  ]) &&
  isNonEmptyBoundedString(value.accessToken) &&
  isNonEmptyBoundedString(value.userId) &&
  (value.refreshToken === undefined ||
    isNonEmptyBoundedString(value.refreshToken)) &&
  typeof value.expiresAtEpochMs === "number" &&
  Number.isSafeInteger(value.expiresAtEpochMs) &&
  value.expiresAtEpochMs > 0;

const parseHead = (serialized: string): SessionHead => {
  const value: unknown = JSON.parse(serialized);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["generation", "schemaVersion", "slot"]) ||
    value.schemaVersion !== secureSessionSchemaVersion ||
    !isGeneration(value.generation) ||
    (value.slot !== "a" && value.slot !== "b")
  ) {
    throw new Error("Invalid secure session head");
  }
  return {
    generation: value.generation,
    schemaVersion: secureSessionSchemaVersion,
    slot: value.slot,
  };
};

const parseEnvelope = (
  serialized: string,
  expectedGeneration: number,
): SessionEnvelope => {
  const value: unknown = JSON.parse(serialized);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["generation", "schemaVersion", "session"]) ||
    value.schemaVersion !== secureSessionSchemaVersion ||
    value.generation !== expectedGeneration ||
    !isSecureSession(value.session)
  ) {
    throw new Error("Invalid secure session envelope");
  }
  return {
    generation: expectedGeneration,
    schemaVersion: secureSessionSchemaVersion,
    session: Object.freeze({ ...value.session }),
  };
};

export const createSecureSessionStore = (
  storage: SecureStoreAdapter,
  options: SecureSessionStoreOptions,
): SecureSessionStore => {
  let failClosedInMemory = false;

  const clearStoredSession = async (): Promise<void> => {
    failClosedInMemory = true;
    let failed = false;
    try {
      await storage.setItemAsync(
        tombstoneKey,
        JSON.stringify({
          schemaVersion: secureSessionSchemaVersion,
          status: "cleared",
        }),
      );
    } catch {
      failed = true;
    }
    const deleteResults = await Promise.allSettled([
      storage.deleteItemAsync(headKey),
      storage.deleteItemAsync(slotKey("a")),
      storage.deleteItemAsync(slotKey("b")),
    ]);
    if (
      failed ||
      deleteResults.some((result) => result.status === "rejected")
    ) {
      throw new SecureSessionStorageError();
    }
  };

  const persistStoredSession = async (
    session: SecureSession,
  ): Promise<void> => {
    let candidateKey: string | null = null;
    let candidateMayContainSession = false;
    let committed = false;
    try {
      if (!isSecureSession(session)) {
        throw new Error("Invalid secure session");
      }
      const storedHead = await storage.getItemAsync(headKey);
      const currentHead = storedHead === null ? null : parseHead(storedHead);
      const nextSlot: SessionSlot = currentHead?.slot === "a" ? "b" : "a";
      const nextGeneration = (currentHead?.generation ?? 0) + 1;
      if (!isGeneration(nextGeneration)) {
        throw new Error("Invalid secure session generation");
      }
      const envelope: SessionEnvelope = {
        generation: nextGeneration,
        schemaVersion: secureSessionSchemaVersion,
        session: Object.freeze({ ...session }),
      };
      const head: SessionHead = {
        generation: nextGeneration,
        schemaVersion: secureSessionSchemaVersion,
        slot: nextSlot,
      };
      const serializedEnvelope = JSON.stringify(envelope);
      candidateKey = slotKey(nextSlot);
      await storage.deleteItemAsync(candidateKey);
      candidateMayContainSession = true;
      await storage.setItemAsync(candidateKey, serializedEnvelope);
      const readBackEnvelope = await storage.getItemAsync(candidateKey);
      if (readBackEnvelope !== serializedEnvelope) {
        throw new Error("Secure session candidate verification failed");
      }
      await storage.setItemAsync(headKey, JSON.stringify(head));
      committed = true;
      await storage.deleteItemAsync(tombstoneKey);
      if (currentHead !== null) {
        await storage.deleteItemAsync(slotKey(currentHead.slot));
      }
      failClosedInMemory = false;
    } catch {
      if (committed) {
        try {
          await clearStoredSession();
        } catch {
          // The in-memory gate remains closed when durable cleanup is partial.
        }
      } else if (candidateMayContainSession && candidateKey !== null) {
        try {
          await storage.deleteItemAsync(candidateKey);
        } catch {
          try {
            await clearStoredSession();
          } catch {
            // The in-memory gate remains closed when durable cleanup is partial.
          }
        }
      }
      throw new SecureSessionStorageError();
    }
  };

  const restoreStoredSession = async (): Promise<SecureSession | null> => {
    try {
      if (failClosedInMemory) {
        return null;
      }
      if ((await storage.getItemAsync(tombstoneKey)) !== null) {
        return null;
      }
      const storedHead = await storage.getItemAsync(headKey);
      if (storedHead === null) {
        return null;
      }
      const head = parseHead(storedHead);
      const storedSession = await storage.getItemAsync(slotKey(head.slot));
      if (storedSession === null) {
        throw new Error("Missing committed secure session envelope");
      }
      const restoredSession = parseEnvelope(
        storedSession,
        head.generation,
      ).session;
      if (restoredSession.expiresAtEpochMs <= options.now()) {
        await clearStoredSession();
        return null;
      }
      return restoredSession;
    } catch {
      try {
        await clearStoredSession();
      } catch {
        // A tombstone or deletion was attempted; never expose storage details.
      }
      throw new SecureSessionStorageError();
    }
  };

  let operationTail: Promise<void> = Promise.resolve();
  const serialize = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = operationTail.then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    clear: () => serialize(clearStoredSession),
    persist: (session) => serialize(() => persistStoredSession(session)),
    restore: () => serialize(restoreStoredSession),
  };
};

const expoSecureStoreOptions = Object.freeze({
  keychainAccessible: ExpoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "huoqiu.auth.session",
}) satisfies ExpoSecureStore.SecureStoreOptions;

const expoSecureStoreAdapter: SecureStoreAdapter = Object.freeze({
  deleteItemAsync: async (key) => {
    await ExpoSecureStore.deleteItemAsync(key, expoSecureStoreOptions);
  },
  getItemAsync: async (key) =>
    ExpoSecureStore.getItemAsync(key, expoSecureStoreOptions),
  setItemAsync: async (key, value) => {
    await ExpoSecureStore.setItemAsync(key, value, expoSecureStoreOptions);
  },
});

export const createExpoSecureSessionStore = (
  options: SecureSessionStoreOptions = { now: Date.now },
): SecureSessionStore =>
  createSecureSessionStore(expoSecureStoreAdapter, options);
