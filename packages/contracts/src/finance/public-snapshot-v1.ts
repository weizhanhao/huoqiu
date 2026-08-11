import { z } from "zod";

import {
  financeSourceDescriptorSchema,
  normalizedFinanceRecordSchema,
} from "./ingestion-v1.js";

export const publicFinanceSourceRunStatusSchema = z.enum([
  "ready",
  "empty",
  "degraded",
]);

export const publicFinanceFailureCodeSchema = z.enum([
  "SOURCE_UNAVAILABLE",
  "INVALID_SOURCE_RECORD",
  "STORE_UNAVAILABLE",
]);

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};

export const publicFinanceSourceStateSchema = z
  .object({
    descriptor: financeSourceDescriptorSchema,
    lastRunStatus: publicFinanceSourceRunStatusSchema,
    lastAttemptAt: z.string().datetime({ offset: true }),
    lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
    staleAt: z.string().datetime({ offset: true }).nullable(),
    failureCode: publicFinanceFailureCodeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.descriptor.sourceMode !== "real" ||
      !value.descriptor.externalDisplayAllowed ||
      value.descriptor.bodyStorageAllowed ||
      value.descriptor.imageStorageAllowed
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["descriptor"],
        message:
          "Public finance snapshots require real, externally displayable metadata-only sources",
      });
    }

    if (value.lastRunStatus === "degraded") {
      if (value.failureCode === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failureCode"],
          message: "A degraded finance source requires a failure code",
        });
      }
    } else {
      if (value.failureCode !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failureCode"],
          message: "A successful finance source cannot expose a failure code",
        });
      }
      if (value.lastSuccessAt === null || value.staleAt === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lastSuccessAt"],
          message: "A successful finance source requires freshness timestamps",
        });
      }
    }

    if ((value.lastSuccessAt === null) !== (value.staleAt === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staleAt"],
        message:
          "Finance source last success and stale timestamps must be present together",
      });
    }
    if (value.lastSuccessAt !== null && value.staleAt !== null) {
      const expectedStaleAt =
        Date.parse(value.lastSuccessAt) +
        value.descriptor.staleAfterSeconds * 1_000;
      if (Date.parse(value.staleAt) !== expectedStaleAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["staleAt"],
          message:
            "Finance source staleAt must derive from its verified cadence policy",
        });
      }
    }
  });

export const publicFinanceSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    sources: z.array(publicFinanceSourceStateSchema).max(32),
    records: z.array(normalizedFinanceRecordSchema).max(250),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const sourceStates = new Map(
      snapshot.sources.map((sourceState) => [
        sourceState.descriptor.source,
        sourceState,
      ]),
    );
    if (sourceStates.size !== snapshot.sources.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sources"],
        message: "Public finance snapshot sources must be unique",
      });
    }

    const generatedAt = Date.parse(snapshot.generatedAt);
    for (const [index, sourceState] of snapshot.sources.entries()) {
      if (Date.parse(sourceState.lastAttemptAt) > generatedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", index, "lastAttemptAt"],
          message: "Finance source attempt cannot follow snapshot generation",
        });
      }
    }

    const recordKeys = new Set<string>();
    for (const [index, record] of snapshot.records.entries()) {
      const sourceState = sourceStates.get(record.provenance.source);
      if (sourceState === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["records", index, "provenance", "source"],
          message: "Public finance record references an unknown source",
        });
        continue;
      }
      if (
        canonicalJson(record.provenance) !==
        canonicalJson(sourceState.descriptor)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["records", index, "provenance"],
          message:
            "Public finance record provenance must match its source policy snapshot",
        });
      }
      const recordKey = `${record.provenance.source}\u0000${record.sourceRecordId}`;
      if (recordKeys.has(recordKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["records", index, "sourceRecordId"],
          message: "Public finance record identity must be unique per source",
        });
      }
      recordKeys.add(recordKey);
    }
  });

export type PublicFinanceFailureCode = z.infer<
  typeof publicFinanceFailureCodeSchema
>;
export type PublicFinanceSnapshot = z.infer<typeof publicFinanceSnapshotSchema>;
export type PublicFinanceSourceRunStatus = z.infer<
  typeof publicFinanceSourceRunStatusSchema
>;
export type PublicFinanceSourceState = z.infer<
  typeof publicFinanceSourceStateSchema
>;
