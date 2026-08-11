import type {
  FinanceSourceDescriptor,
  NormalizedFinanceRecord,
} from "@huoqiu/contracts/finance/ingestion-v1";
import { normalizedFinanceRecordSchema } from "@huoqiu/contracts/finance/ingestion-v1";

import type {
  FinanceRecordPersistResult,
  FinanceRecordStore,
  FinanceSourceAdapter,
  FinanceSourceBatch,
} from "../ingestion.js";

export class TestFinanceSourceAdapter implements FinanceSourceAdapter {
  readonly descriptor: FinanceSourceDescriptor;
  readonly #batches: FinanceSourceBatch[];

  constructor(
    options: Readonly<{
      descriptor: FinanceSourceDescriptor;
      batches: readonly FinanceSourceBatch[];
    }>,
  ) {
    this.descriptor = options.descriptor;
    this.#batches = [...options.batches];
  }

  async fetch(): Promise<FinanceSourceBatch> {
    return this.#batches.shift() ?? { records: [] };
  }
}

export class InMemoryFinanceRecordStore implements FinanceRecordStore {
  readonly #recordsByIdentity = new Map<string, NormalizedFinanceRecord>();

  async persist(
    records: readonly NormalizedFinanceRecord[],
  ): Promise<FinanceRecordPersistResult> {
    const draft = new Map(this.#recordsByIdentity);
    const validatedRecords = records.map((record) =>
      normalizedFinanceRecordSchema.parse(record),
    );
    let created = 0;
    let updated = 0;
    let duplicates = 0;

    for (const record of validatedRecords) {
      const identity = JSON.stringify([
        record.provenance.source,
        record.sourceRecordId,
      ]);
      const existing = draft.get(identity);
      if (existing === undefined) {
        created += 1;
        draft.set(identity, structuredClone(record));
      } else if (existing.contentHash === record.contentHash) {
        duplicates += 1;
        draft.set(identity, structuredClone(record));
      } else {
        updated += 1;
        draft.set(identity, structuredClone(record));
      }
    }

    this.#recordsByIdentity.clear();
    for (const [identity, record] of draft) {
      this.#recordsByIdentity.set(identity, record);
    }

    return {
      created,
      updated,
      duplicates,
      records: validatedRecords.map((record) => structuredClone(record)),
    };
  }

  records(): readonly NormalizedFinanceRecord[] {
    return [...this.#recordsByIdentity.values()].map((record) =>
      structuredClone(record),
    );
  }
}
