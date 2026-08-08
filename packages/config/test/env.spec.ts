import { expect, it } from "vitest";

import { parseRuntimeEnv } from "../src/env.js";

it("rejects production mode without explicit environment", () => {
  expect(() => parseRuntimeEnv({ NODE_ENV: "production" })).toThrow("APP_ENV");
});
