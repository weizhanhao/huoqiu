import { describe, expect, it } from "vitest";

import { createInboxDeduplicator } from "../../src/events/index.js";

describe("generic Inbox receipt primitive", () => {
  it("applies one side effect for a replayed event per consumer", () => {
    const inbox = createInboxDeduplicator();
    const effects: string[] = [];

    const handle = (consumer: string, eventId: string): void => {
      if (inbox.claim({ consumer, event_id: eventId })) {
        effects.push(`${consumer}:${eventId}`);
      }
    };

    handle("feed-projector", "018f4f8b-1f31-7b24-8c68-8a98b59d1c01");
    handle("feed-projector", "018f4f8b-1f31-7b24-8c68-8a98b59d1c01");
    handle("search-projector", "018f4f8b-1f31-7b24-8c68-8a98b59d1c01");

    expect(effects).toEqual([
      "feed-projector:018f4f8b-1f31-7b24-8c68-8a98b59d1c01",
      "search-projector:018f4f8b-1f31-7b24-8c68-8a98b59d1c01",
    ]);
    expect(inbox.size).toBe(2);
  });

  it("does not collapse unambiguous consumer and event-id pairs", () => {
    const inbox = createInboxDeduplicator();

    expect(inbox.claim({ consumer: "a:b", event_id: "c" })).toBe(true);
    expect(inbox.claim({ consumer: "a", event_id: "b:c" })).toBe(true);
    expect(inbox.claim({ consumer: "a:b", event_id: "c" })).toBe(false);
    expect(inbox.size).toBe(2);
  });

  it("rejects blank receipt identifiers instead of claiming them", () => {
    const inbox = createInboxDeduplicator();

    expect(() => inbox.claim({ consumer: "", event_id: "event_1" })).toThrow(
      "consumer",
    );
    expect(() => inbox.claim({ consumer: "feed", event_id: "" })).toThrow(
      "event_id",
    );
    expect(inbox.size).toBe(0);
  });
});
