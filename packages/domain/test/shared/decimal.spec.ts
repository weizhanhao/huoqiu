import { describe, expect, it } from "vitest";

import {
  addDecimal,
  createMoney,
  createPrice,
  createQuantity,
  formatDecimal,
  parseDecimal,
  subtractDecimal,
} from "../../src/shared/decimal.js";
import {
  createListingId,
  createPortfolioId,
  createPostId,
  createUserId,
} from "../../src/shared/ids.js";
import {
  epochMillisecondsFromUtcIso,
  utcIsoFromEpochMilliseconds,
  utcIsoInstant,
} from "../../src/shared/time.js";

describe("fixed-point decimal arithmetic", () => {
  it("adds decimal strings without binary floating-point drift", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
  });

  it("aligns different scales and handles negative values", () => {
    expect(addDecimal("12.005", "-2.5")).toBe("9.505");
    expect(subtractDecimal("1", "1.125")).toBe("-0.125");
  });

  it("normalizes leading zeros, trailing zeros, and negative zero", () => {
    expect(formatDecimal(parseDecimal("+0012.3400"))).toBe("12.34");
    expect(formatDecimal(parseDecimal("-0.000"))).toBe("0");
  });

  it.each(["", " ", ".", "1.", ".1", "1e3", "NaN", "Infinity", "1 2"])(
    "rejects invalid decimal format %j",
    (value) => {
      expect(() => parseDecimal(value)).toThrow("decimal string");
    },
  );

  it("rejects number values even when runtime callers bypass TypeScript", () => {
    expect(() => parseDecimal(0.1 as never)).toThrow("decimal string");
    expect(() => createMoney(12 as never)).toThrow("decimal string");
    expect(() => createPrice(Number.NaN as never)).toThrow("decimal string");
    expect(() => createQuantity(3 as never)).toThrow("decimal string");
  });
});

describe("shared branded primitives", () => {
  it("constructs all supported IDs and rejects blank IDs", () => {
    expect(createUserId("usr_1")).toBe("usr_1");
    expect(createListingId("lst_1")).toBe("lst_1");
    expect(createPostId("post_1")).toBe("post_1");
    expect(createPortfolioId("pf_1")).toBe("pf_1");
    expect(() => createUserId("   ")).toThrow("UserId");
  });

  it("accepts UTC ISO instants only and round-trips epoch milliseconds", () => {
    const instant = utcIsoInstant("2026-08-08T02:03:04.567Z");

    expect(epochMillisecondsFromUtcIso(instant)).toBe(1_786_154_584_567);
    expect(utcIsoFromEpochMilliseconds(1_786_154_584_567)).toBe(instant);
    expect(() => utcIsoInstant("2026-08-08T10:03:04.567+08:00")).toThrow(
      "UTC ISO",
    );
    expect(() => utcIsoInstant("2026-08-08 02:03:04")).toThrow("UTC ISO");
    expect(() => utcIsoInstant("2026-02-30T02:03:04.567Z")).toThrow(
      "valid calendar",
    );
  });
});
