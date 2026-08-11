import { z } from "zod";

const sourceNameSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);

const boundedOpaqueIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value));

const httpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.href === value
    );
  }, "Expected a canonical HTTPS URL without credentials or fragments");

const rightsLabelSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value));

const cadenceSecondsSchema = z.number().int().min(0).max(604_800);

const pollIntervalSecondsSchema = z.number().int().min(1).max(604_800);

const retentionDaysSchema = z.number().int().min(0).max(3_650);

const attributeValueSchema = z.union([
  z.string().max(512),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const bodyOrMediaAttributeKeys = new Set([
  "articlebody",
  "articletext",
  "body",
  "content",
  "description",
  "fulltext",
  "html",
  "image",
  "imageurl",
  "media",
  "mediaurl",
  "rawhtml",
  "rawtext",
  "text",
  "thumbnail",
  "thumbnailurl",
]);

const isBodyOrMediaAttributeKey = (key: string): boolean =>
  bodyOrMediaAttributeKeys.has(key.toLowerCase().replace(/[^a-z0-9]/gu, ""));

const attributesSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(96)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
    attributeValueSchema,
  )
  .refine((value) => Object.keys(value).length <= 64, {
    message: "Finance content attributes are bounded to 64 entries",
  });

export const financeRecordKindSchema = z.enum([
  "news",
  "filing",
  "macro",
  "quote",
  "fund_nav",
]);

export const financeSourceModeSchema = z.enum(["real", "synthetic"]);

export const financeLicenseScopeSchema = z.enum([
  "public-reuse",
  "open-attribution",
  "metadata-linkout-only",
  "internal-nondisplay",
  "external-display-contract",
  "redistribution-contract",
  "unknown-blocked",
]);

const externalDisplayLicenseScopes = new Set([
  "public-reuse",
  "open-attribution",
  "metadata-linkout-only",
  "external-display-contract",
  "redistribution-contract",
]);

export const financeContentSchema = z
  .object({
    title: z.string().min(1).max(500),
    summary: z.string().min(1).max(5_000).optional(),
    excerpt: z.string().min(1).max(2_000).optional(),
    language: z
      .string()
      .min(2)
      .max(35)
      .regex(/^(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/u),
    symbols: z.array(z.string().min(1).max(64)).max(64).default([]),
    topics: z
      .array(
        z
          .string()
          .min(1)
          .max(96)
          .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value)),
      )
      .max(32),
    attributes: attributesSchema.default({}),
  })
  .strict();

export const financePublisherSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value)),
    identifier: boundedOpaqueIdSchema.optional(),
    url: httpsUrlSchema.optional(),
  })
  .strict();

export const financeSourceDescriptorSchema = z
  .object({
    source: sourceNameSchema,
    sourceMode: financeSourceModeSchema,
    entitlement: rightsLabelSchema.nullable(),
    license: rightsLabelSchema.nullable(),
    delaySeconds: cadenceSecondsSchema,
    capabilities: z
      .array(financeRecordKindSchema)
      .min(1)
      .max(financeRecordKindSchema.options.length)
      .refine((value) => new Set(value).size === value.length, {
        message: "Finance source capabilities must be unique",
      }),
    licenseUrl: httpsUrlSchema,
    licenseScope: financeLicenseScopeSchema,
    externalDisplayAllowed: z.boolean(),
    bodyStorageAllowed: z.boolean(),
    attribution: z
      .string()
      .min(1)
      .max(300)
      .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value)),
    licenseVerifiedAt: z.string().datetime({ offset: true }),
    officialSource: z.boolean(),
    nativeCadenceSeconds: cadenceSecondsSchema,
    minPollIntervalSeconds: pollIntervalSecondsSchema,
    staleAfterSeconds: cadenceSecondsSchema,
    redistributionAllowed: z.boolean(),
    transformationAllowed: z.boolean(),
    attributionRequired: z.boolean(),
    termsVerifiedAt: z.string().datetime({ offset: true }),
    rawRetentionDays: retentionDaysSchema,
    licenseSnapshotId: boundedOpaqueIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.entitlement === null && value.license === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance provenance requires an entitlement or license",
      });
    }
    if (value.sourceMode === "synthetic" && value.entitlement !== "synthetic") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Synthetic sources require the synthetic entitlement",
      });
    }
    if (
      value.sourceMode === "real" &&
      (value.entitlement === "synthetic" || value.license === "synthetic")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Real sources cannot claim synthetic provenance",
      });
    }
    if (
      value.sourceMode === "real" &&
      (!value.externalDisplayAllowed ||
        !externalDisplayLicenseScopes.has(value.licenseScope))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Real source display rights must be verified and allowed",
      });
    }
  });

export const financeSourceRecordSchema = z
  .object({
    sourceRecordId: boundedOpaqueIdSchema,
    kind: financeRecordKindSchema,
    sourceUrl: httpsUrlSchema,
    publishedAt: z.string().datetime({ offset: true }),
    publisher: financePublisherSchema,
    content: financeContentSchema,
  })
  .strict();

export const normalizedFinanceRecordSchema = financeSourceRecordSchema
  .extend({
    source: sourceNameSchema,
    sourceMode: financeSourceModeSchema,
    fetchedAt: z.string().datetime({ offset: true }),
    entitlement: rightsLabelSchema.nullable(),
    license: rightsLabelSchema.nullable(),
    delaySeconds: cadenceSecondsSchema,
    sourceCapabilities: z
      .array(financeRecordKindSchema)
      .min(1)
      .max(financeRecordKindSchema.options.length),
    licenseUrl: httpsUrlSchema,
    licenseScope: financeLicenseScopeSchema,
    externalDisplayAllowed: z.boolean(),
    bodyStorageAllowed: z.boolean(),
    attribution: z.string().min(1).max(300),
    licenseVerifiedAt: z.string().datetime({ offset: true }),
    officialSource: z.boolean(),
    nativeCadenceSeconds: cadenceSecondsSchema,
    minPollIntervalSeconds: pollIntervalSecondsSchema,
    staleAfterSeconds: cadenceSecondsSchema,
    redistributionAllowed: z.boolean(),
    transformationAllowed: z.boolean(),
    attributionRequired: z.boolean(),
    termsVerifiedAt: z.string().datetime({ offset: true }),
    rawRetentionDays: retentionDaysSchema,
    licenseSnapshotId: boundedOpaqueIdSchema,
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    const provenance = financeSourceDescriptorSchema.safeParse({
      source: value.source,
      sourceMode: value.sourceMode,
      entitlement: value.entitlement,
      license: value.license,
      delaySeconds: value.delaySeconds,
      capabilities: value.sourceCapabilities,
      licenseUrl: value.licenseUrl,
      licenseScope: value.licenseScope,
      externalDisplayAllowed: value.externalDisplayAllowed,
      bodyStorageAllowed: value.bodyStorageAllowed,
      attribution: value.attribution,
      licenseVerifiedAt: value.licenseVerifiedAt,
      officialSource: value.officialSource,
      nativeCadenceSeconds: value.nativeCadenceSeconds,
      minPollIntervalSeconds: value.minPollIntervalSeconds,
      staleAfterSeconds: value.staleAfterSeconds,
      redistributionAllowed: value.redistributionAllowed,
      transformationAllowed: value.transformationAllowed,
      attributionRequired: value.attributionRequired,
      termsVerifiedAt: value.termsVerifiedAt,
      rawRetentionDays: value.rawRetentionDays,
      licenseSnapshotId: value.licenseSnapshotId,
    });
    if (!provenance.success) {
      for (const issue of provenance.error.issues) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
        });
      }
    }
    if (!value.sourceCapabilities.includes(value.kind)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance record kind is outside the source capabilities",
      });
    }
    if (
      !value.bodyStorageAllowed &&
      (value.content.summary !== undefined ||
        value.content.excerpt !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance source policy does not allow body-derived content",
      });
    }
    if (
      !value.bodyStorageAllowed &&
      Object.keys(value.content.attributes).some(isBodyOrMediaAttributeKey)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Finance source policy does not allow body or media attributes",
      });
    }
  });

export type FinanceContent = z.infer<typeof financeContentSchema>;
export type FinanceLicenseScope = z.infer<typeof financeLicenseScopeSchema>;
export type FinancePublisher = z.infer<typeof financePublisherSchema>;
export type FinanceRecordKind = z.infer<typeof financeRecordKindSchema>;
export type FinanceSourceDescriptor = z.infer<
  typeof financeSourceDescriptorSchema
>;
export type FinanceSourceMode = z.infer<typeof financeSourceModeSchema>;
export type FinanceSourceRecord = z.input<typeof financeSourceRecordSchema>;
export type NormalizedFinanceRecord = z.infer<
  typeof normalizedFinanceRecordSchema
>;
