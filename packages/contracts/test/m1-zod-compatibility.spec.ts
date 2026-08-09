import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z as z3 } from "zod";
import { z as z4 } from "zod4";

import { d0FixtureSchema } from "../src/d0/schema.js";
import { apiErrorSchema as sharedApiErrorSchema } from "../src/shared/error.js";
import {
  apiErrorSchema as m1ApiErrorSchema,
  requestMetaSchema,
} from "../src/m1/common.js";
import { m1Router } from "../src/m1/router.js";

const require = createRequire(import.meta.url);

const dependencyVersion = (packageName: string): string => {
  const packagePath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    version: string;
  };
  return packageJson.version;
};

const containsZod4Schema = (
  value: unknown,
  seen = new Set<unknown>(),
): boolean => {
  if (value instanceof z4.ZodType) {
    return true;
  }
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (value instanceof z3.ZodType) {
    const definition = value._def as Record<string, unknown>;
    const shape = definition.shape;
    if (typeof shape === "function" && containsZod4Schema(shape(), seen)) {
      return true;
    }
    return Object.values(definition).some((child) =>
      containsZod4Schema(child, seen),
    );
  }

  if (Array.isArray(value)) {
    return value.some((child) => containsZod4Schema(child, seen));
  }

  return Object.values(value as Record<string, unknown>).some((child) =>
    containsZod4Schema(child, seen),
  );
};

describe("ts-rest and Zod compatibility boundary", () => {
  it("pins Zod 3 for M1 and the Zod 4 alias for existing contracts", () => {
    expect(dependencyVersion("zod")).toBe("3.25.76");
    expect(dependencyVersion("zod4")).toBe("4.4.3");
  });

  it("keeps existing D0 and shared schemas on Zod 4", () => {
    expect(d0FixtureSchema).toBeInstanceOf(z4.ZodType);
    expect(sharedApiErrorSchema).toBeInstanceOf(z4.ZodType);
    expect(d0FixtureSchema).not.toBeInstanceOf(z3.ZodType);
  });

  it("keeps every M1 ts-rest schema entirely inside the Zod 3 island", () => {
    expect(requestMetaSchema).toBeInstanceOf(z3.ZodType);
    expect(m1ApiErrorSchema).toBeInstanceOf(z3.ZodType);
    expect(requestMetaSchema).not.toBeInstanceOf(z4.ZodType);

    for (const [operationId, route] of Object.entries(m1Router)) {
      expect(containsZod4Schema(route), operationId).toBe(false);
    }
  });
});
