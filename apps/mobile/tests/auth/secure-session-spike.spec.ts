import { describe, expect, it, vi } from "vitest";

const expoSecureStoreMock = vi.hoisted(() => {
  const values = new Map<string, string>();
  const observedOptions: unknown[] = [];
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    deleteItemAsync: async (key: string, options?: unknown) => {
      observedOptions.push(options);
      values.delete(key);
    },
    getItemAsync: async (key: string, options?: unknown) => {
      observedOptions.push(options);
      return values.get(key) ?? null;
    },
    observedOptions,
    reset: () => {
      observedOptions.length = 0;
      values.clear();
    },
    setItemAsync: async (key: string, value: string, options?: unknown) => {
      observedOptions.push(options);
      values.set(key, value);
    },
  };
});

vi.mock("expo-secure-store", () => expoSecureStoreMock);

import {
  createSecureSessionStore,
  type SecureSession,
  type SecureSessionStore,
  SecureSessionStorageError,
  type SecureStoreAdapter,
} from "../../src/auth/secure-session-spike";

const session: SecureSession = Object.freeze({
  accessToken: "access-secret",
  expiresAtEpochMs: 2_000_000_000_000,
  refreshToken: "refresh-secret",
  userId: "user_001",
});

type MemorySecureStore = Readonly<{
  adapter: SecureStoreAdapter;
  corruptStoredValueContaining: (fragment: string) => void;
  corruptSetOnCall: (call: number) => void;
  deleteCallCount: () => number;
  failDeleteOnCall: (call: number) => void;
  failSetOnCall: (call: number) => void;
  pauseNextTokenWrite: () => Readonly<{
    release: () => void;
    waitUntilPaused: Promise<void>;
  }>;
  replaceStoredValueContaining: (fragment: string, replacement: string) => void;
  setCallCount: () => number;
  storedValues: () => readonly string[];
}>;

const createMemorySecureStore = (): MemorySecureStore => {
  const values = new Map<string, string>();
  let corruptOnSetCall: number | null = null;
  let deleteCalls = 0;
  let failOnDeleteCall: number | null = null;
  let failOnSetCall: number | null = null;
  let tokenWritePause:
    | Readonly<{
        releasePromise: Promise<void>;
        releaseWrite: () => void;
        reportPaused: () => void;
      }>
    | undefined;
  let setCalls = 0;
  return {
    adapter: {
      deleteItemAsync: async (key) => {
        deleteCalls += 1;
        if (deleteCalls === failOnDeleteCall) {
          throw new Error(`injected ${session.accessToken} delete failure`);
        }
        values.delete(key);
      },
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        setCalls += 1;
        if (setCalls === failOnSetCall) {
          throw new Error(`injected ${value} set failure`);
        }
        if (tokenWritePause !== undefined && value.includes('"accessToken"')) {
          const pause = tokenWritePause;
          tokenWritePause = undefined;
          pause.reportPaused();
          await pause.releasePromise;
        }
        values.set(key, setCalls === corruptOnSetCall ? "corrupted" : value);
      },
    },
    corruptStoredValueContaining: (fragment) => {
      for (const [key, value] of values) {
        if (value.includes(fragment)) {
          values.set(key, `{"leaked":"${fragment}"`);
        }
      }
    },
    corruptSetOnCall: (call) => {
      corruptOnSetCall = call;
    },
    deleteCallCount: () => deleteCalls,
    failDeleteOnCall: (call) => {
      failOnDeleteCall = call;
    },
    failSetOnCall: (call) => {
      failOnSetCall = call;
    },
    pauseNextTokenWrite: () => {
      let releaseWrite: () => void = () => undefined;
      let reportPaused: () => void = () => undefined;
      const releasePromise = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const waitUntilPaused = new Promise<void>((resolve) => {
        reportPaused = resolve;
      });
      tokenWritePause = { releasePromise, releaseWrite, reportPaused };
      return { release: releaseWrite, waitUntilPaused };
    },
    replaceStoredValueContaining: (fragment, replacement) => {
      for (const [key, value] of values) {
        if (value.includes(fragment)) {
          values.set(key, replacement);
        }
      }
    },
    setCallCount: () => setCalls,
    storedValues: () => [...values.values()],
  };
};

describe("Expo SecureStore session spike", () => {
  it("restores the last committed provider-neutral session", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });

    await store.persist(session);

    await expect(store.restore()).resolves.toEqual(session);
  });

  it("keeps the previous session when committing a replacement is interrupted", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    const replacement: SecureSession = {
      ...session,
      accessToken: "replacement-access-secret",
      refreshToken: "replacement-refresh-secret",
    };
    await store.persist(session);
    memory.failSetOnCall(memory.setCallCount() + 2);

    await expect(store.persist(replacement)).rejects.toThrow();

    await expect(store.restore()).resolves.toEqual(session);
    expect(memory.storedValues().join("|")).not.toContain(
      replacement.accessToken,
    );
    expect(memory.storedValues().join("|")).not.toContain(
      replacement.refreshToken,
    );
  });

  it("fails closed when an interrupted candidate cannot be removed", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    const replacement: SecureSession = {
      ...session,
      accessToken: "replacement-access-secret",
      refreshToken: "replacement-refresh-secret",
    };
    await store.persist(session);
    memory.failSetOnCall(memory.setCallCount() + 2);
    memory.failDeleteOnCall(memory.deleteCallCount() + 2);

    await expect(store.persist(replacement)).rejects.toBeInstanceOf(
      SecureSessionStorageError,
    );

    await expect(store.restore()).resolves.toBeNull();
    expect(memory.storedValues().join("|")).not.toContain(session.accessToken);
    expect(memory.storedValues().join("|")).not.toContain(
      replacement.accessToken,
    );
  });

  it("fails closed when post-commit cleanup is incomplete", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    const replacement: SecureSession = {
      ...session,
      accessToken: "replacement-access-secret",
    };
    await store.persist(session);
    memory.failDeleteOnCall(memory.deleteCallCount() + 3);

    await expect(store.persist(replacement)).rejects.toBeInstanceOf(
      SecureSessionStorageError,
    );

    await expect(store.restore()).resolves.toBeNull();
    expect(memory.storedValues().join("|")).not.toContain(session.accessToken);
    expect(memory.storedValues().join("|")).not.toContain(
      replacement.accessToken,
    );
  });

  it("does not commit a candidate that SecureStore cannot read back", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    const replacement: SecureSession = {
      ...session,
      accessToken: "replacement-access-secret",
    };
    await store.persist(session);
    memory.corruptSetOnCall(memory.setCallCount() + 1);

    await expect(store.persist(replacement)).rejects.toThrow();

    await expect(store.restore()).resolves.toEqual(session);
  });

  it("fails closed and removes token material when the session is expired", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => session.expiresAtEpochMs,
    });
    await store.persist(session);

    await expect(store.restore()).resolves.toBeNull();

    expect(memory.storedValues().join("|")).not.toContain(session.accessToken);
    expect(memory.storedValues().join("|")).not.toContain(session.refreshToken);
  });

  it("clears the current device session on logout", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    await store.persist(session);

    await store.clear();

    await expect(store.restore()).resolves.toBeNull();
    expect(memory.storedValues().join("|")).not.toContain(session.accessToken);
  });

  it("keeps logout fail-closed and redacts storage failures", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    await store.persist(session);
    memory.failDeleteOnCall(memory.deleteCallCount() + 1);

    const error = await store.clear().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SecureSessionStorageError);
    expect(String(error)).toBe(
      "SecureSessionStorageError: Secure session storage operation failed",
    );
    expect(String(error)).not.toContain(session.accessToken);
    await expect(store.restore()).resolves.toBeNull();
    expect(memory.storedValues().join("|")).not.toContain(session.accessToken);
  });

  it("redacts session material from persistence errors", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    memory.failSetOnCall(1);

    const error = await store.persist(session).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SecureSessionStorageError);
    expect(String(error)).toBe(
      "SecureSessionStorageError: Secure session storage operation failed",
    );
    expect(String(error)).not.toContain(session.accessToken);
    expect(String(error)).not.toContain(session.refreshToken);
  });

  it("fails closed when committed storage is malformed", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    await store.persist(session);
    memory.corruptStoredValueContaining(session.accessToken);

    const error = await store.restore().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SecureSessionStorageError);
    expect(String(error)).toBe(
      "SecureSessionStorageError: Secure session storage operation failed",
    );
    expect(String(error)).not.toContain(session.accessToken);
  });

  it.each([
    [
      "head schema",
      '"slot"',
      JSON.stringify({ generation: 1, schemaVersion: 2, slot: "a" }),
    ],
    [
      "head slot",
      '"slot"',
      JSON.stringify({ generation: 1, schemaVersion: 1, slot: "outside" }),
    ],
    [
      "envelope generation",
      session.accessToken,
      JSON.stringify({ generation: 2, schemaVersion: 1, session }),
    ],
    [
      "session fields",
      session.accessToken,
      JSON.stringify({
        generation: 1,
        schemaVersion: 1,
        session: { ...session, accessToken: "", expiresAtEpochMs: null },
      }),
    ],
  ] as const)("rejects an invalid %s", async (_name, fragment, replacement) => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    await store.persist(session);
    memory.replaceStoredValueContaining(fragment, replacement);

    await expect(store.restore()).rejects.toBeInstanceOf(
      SecureSessionStorageError,
    );

    await expect(store.restore()).resolves.toBeNull();
  });

  it.each([
    ["empty token", { ...session, accessToken: "" }],
    ["non-finite expiry", { ...session, expiresAtEpochMs: Infinity }],
    [
      "provider-private field",
      { ...session, privateProviderField: "must-not-persist" },
    ],
  ] as const)(
    "rejects an invalid input session with %s",
    async (_name, value) => {
      const memory = createMemorySecureStore();
      const store = createSecureSessionStore(memory.adapter, {
        now: () => 1_900_000_000_000,
      });

      await expect(
        store.persist(value as SecureSession),
      ).rejects.toBeInstanceOf(SecureSessionStorageError);

      await expect(store.restore()).resolves.toBeNull();
    },
  );

  it("serializes persist then clear so the later logout wins", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    const pause = memory.pauseNextTokenWrite();

    const persistPromise = store.persist(session);
    const clearPromise = store.clear();
    await pause.waitUntilPaused;
    pause.release();
    await Promise.all([persistPromise, clearPromise]);

    await expect(store.restore()).resolves.toBeNull();
    expect(memory.storedValues().join("|")).not.toContain(session.accessToken);
  });

  it("continues serialized cleanup after a failed operation", async () => {
    const memory = createMemorySecureStore();
    const store = createSecureSessionStore(memory.adapter, {
      now: () => 1_900_000_000_000,
    });
    memory.failSetOnCall(1);
    await expect(store.persist(session)).rejects.toBeInstanceOf(
      SecureSessionStorageError,
    );

    await expect(store.clear()).resolves.toBeUndefined();
    await expect(store.restore()).resolves.toBeNull();
  });

  it("provides a production factory backed by Expo SecureStore", async () => {
    expoSecureStoreMock.reset();
    const secureSessionModule =
      (await import("../../src/auth/secure-session-spike")) as Readonly<{
        createExpoSecureSessionStore?: (options: {
          now: () => number;
        }) => SecureSessionStore;
      }>;

    expect(secureSessionModule.createExpoSecureSessionStore).toBeTypeOf(
      "function",
    );
    const store = secureSessionModule.createExpoSecureSessionStore?.({
      now: () => 1_900_000_000_000,
    });
    await store?.persist(session);

    await expect(store?.restore()).resolves.toEqual(session);
    expect(expoSecureStoreMock.observedOptions).not.toHaveLength(0);
    expect(expoSecureStoreMock.observedOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keychainAccessible: 6,
          keychainService: "huoqiu.auth.session",
        }),
      ]),
    );
  });
});
