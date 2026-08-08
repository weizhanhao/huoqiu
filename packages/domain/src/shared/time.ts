import type { Brand } from "./ids.js";

export type UtcIsoInstant = Brand<string, "UtcIsoInstant">;

const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const assertEpochMilliseconds = (value: number): void => {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Epoch milliseconds must be a safe integer");
  }
};

export const utcIsoFromEpochMilliseconds = (value: number): UtcIsoInstant => {
  assertEpochMilliseconds(value);

  try {
    return new Date(value).toISOString() as UtcIsoInstant;
  } catch {
    throw new RangeError(
      "Epoch milliseconds are outside the supported ISO range",
    );
  }
};

export const utcIsoInstant = (value: string): UtcIsoInstant => {
  if (typeof value !== "string" || !UTC_ISO_PATTERN.test(value)) {
    throw new TypeError("Expected an explicit UTC ISO instant ending in Z");
  }

  const epochMilliseconds = Date.parse(value);
  if (!Number.isFinite(epochMilliseconds)) {
    throw new RangeError("UTC ISO instant is outside the supported range");
  }

  if (new Date(epochMilliseconds).toISOString() !== value) {
    throw new RangeError("UTC ISO instant is not a valid calendar instant");
  }

  return utcIsoFromEpochMilliseconds(epochMilliseconds);
};

export const epochMillisecondsFromUtcIso = (value: UtcIsoInstant): number =>
  Date.parse(utcIsoInstant(value));
