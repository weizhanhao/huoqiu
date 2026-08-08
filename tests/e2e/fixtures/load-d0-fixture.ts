import { d0FixtureSchema, type D0Fixture } from "@huoqiu/contracts/d0";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(
  process.cwd(),
  "packages/contracts/fixtures/d0.v1.json",
);

export const loadD0Fixture = (): D0Fixture =>
  d0FixtureSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));
