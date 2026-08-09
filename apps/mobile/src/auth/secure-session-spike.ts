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

interface StorageCoordination {
  cleanupRequired: boolean;
  failClosedInMemory: boolean;
  invalidationGeneration: number;
  operationTail: Promise<void>;
}

/*
 * The in-memory gate is shared by every store using the same adapter. A durable
 * tombstone carries logout across process restarts when SecureStore accepts its
 * write. If both that write and token deletion fail, only this process can stay
 * fail-closed; callers must also revoke the server session before trusting a
 * later process, because client-only storage cannot prove logout after restart.
 */
const coordinationByStorage = new WeakMap<
  SecureStoreAdapter,
  StorageCoordination
>();

const getStorageCoordination = (
  storage: SecureStoreAdapter,
): StorageCoordination => {
  const existing = coordinationByStorage.get(storage);
  if (existing !== undefined) {
    return existing;
  }
  const coordination: StorageCoordination = {
    cleanupRequired: false,
    failClosedInMemory: false,
    invalidationGeneration: 0,
    operationTail: Promise.resolve(),
  };
  coordinationByStorage.set(storage, coordination);
  return coordination;
};

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
  const coordination = getStorageCoordination(storage);

  const markInvalidated = (): number => {
    coordination.failClosedInMemory = true;
    coordination.cleanupRequired = true;
    if (coordination.invalidationGeneration === Number.MAX_SAFE_INTEGER) {
      return coordination.invalidationGeneration;
    }
    coordination.invalidationGeneration += 1;
    return coordination.invalidationGeneration;
  };

  const clearStoredSession = async (
    invalidationGeneration: number,
  ): Promise<void> => {
    coordination.failClosedInMemory = true;
    coordination.cleanupRequired = true;
    let failed = false;
    try {
      await storage.setItemAsync(
        tombstoneKey,
        JSON.stringify({
          invalidationGeneration,
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
    if (coordination.invalidationGeneration === invalidationGeneration) {
      coordination.cleanupRequired = false;
    }
  };

  const persistStoredSession = async (
    session: SecureSession,
    expectedInvalidationGeneration: number,
  ): Promise<void> => {
    let candidateKey: string | null = null;
    let candidateMayContainSession = false;
    let committed = false;
    try {
      if (!isSecureSession(session)) {
        throw new Error("Invalid secure session");
      }
      if (coordination.cleanupRequired) {
        await clearStoredSession(coordination.invalidationGeneration);
      }
      const initialTombstone = await storage.getItemAsync(tombstoneKey);
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
      if (
        coordination.invalidationGeneration !==
          expectedInvalidationGeneration ||
        (await storage.getItemAsync(tombstoneKey)) !== initialTombstone
      ) {
        throw new Error("Secure session invalidated before commit");
      }
      await storage.setItemAsync(headKey, JSON.stringify(head));
      committed = true;
      if (
        coordination.invalidationGeneration !== expectedInvalidationGeneration
      ) {
        throw new Error("Secure session invalidated during commit");
      }
      await storage.deleteItemAsync(tombstoneKey);
      if (
        coordination.invalidationGeneration !== expectedInvalidationGeneration
      ) {
        throw new Error("Secure session invalidated during commit");
      }
      if (currentHead !== null) {
        await storage.deleteItemAsync(slotKey(currentHead.slot));
      }
      if (
        coordination.invalidationGeneration !==
          expectedInvalidationGeneration ||
        (await storage.getItemAsync(tombstoneKey)) !== null
      ) {
        throw new Error("Secure session invalidated during commit");
      }
      coordination.cleanupRequired = false;
      coordination.failClosedInMemory = false;
    } catch {
      if (committed) {
        const invalidationGeneration = coordination.failClosedInMemory
          ? coordination.invalidationGeneration
          : markInvalidated();
        try {
          await clearStoredSession(invalidationGeneration);
        } catch {
          // The shared in-memory gate remains closed for a later cleanup retry.
        }
      } else if (candidateMayContainSession && candidateKey !== null) {
        try {
          await storage.deleteItemAsync(candidateKey);
        } catch {
          const invalidationGeneration = markInvalidated();
          try {
            await clearStoredSession(invalidationGeneration);
          } catch {
            // The shared in-memory gate remains closed for a later cleanup retry.
          }
        }
      }
      throw new SecureSessionStorageError();
    }
  };

  const restoreStoredSession = async (): Promise<SecureSession | null> => {
    if (coordination.failClosedInMemory) {
      if (coordination.cleanupRequired) {
        try {
          await clearStoredSession(coordination.invalidationGeneration);
        } catch {
          throw new SecureSessionStorageError();
        }
      }
      return null;
    }

    let storedTombstone: string | null;
    try {
      storedTombstone = await storage.getItemAsync(tombstoneKey);
    } catch {
      const invalidationGeneration = markInvalidated();
      try {
        await clearStoredSession(invalidationGeneration);
      } catch {
        // The shared in-memory gate remains closed for a later cleanup retry.
      }
      throw new SecureSessionStorageError();
    }
    if (storedTombstone !== null) {
      const invalidationGeneration = markInvalidated();
      try {
        await clearStoredSession(invalidationGeneration);
        return null;
      } catch {
        throw new SecureSessionStorageError();
      }
    }

    try {
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
        await clearStoredSession(markInvalidated());
        return null;
      }
      return restoredSession;
    } catch {
      const invalidationGeneration = markInvalidated();
      try {
        await clearStoredSession(invalidationGeneration);
      } catch {
        // The shared in-memory gate remains closed for a later cleanup retry.
      }
      throw new SecureSessionStorageError();
    }
  };

  const serialize = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = coordination.operationTail.then(operation);
    coordination.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    clear: () => {
      const invalidationGeneration = markInvalidated();
      const priorTail = coordination.operationTail;
      const result = clearStoredSession(invalidationGeneration);
      coordination.operationTail = Promise.allSettled([priorTail, result]).then(
        () => undefined,
      );
      return result;
    },
    persist: (session) => {
      const expectedInvalidationGeneration =
        coordination.invalidationGeneration;
      return serialize(() =>
        persistStoredSession(session, expectedInvalidationGeneration),
      );
    },
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
