import fixtureJson from "@huoqiu/contracts/d0/fixture";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it } from "vitest";

import { PageState } from "../../../src/components/d0/page-state";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";

type RetryProperties = Readonly<{
  accessibilityLabel?: string;
  children?: ReactNode;
  onPress?: () => void;
}>;

const propertiesOf = (element: ReactElement): RetryProperties =>
  element.props as RetryProperties;

const findRetry = (node: ReactNode): ReactElement => {
  if (!isValidElement(node)) {
    throw new Error("Expected the real Retry control");
  }
  if (propertiesOf(node).accessibilityLabel === "重试加载演示数据") {
    return node;
  }
  for (const child of Children.toArray(propertiesOf(node).children)) {
    if (!isValidElement(child)) {
      continue;
    }
    try {
      return findRetry(child);
    } catch {
      // Continue until the real Retry control is found.
    }
  }
  throw new Error("Expected the real Retry control");
};

describe("D0 mobile fixture recovery", () => {
  it("re-parses the fixture on every attempt so Retry can recover", () => {
    const mutableFixture = fixtureJson as { version: string };
    const originalVersion = mutableFixture.version;
    let result = loadD0Fixture();
    expect(result.status).toBe("ready");

    try {
      mutableFixture.version = "broken-fixture";
      result = loadD0Fixture();
      expect(result.status).toBe("error");

      const retryTree = PageState({
        onRetry: () => {
          mutableFixture.version = originalVersion;
          result = loadD0Fixture();
        },
        state: "error",
      });
      const retry = findRetry(retryTree);
      expect(propertiesOf(retry).onPress).toBeTypeOf("function");
      propertiesOf(retry).onPress?.();
      expect(result.status).toBe("ready");
    } finally {
      mutableFixture.version = originalVersion;
    }
  });
});
