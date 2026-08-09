import { describe, expect, it } from "vitest";

import {
  m1OperationRegistry as rootOperationRegistry,
  m1Router as rootRouter,
  notificationSseDataSchema as rootSseDataSchema,
  notificationSseFrameBatchSchema as rootSseFrameBatchSchema,
  notificationSseWireSchema as rootSseWireSchema,
  type M1AppRouter,
} from "@huoqiu/contracts";
import {
  m1OperationRegistry as subpathOperationRegistry,
  m1Router as subpathRouter,
  notificationSseDataSchema as subpathSseDataSchema,
  notificationSseFrameBatchSchema as subpathSseFrameBatchSchema,
  notificationSseWireSchema as subpathSseWireSchema,
  type AppRouter,
} from "@huoqiu/contracts/m1";

describe("M1 public package entrypoints", () => {
  it("supports the explicit M1 subpath for runtime and AppRouter consumers", () => {
    const typedRouter: AppRouter = subpathRouter;

    expect(typedRouter).toBe(subpathRouter);
    expect(subpathOperationRegistry).toHaveLength(31);
  });

  it("exposes M1 from the root with a milestone-qualified router type", () => {
    const typedRootRouter: M1AppRouter = rootRouter;

    expect(typedRootRouter).toBe(subpathRouter);
    expect(rootOperationRegistry).toBe(subpathOperationRegistry);
  });

  it("exports the dedicated SSE SDK boundary from both public entrypoints", () => {
    expect(subpathSseDataSchema).toBeDefined();
    expect(subpathSseFrameBatchSchema).toBeDefined();
    expect(subpathSseWireSchema).toBeDefined();
    expect(rootSseDataSchema).toBe(subpathSseDataSchema);
    expect(rootSseFrameBatchSchema).toBe(subpathSseFrameBatchSchema);
    expect(rootSseWireSchema).toBe(subpathSseWireSchema);
  });
});
