import fixtureJson from "@huoqiu/contracts/d0/fixture";
import { d0FixtureSchema, type D0Fixture } from "@huoqiu/contracts/d0";

export type D0FixtureLoadResult =
  | Readonly<{ status: "ready"; data: D0Fixture }>
  | Readonly<{ status: "error"; message: string }>;

const parseD0Fixture = (): D0FixtureLoadResult => {
  try {
    return {
      status: "ready",
      data: d0FixtureSchema.parse(fixtureJson),
    };
  } catch {
    return {
      status: "error",
      message: "演示数据校验失败，请重新加载。",
    };
  }
};

const moduleFixtureResult = parseD0Fixture();

export const loadD0Fixture = (): D0FixtureLoadResult => moduleFixtureResult;
