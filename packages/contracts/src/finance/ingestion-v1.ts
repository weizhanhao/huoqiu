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

const publicDnsHostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const nonPublicHostnameSuffixes = [
  ".arpa",
  ".corp",
  ".home",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localdomain",
  ".localhost",
  ".onion",
  ".test",
] as const;

const isPublicDnsHostname = (hostname: string): boolean =>
  publicDnsHostnamePattern.test(hostname) &&
  !nonPublicHostnameSuffixes.some((suffix) => hostname.endsWith(suffix));

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
      url.port === "" &&
      url.hash === "" &&
      isPublicDnsHostname(url.hostname) &&
      url.href === value
    );
  }, "Expected a canonical public HTTPS URL on the default port without credentials or fragments");

const rightsLabelSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value));

const cadenceSecondsSchema = z.number().int().min(0).max(604_800);
const pollIntervalSecondsSchema = z.number().int().min(1).max(604_800);
const retentionDaysSchema = z.number().int().min(0).max(3_650);

const languageSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/u);

const shortMetadataTextSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value));

const numericMetadataSchema = z.union([
  z
    .string()
    .min(1)
    .max(128)
    .regex(/^[+-]?(?:\d+\.?\d*|\.\d+)$/u),
  z.number().finite(),
]);

/**
 * P0 records expose a deliberately small metadata projection. This strict
 * object is an allowlist: arbitrary upstream payload, body and media keys can
 * never become normalized attributes through casing, punctuation or nesting.
 */
export const financeMetadataAttributesSchema = z
  .object({
    accessionNumber: shortMetadataTextSchema.optional(),
    cik: shortMetadataTextSchema.optional(),
    country: shortMetadataTextSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .optional(),
    documentType: shortMetadataTextSchema.optional(),
    eventType: shortMetadataTextSchema.optional(),
    exchange: shortMetadataTextSchema.optional(),
    filingType: shortMetadataTextSchema.optional(),
    formType: shortMetadataTextSchema.optional(),
    industry: shortMetadataTextSchema.optional(),
    period: shortMetadataTextSchema.optional(),
    price: numericMetadataSchema.optional(),
    region: shortMetadataTextSchema.optional(),
    reportingPeriod: shortMetadataTextSchema.optional(),
    revenue: numericMetadataSchema.optional(),
    sector: shortMetadataTextSchema.optional(),
    sourceCountry: shortMetadataTextSchema.optional(),
    tone: numericMetadataSchema.optional(),
    unit: shortMetadataTextSchema.optional(),
    value: numericMetadataSchema.optional(),
  })
  .strict();

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

export const financeSourceAuthTypeSchema = z.enum([
  "none",
  "api-key",
  "bearer-token",
  "basic",
  "oauth2",
  "signed-request",
  "other-server-secret",
]);

export const financeSourceMarketSchema = z.enum([
  "global",
  "cn",
  "hk",
  "us",
  "multi",
]);

export const financeRobotsPolicySchema = z.enum([
  "not-applicable",
  "allowed",
  "conditional",
  "disallowed",
  "unknown-blocked",
]);

export const financeTransportSecuritySchema = z.literal("https");

export const financeTransportKindSchema = z.enum(["origin", "gcs-path-style"]);

const financeTransportBaseUrlSchema = httpsUrlSchema.refine((value) => {
  const url = new URL(value);
  return (
    url.search === "" &&
    url.pathname.endsWith("/") &&
    !url.pathname.includes("//")
  );
}, "Finance transport base URL must be a canonical query-free path prefix");

export const financeDocumentedRateLimitSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      requests: z.number().int().min(1).max(1_000_000),
      perSeconds: z.number().int().min(1).max(86_400),
    })
    .strict(),
  z.object({ status: z.literal("unknown") }).strict(),
]);

export const financeConfiguredRateLimitSchema = z
  .object({
    requests: z.number().int().min(1).max(1_000_000),
    perSeconds: z.number().int().min(1).max(86_400),
  })
  .strict();

type RightRule = "required-true" | "required-false" | "configurable";
type RightsMatrixEntry = Readonly<{
  externalDisplayAllowed: RightRule;
  bodyStorageAllowed: RightRule;
  imageStorageAllowed: RightRule;
  redistributionAllowed: RightRule;
  transformationAllowed: RightRule;
  attributionRequired: RightRule;
}>;

const financeRightsMatrix = {
  "public-reuse": {
    externalDisplayAllowed: "required-true",
    bodyStorageAllowed: "configurable",
    imageStorageAllowed: "configurable",
    redistributionAllowed: "configurable",
    transformationAllowed: "configurable",
    attributionRequired: "configurable",
  },
  "open-attribution": {
    externalDisplayAllowed: "required-true",
    bodyStorageAllowed: "configurable",
    imageStorageAllowed: "configurable",
    redistributionAllowed: "configurable",
    transformationAllowed: "configurable",
    attributionRequired: "required-true",
  },
  "metadata-linkout-only": {
    externalDisplayAllowed: "required-true",
    bodyStorageAllowed: "required-false",
    imageStorageAllowed: "required-false",
    redistributionAllowed: "required-false",
    transformationAllowed: "required-false",
    attributionRequired: "required-true",
  },
  "internal-nondisplay": {
    externalDisplayAllowed: "required-false",
    bodyStorageAllowed: "required-false",
    imageStorageAllowed: "required-false",
    redistributionAllowed: "required-false",
    transformationAllowed: "required-false",
    attributionRequired: "required-false",
  },
  "external-display-contract": {
    externalDisplayAllowed: "required-true",
    bodyStorageAllowed: "configurable",
    imageStorageAllowed: "configurable",
    redistributionAllowed: "configurable",
    transformationAllowed: "configurable",
    attributionRequired: "configurable",
  },
  "redistribution-contract": {
    externalDisplayAllowed: "required-true",
    bodyStorageAllowed: "configurable",
    imageStorageAllowed: "configurable",
    redistributionAllowed: "required-true",
    transformationAllowed: "configurable",
    attributionRequired: "configurable",
  },
  "unknown-blocked": {
    externalDisplayAllowed: "required-false",
    bodyStorageAllowed: "required-false",
    imageStorageAllowed: "required-false",
    redistributionAllowed: "required-false",
    transformationAllowed: "required-false",
    attributionRequired: "required-false",
  },
} as const satisfies Record<
  z.infer<typeof financeLicenseScopeSchema>,
  RightsMatrixEntry
>;

const rightMatchesRule = (actual: boolean, rule: RightRule): boolean =>
  rule === "configurable" || actual === (rule === "required-true");

export const financeContentSchema = z
  .object({
    title: z.string().min(1).max(500),
    language: languageSchema,
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
    attributes: financeMetadataAttributesSchema.default({}),
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
    imageStorageAllowed: z.boolean(),
    redistributionAllowed: z.boolean(),
    transformationAllowed: z.boolean(),
    attributionRequired: z.boolean(),
    attribution: z
      .string()
      .min(1)
      .max(300)
      .refine((value) => value.trim() === value && !/\p{Cc}/u.test(value)),
    licenseVerifiedAt: z.string().datetime({ offset: true }),
    termsVerifiedAt: z.string().datetime({ offset: true }),
    licenseSnapshotId: boundedOpaqueIdSchema,
    officialSource: z.boolean(),
    authType: financeSourceAuthTypeSchema,
    market: financeSourceMarketSchema,
    languages: z
      .array(languageSchema)
      .min(1)
      .max(32)
      .refine((value) => new Set(value).size === value.length, {
        message: "Finance source languages must be unique",
      }),
    historyStartAt: z.string().datetime({ offset: true }),
    nativeCadenceSeconds: cadenceSecondsSchema,
    minPollIntervalSeconds: pollIntervalSecondsSchema,
    staleAfterSeconds: cadenceSecondsSchema,
    documentedRateLimit: financeDocumentedRateLimitSchema,
    configuredRateLimit: financeConfiguredRateLimitSchema,
    robotsPolicy: financeRobotsPolicySchema,
    robotsCheckedAt: z.string().datetime({ offset: true }).nullable(),
    robotsUrl: httpsUrlSchema.nullable(),
    transportSecurity: financeTransportSecuritySchema,
    transportKind: financeTransportKindSchema,
    transportBaseUrl: financeTransportBaseUrlSchema,
    tlsVerification: z.literal("required"),
    redirectPolicy: z.literal("error"),
    rawRetentionDays: retentionDaysSchema,
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

    const rights = financeRightsMatrix[value.licenseScope];
    const rightFields = [
      "externalDisplayAllowed",
      "bodyStorageAllowed",
      "imageStorageAllowed",
      "redistributionAllowed",
      "transformationAllowed",
      "attributionRequired",
    ] as const;
    for (const field of rightFields) {
      if (!rightMatchesRule(value[field], rights[field])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Finance license scope ${value.licenseScope} conflicts with ${field}`,
        });
      }
    }

    if (
      value.sourceMode === "real" &&
      (!value.externalDisplayAllowed ||
        value.licenseScope === "internal-nondisplay" ||
        value.licenseScope === "unknown-blocked")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Real source display rights must be verified and allowed",
      });
    }

    if (value.robotsPolicy === "not-applicable") {
      if (value.robotsCheckedAt !== null || value.robotsUrl !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A not-applicable robots policy cannot claim a robots check",
        });
      }
    } else if (value.robotsCheckedAt === null || value.robotsUrl === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance source robots policy requires a checked URL and time",
      });
    }

    if (
      value.sourceMode === "real" &&
      (value.robotsPolicy === "disallowed" ||
        value.robotsPolicy === "unknown-blocked")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance source robots policy blocks public ingestion",
      });
    }

    if (
      value.documentedRateLimit.status === "known" &&
      value.configuredRateLimit.requests *
        value.documentedRateLimit.perSeconds >
        value.documentedRateLimit.requests *
          value.configuredRateLimit.perSeconds
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configured finance rate cannot exceed the documented limit",
      });
    }

    if (value.transportKind === "gcs-path-style") {
      const transportUrl = new URL(value.transportBaseUrl);
      if (
        transportUrl.hostname !== "storage.googleapis.com" ||
        transportUrl.pathname === "/"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "GCS path-style finance transport requires the canonical storage host and a fixed path prefix",
        });
      }
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
    fetchedAt: z.string().datetime({ offset: true }),
    lastSeenAt: z.string().datetime({ offset: true }),
    provenance: financeSourceDescriptorSchema,
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.provenance.capabilities.includes(value.kind)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance record kind is outside the source capabilities",
      });
    }
    if (Date.parse(value.lastSeenAt) < Date.parse(value.fetchedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finance record lastSeenAt cannot precede fetchedAt",
      });
    }
  });

export type FinanceConfiguredRateLimit = z.infer<
  typeof financeConfiguredRateLimitSchema
>;
export type FinanceContent = z.infer<typeof financeContentSchema>;
export type FinanceDocumentedRateLimit = z.infer<
  typeof financeDocumentedRateLimitSchema
>;
export type FinanceLicenseScope = z.infer<typeof financeLicenseScopeSchema>;
export type FinanceMetadataAttributes = z.infer<
  typeof financeMetadataAttributesSchema
>;
export type FinancePublisher = z.infer<typeof financePublisherSchema>;
export type FinanceRecordKind = z.infer<typeof financeRecordKindSchema>;
export type FinanceRobotsPolicy = z.infer<typeof financeRobotsPolicySchema>;
export type FinanceSourceAuthType = z.infer<typeof financeSourceAuthTypeSchema>;
export type FinanceSourceDescriptor = z.infer<
  typeof financeSourceDescriptorSchema
>;
export type FinanceSourceMarket = z.infer<typeof financeSourceMarketSchema>;
export type FinanceSourceMode = z.infer<typeof financeSourceModeSchema>;
export type FinanceSourceRecord = z.input<typeof financeSourceRecordSchema>;
export type FinanceTransportSecurity = z.infer<
  typeof financeTransportSecuritySchema
>;
export type FinanceTransportKind = z.infer<typeof financeTransportKindSchema>;
export type NormalizedFinanceRecord = z.infer<
  typeof normalizedFinanceRecordSchema
>;
