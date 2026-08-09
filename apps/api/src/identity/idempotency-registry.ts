import { createHmac } from "node:crypto";

import {
  idempotencyCapacityExceeded,
  idempotencyConflict,
} from "./identity-error.js";

export const IDEMPOTENCY_REGISTRY = Symbol("IDEMPOTENCY_REGISTRY");

export type IdempotencyRegistryOptions = Readonly<{
  capacity?: number;
  now?: () => number;
  secret: string | Uint8Array;
  ttlMilliseconds?: number;
}>;

interface Entry {
  expiresAt: number;
  requestFingerprint: string;
  result: Promise<unknown>;
  settled: boolean;
}

const canonicalJson = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("IDEMPOTENCY_CANONICAL_VALUE_INVALID");
};

export class BoundedIdempotencyRegistry {
  private readonly capacity: number;
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly secret: string | Uint8Array;
  private readonly ttlMilliseconds: number;

  constructor(options: IdempotencyRegistryOptions) {
    this.capacity = options.capacity ?? 1024;
    this.now = options.now ?? Date.now;
    this.secret = options.secret;
    this.ttlMilliseconds = options.ttlMilliseconds ?? 5 * 60 * 1000;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1) {
      throw new TypeError("IDEMPOTENCY_CAPACITY_INVALID");
    }
    if (
      !Number.isSafeInteger(this.ttlMilliseconds) ||
      this.ttlMilliseconds < 1
    ) {
      throw new TypeError("IDEMPOTENCY_TTL_INVALID");
    }
  }

  async execute<T>(
    input: Readonly<{
      callerId: string;
      key: string;
      operation: string;
      request: unknown;
    }>,
    work: () => Promise<T>,
  ): Promise<T> {
    this.cleanup();
    const index = this.digest("index", [
      input.operation,
      input.callerId,
      input.key,
    ]);
    const requestFingerprint = this.digest("request", [
      input.operation,
      canonicalJson(input.request),
    ]);
    const existing = this.entries.get(index);
    if (existing !== undefined) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw idempotencyConflict();
      }
      return (await existing.result) as T;
    }

    while (this.entries.size >= this.capacity) {
      const oldestSettled = [...this.entries].find(
        ([, entry]) => entry.settled,
      )?.[0];
      if (oldestSettled === undefined) throw idempotencyCapacityExceeded();
      this.entries.delete(oldestSettled);
    }
    const result = Promise.resolve().then(work);
    const entry: Entry = {
      expiresAt: this.now() + this.ttlMilliseconds,
      requestFingerprint,
      result,
      settled: false,
    };
    this.entries.set(index, entry);
    void result.then(
      () => {
        entry.settled = true;
      },
      () => {
        entry.settled = true;
      },
    );
    return await result;
  }

  async replay<T>(
    input: Readonly<{
      callerId: string;
      key: string;
      operation: string;
      request: unknown;
    }>,
  ): Promise<T | undefined> {
    this.cleanup();
    const index = this.digest("index", [
      input.operation,
      input.callerId,
      input.key,
    ]);
    const existing = this.entries.get(index);
    if (existing === undefined) return undefined;
    const requestFingerprint = this.digest("request", [
      input.operation,
      canonicalJson(input.request),
    ]);
    if (existing.requestFingerprint !== requestFingerprint) {
      throw idempotencyConflict();
    }
    return (await existing.result) as T;
  }

  size(): number {
    this.cleanup();
    return this.entries.size;
  }

  private cleanup(): void {
    const now = this.now();
    for (const [index, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(index);
    }
  }

  private digest(namespace: string, parts: readonly string[]): string {
    const hmac = createHmac("sha256", this.secret);
    hmac.update(`huoqiu:idempotency:${namespace}:v1`);
    for (const part of parts) hmac.update("\0").update(part);
    return hmac.digest("hex");
  }
}
