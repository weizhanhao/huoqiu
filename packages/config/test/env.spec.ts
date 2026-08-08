import { expect, it } from "vitest";

import { parseRuntimeEnv } from "../src/env.js";

it("rejects production mode without explicit environment", () => {
  expect(() => parseRuntimeEnv({ NODE_ENV: "production" })).toThrow("APP_ENV");
});

it("parses a valid runtime environment", () => {
  expect(
    parseRuntimeEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
    }),
  ).toEqual({
    NODE_ENV: "production",
    APP_ENV: "production",
  });
});

it("rejects an invalid NODE_ENV", () => {
  expect(() =>
    parseRuntimeEnv({ NODE_ENV: "preview", APP_ENV: "staging" }),
  ).toThrow("NODE_ENV");
});

it("rejects an invalid APP_ENV", () => {
  expect(() =>
    parseRuntimeEnv({ NODE_ENV: "test", APP_ENV: "preview" }),
  ).toThrow("APP_ENV");
});
