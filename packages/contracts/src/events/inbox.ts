export interface InboxReceipt {
  readonly consumer: string;
  readonly event_id: string;
}

export interface InboxDeduplicator {
  readonly size: number;
  claim(receipt: InboxReceipt): boolean;
}

const requireIdentifier = (value: string, label: string): string => {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be blank`);
  }
  return value;
};

export const createInboxDeduplicator = (): InboxDeduplicator => {
  const receiptKeys = new Set<string>();

  return {
    get size() {
      return receiptKeys.size;
    },
    claim(receipt) {
      const consumer = requireIdentifier(receipt.consumer, "consumer");
      const eventId = requireIdentifier(receipt.event_id, "event_id");
      const key = JSON.stringify([consumer, eventId]);
      if (receiptKeys.has(key)) return false;
      receiptKeys.add(key);
      return true;
    },
  };
};
