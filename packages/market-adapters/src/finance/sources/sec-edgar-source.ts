import {
  FinanceSourceFetchError,
  type FinanceSourceAdapter,
  type FinanceSourceBatch,
} from "../../ingestion.js";

export type SecEdgarBodyReader = Readonly<{
  read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>>;
  cancel(reason?: unknown): Promise<void>;
}>;

export type SecEdgarResponseBody = Readonly<{
  getReader(): SecEdgarBodyReader;
}>;

export type SecEdgarHttpResponse = Readonly<{
  status: number;
  redirected: boolean;
  url: string;
  headers: Readonly<{ get(name: string): string | null }>;
  body: SecEdgarResponseBody | null;
}>;

export type SecEdgarFetch = (
  url: string,
  init: Readonly<{
    method: "GET";
    redirect: "manual";
    headers: Readonly<Record<string, string>>;
  }>,
) => Promise<SecEdgarHttpResponse>;

export type SecEdgarThrottlePolicy = Readonly<{
  key: "sec-edgar";
  requests: 2;
  perMilliseconds: 1_000;
  burst: 1;
  nowMilliseconds: number;
}>;

export type SecEdgarSourceConfig = Readonly<{
  cik?: string;
  ticker?: string;
  companyTickersFile?: string;
  operatorCompanyName: string;
  monitoringEmail: string;
  maxResponseBytes?: number;
}>;

export type SecEdgarSourceOptions = Readonly<{
  config: SecEdgarSourceConfig;
  fetch: SecEdgarFetch;
  clock: () => number;
  throttle(policy: SecEdgarThrottlePolicy): Promise<void>;
}>;

type SecCik = Readonly<{ archive: string; padded: string }>;

interface SecEdgarCircuitBreaker {
  blockedUntilMilliseconds: number;
}

type FilingTable = Readonly<{
  accessions: readonly string[];
  filingDates: readonly string[];
  reportDates: readonly string[];
  acceptedAt: readonly string[];
  forms: readonly string[];
  primaryDocuments: readonly string[];
}>;

const descriptor: FinanceSourceAdapter["descriptor"] = {
  source: "sec-edgar",
  sourceMode: "real",
  entitlement: "U.S. government public filing metadata",
  license: "SEC.gov public data",
  delaySeconds: 0,
  capabilities: ["filing"],
  licenseUrl: "https://www.sec.gov/os/accessing-edgar-data",
  licenseScope: "public-reuse",
  externalDisplayAllowed: true,
  bodyStorageAllowed: false,
  imageStorageAllowed: false,
  redistributionAllowed: false,
  transformationAllowed: true,
  attributionRequired: true,
  attribution: "U.S. Securities and Exchange Commission",
  licenseVerifiedAt: "2026-08-12T00:00:00.000Z",
  termsVerifiedAt: "2026-08-12T00:00:00.000Z",
  licenseSnapshotId: "sec-edgar-public-data-2026-08-12",
  officialSource: true,
  authType: "none",
  market: "us",
  languages: ["en"],
  historyStartAt: "1994-01-01T00:00:00.000Z",
  nativeCadenceSeconds: 1,
  minPollIntervalSeconds: 60,
  staleAfterSeconds: 900,
  documentedRateLimit: { status: "known", requests: 10, perSeconds: 1 },
  configuredRateLimit: { requests: 2, perSeconds: 1 },
  robotsPolicy: "not-applicable",
  robotsCheckedAt: null,
  robotsUrl: null,
  transportSecurity: "https",
  transportKind: "origin",
  transportBaseUrl: "https://data.sec.gov/",
  tlsVerification: "required",
  redirectPolicy: "error",
  rawRetentionDays: 0,
};

const allowedForms = new Set(["8-K", "10-Q", "10-K", "20-F", "6-K"]);
const cikPattern = /^\d{1,10}$/u;
const accessionPattern = /^\d{10}-\d{2}-\d{6}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const primaryDocumentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const tickerPattern = /^[A-Z0-9][A-Z0-9.-]{0,15}$/u;
const companyTickersFilePattern = /^company_tickers[A-Za-z0-9_-]*\.json$/u;
const MAX_CURSOR_LENGTH = 2_048;
const DEFAULT_MAX_RESPONSE_BYTES = 5_000_000;
const MAX_RESPONSE_BYTES = 10_000_000;

const policyBlocked = (message: string, cause?: unknown) =>
  new FinanceSourceFetchError(message, {
    classification: "policy-blocked",
    retry: { kind: "never" },
    ...(cause === undefined ? {} : { cause }),
  });

const invalidResponse = (message: string, cause?: unknown) =>
  new FinanceSourceFetchError(message, {
    classification: "invalid-response",
    retry: { kind: "never" },
    ...(cause === undefined ? {} : { cause }),
  });

const retryAfterMilliseconds = (
  value: string | null,
  nowMilliseconds: number,
): number => {
  let requested: number | undefined;
  if (value !== null && /^\d+$/u.test(value)) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds)) requested = seconds * 1_000;
  } else if (value !== null) {
    const at = Date.parse(value);
    if (Number.isFinite(at) && at > nowMilliseconds) {
      requested = at - nowMilliseconds;
    }
  }
  if (requested === undefined || !Number.isSafeInteger(requested)) {
    return 600_000;
  }
  return Math.min(86_400_000, Math.max(600_000, requested));
};

const rateLimited = (
  response: SecEdgarHttpResponse,
  nowMilliseconds: number,
): Readonly<{
  delayMilliseconds: number;
  failure: FinanceSourceFetchError;
}> => {
  const delayMilliseconds = retryAfterMilliseconds(
    response.headers.get("Retry-After"),
    nowMilliseconds,
  );
  return {
    delayMilliseconds,
    failure: new FinanceSourceFetchError("SEC EDGAR rate limited the request", {
      classification: "rate-limited",
      retry: { kind: "after", delayMilliseconds },
    }),
  };
};

const missingResource = () =>
  new FinanceSourceFetchError("SEC EDGAR resource was not found", {
    classification: "upstream-unavailable",
    retry: { kind: "never" },
  });

const transientFailure = (message: string, cause: unknown) =>
  new FinanceSourceFetchError(message, {
    classification: "transient",
    retry: { kind: "backoff" },
    cause,
  });

const clockMilliseconds = (options: SecEdgarSourceOptions): number => {
  let nowMilliseconds: number;
  try {
    nowMilliseconds = options.clock();
  } catch (error) {
    throw transientFailure("SEC EDGAR clock failed", error);
  }
  if (!Number.isSafeInteger(nowMilliseconds) || nowMilliseconds < 0) {
    throw policyBlocked("SEC EDGAR clock violates the source policy");
  }
  return nowMilliseconds;
};

const assertAllowedRequestUrl = (value: string): void => {
  const url = new URL(value);
  const isSubmission =
    url.origin === "https://data.sec.gov" &&
    /^\/submissions\/CIK\d{10}(?:-submissions-\d{3})?\.json$/u.test(
      url.pathname,
    );
  const isTickerIndex =
    url.origin === "https://www.sec.gov" &&
    /^\/files\/company_tickers[A-Za-z0-9_-]*\.json$/u.test(url.pathname);
  if (
    value !== url.href ||
    url.search !== "" ||
    url.hash !== "" ||
    (!isSubmission && !isTickerIndex)
  ) {
    throw policyBlocked("SEC EDGAR request URL violates the source policy");
  }
};

const assertSuccessfulResponse = (
  options: SecEdgarSourceOptions,
  response: SecEdgarHttpResponse,
  requestedUrl: string,
  breaker: SecEdgarCircuitBreaker,
): void => {
  if (response.redirected || response.url !== requestedUrl) {
    throw policyBlocked("SEC EDGAR redirect violates the source policy");
  }
  if (response.status >= 300 && response.status < 400) {
    throw policyBlocked("SEC EDGAR redirect violates the source policy");
  }
  if (response.status === 403 || response.status === 429) {
    const nowMilliseconds = clockMilliseconds(options);
    const limited = rateLimited(response, nowMilliseconds);
    breaker.blockedUntilMilliseconds = Math.max(
      breaker.blockedUntilMilliseconds,
      nowMilliseconds + limited.delayMilliseconds,
    );
    throw limited.failure;
  }
  if (response.status === 404) throw missingResource();
  if (response.status !== 200) {
    throw invalidResponse("SEC EDGAR returned an unsafe HTTP response");
  }
};

const assertCircuitClosed = (
  options: SecEdgarSourceOptions,
  breaker: SecEdgarCircuitBreaker,
): void => {
  const nowMilliseconds = clockMilliseconds(options);
  if (nowMilliseconds >= breaker.blockedUntilMilliseconds) return;
  const remainingMilliseconds = Math.min(
    86_400_000,
    Math.max(60_000, breaker.blockedUntilMilliseconds - nowMilliseconds),
  );
  throw new FinanceSourceFetchError("SEC EDGAR circuit breaker is open", {
    classification: "rate-limited",
    retry: { kind: "after", delayMilliseconds: remainingMilliseconds },
  });
};

const responseLimit = (config: SecEdgarSourceConfig): number => {
  const limit = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESPONSE_BYTES) {
    throw policyBlocked("SEC EDGAR response limit violates the source policy");
  }
  return limit;
};

const readJson = async (
  response: SecEdgarHttpResponse,
  maxResponseBytes: number,
): Promise<unknown> => {
  if (response.body === null) {
    throw invalidResponse("SEC EDGAR returned an empty response body");
  }
  let reader: SecEdgarBodyReader;
  try {
    reader = response.body.getReader();
  } catch (error) {
    throw invalidResponse("SEC EDGAR response body could not be read", error);
  }
  const cancelReader = (): void => {
    try {
      void reader.cancel("SEC EDGAR response rejected").catch(() => undefined);
    } catch {
      // The typed source failure below remains authoritative.
    }
  };
  const contentLength = response.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      cancelReader();
      throw invalidResponse("SEC EDGAR returned an invalid content length");
    }
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > maxResponseBytes
    ) {
      cancelReader();
      throw invalidResponse("SEC EDGAR response exceeds the byte limit");
    }
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let receivedBytes = 0;
  let text = "";
  while (true) {
    let result: Readonly<{ done: boolean; value?: Uint8Array }>;
    try {
      result = await reader.read();
    } catch (error) {
      cancelReader();
      throw invalidResponse("SEC EDGAR response body could not be read", error);
    }
    if (result.done) break;
    if (!(result.value instanceof Uint8Array)) {
      cancelReader();
      throw invalidResponse("SEC EDGAR returned an invalid response chunk");
    }
    receivedBytes += result.value.byteLength;
    if (receivedBytes > maxResponseBytes) {
      cancelReader();
      throw invalidResponse("SEC EDGAR response exceeds the byte limit");
    }
    try {
      text += decoder.decode(result.value, { stream: true });
    } catch (error) {
      cancelReader();
      throw invalidResponse("SEC EDGAR returned invalid UTF-8", error);
    }
  }
  try {
    text += decoder.decode();
  } catch (error) {
    throw invalidResponse("SEC EDGAR returned invalid UTF-8", error);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw invalidResponse("SEC EDGAR returned invalid JSON", error);
  }
};

const requestSec = async (
  options: SecEdgarSourceOptions,
  url: string,
  agent: string,
): Promise<SecEdgarHttpResponse> => {
  assertAllowedRequestUrl(url);
  const nowMilliseconds = clockMilliseconds(options);
  try {
    await options.throttle({
      key: "sec-edgar",
      requests: 2,
      perMilliseconds: 1_000,
      burst: 1,
      nowMilliseconds,
    });
  } catch (error) {
    throw transientFailure("SEC EDGAR throttle failed", error);
  }
  try {
    return await options.fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": agent,
      },
    });
  } catch (error) {
    if (error instanceof FinanceSourceFetchError) throw error;
    throw transientFailure("SEC EDGAR request failed", error);
  }
};

const normalizedCik = (value: unknown): SecCik => {
  if (typeof value !== "string" || !cikPattern.test(value)) {
    throw policyBlocked("SEC EDGAR CIK violates the source policy");
  }
  const archive = value.replace(/^0+/u, "");
  if (archive === "") {
    throw policyBlocked("SEC EDGAR CIK violates the source policy");
  }
  return { archive, padded: archive.padStart(10, "0") };
};

const userAgent = (config: SecEdgarSourceConfig): string => {
  const company = config.operatorCompanyName;
  const email = config.monitoringEmail;
  if (
    typeof company !== "string" ||
    company.length < 2 ||
    company.length > 120 ||
    company.trim() !== company ||
    /\p{Cc}/u.test(company) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
    /\p{Cc}/u.test(email)
  ) {
    throw policyBlocked(
      "SEC EDGAR requests require an operator company and monitoring email",
    );
  }
  return `${company} ${email}`;
};

const objectRecord = (value: unknown): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse("SEC EDGAR returned an invalid JSON object");
  }
  return value as Readonly<Record<string, unknown>>;
};

const stringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw invalidResponse(`SEC EDGAR returned an invalid ${field} field`);
  }
  return [...value] as string[];
};

const canonicalTimestamp = (value: string): string => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    )
  ) {
    throw invalidResponse("SEC EDGAR returned an invalid acceptance timestamp");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw invalidResponse("SEC EDGAR returned an invalid acceptance timestamp");
  }
  return new Date(milliseconds).toISOString();
};

const validateDate = (value: string, field: string): void => {
  if (!datePattern.test(value)) {
    throw invalidResponse(`SEC EDGAR returned an invalid ${field} date`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== value
  ) {
    throw invalidResponse(`SEC EDGAR returned an invalid ${field} date`);
  }
};

const validateIssuerName = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 450 ||
    value.trim() !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw invalidResponse("SEC EDGAR returned an invalid issuer name");
  }
  return value;
};

const validateSymbols = (value: unknown): string[] => {
  const symbols = stringArray(value, "tickers");
  if (
    symbols.length > 64 ||
    new Set(symbols).size !== symbols.length ||
    symbols.some(
      (symbol) =>
        symbol.length < 1 ||
        symbol.length > 64 ||
        symbol.trim() !== symbol ||
        /\p{Cc}/u.test(symbol),
    )
  ) {
    throw invalidResponse("SEC EDGAR returned invalid ticker metadata");
  }
  return symbols;
};

const historyFilePattern = (cik: SecCik): RegExp =>
  new RegExp(`^CIK${cik.padded}-submissions-\\d{3}\\.json$`, "u");

const parseHistoryCursor = (value: string, cik: SecCik): string[] => {
  const files = value.split(":");
  const pattern = historyFilePattern(cik);
  if (
    value.length > MAX_CURSOR_LENGTH ||
    files.some((file) => !pattern.test(file)) ||
    new Set(files).size !== files.length
  ) {
    throw policyBlocked("SEC EDGAR historical cursor violates the path policy");
  }
  return files;
};

const parseFilingTable = (value: unknown): FilingTable => {
  const root = objectRecord(value);
  const accessions = stringArray(root.accessionNumber, "accessionNumber");
  const filingDates = stringArray(root.filingDate, "filingDate");
  const reportDates = stringArray(root.reportDate, "reportDate");
  const acceptedAt = stringArray(root.acceptanceDateTime, "acceptanceDateTime");
  const forms = stringArray(root.form, "form");
  const primaryDocuments = stringArray(root.primaryDocument, "primaryDocument");
  const lengths = [
    accessions.length,
    filingDates.length,
    reportDates.length,
    acceptedAt.length,
    forms.length,
    primaryDocuments.length,
  ];
  if (
    accessions.length > 1_000 ||
    lengths.some((length) => length !== accessions.length)
  ) {
    throw invalidResponse("SEC EDGAR returned misaligned filing metadata");
  }
  return {
    accessions,
    filingDates,
    reportDates,
    acceptedAt,
    forms,
    primaryDocuments,
  };
};

const filingRecords = (
  table: FilingTable,
  cik: SecCik,
  issuerLabel: string,
  symbols: readonly string[],
): FinanceSourceBatch["records"] => {
  const records: FinanceSourceBatch["records"][number][] = [];
  const identities = new Set<string>();
  for (let index = 0; index < table.accessions.length; index += 1) {
    const accession = table.accessions[index] as string;
    const form = table.forms[index] as string;
    if (form === "" || form.trim() !== form || /\p{Cc}/u.test(form)) {
      throw invalidResponse("SEC EDGAR returned an empty filing form");
    }
    if (!allowedForms.has(form)) continue;
    const filingDate = table.filingDates[index] as string;
    const reportDate = table.reportDates[index] as string;
    const primaryDocument = table.primaryDocuments[index] as string;
    if (
      !accessionPattern.test(accession) ||
      !primaryDocumentPattern.test(primaryDocument)
    ) {
      throw invalidResponse("SEC EDGAR returned unsafe filing metadata");
    }
    validateDate(filingDate, "filing");
    validateDate(reportDate, "report");
    if (identities.has(accession)) {
      throw invalidResponse("SEC EDGAR returned duplicate filing metadata");
    }
    identities.add(accession);
    records.push({
      sourceRecordId: accession,
      kind: "filing",
      sourceUrl: `https://www.sec.gov/Archives/edgar/data/${cik.archive}/${accession.replaceAll("-", "")}/${primaryDocument}`,
      publishedAt: canonicalTimestamp(table.acceptedAt[index] as string),
      publisher: {
        name: "U.S. Securities and Exchange Commission",
        identifier: "sec-edgar",
        url: "https://www.sec.gov/",
      },
      content: {
        title: `${issuerLabel} filed Form ${form}`,
        language: "en",
        symbols: [...symbols],
        topics: ["sec-filing", form.toLowerCase()],
        attributes: {
          accessionNumber: accession,
          cik: cik.padded,
          formType: form,
          reportingPeriod: reportDate,
        },
      },
    });
  }
  return records;
};

const parseCurrentSubmissions = (
  value: unknown,
  cik: SecCik,
): FinanceSourceBatch => {
  const root = objectRecord(value);
  if (`${root.cik ?? ""}`.replace(/^0+/u, "") !== cik.archive) {
    throw invalidResponse("SEC EDGAR returned a mismatched issuer CIK");
  }
  const issuerName = validateIssuerName(root.name);
  const symbols = validateSymbols(root.tickers);
  const filings = objectRecord(root.filings);
  const records = filingRecords(
    parseFilingTable(filings.recent),
    cik,
    issuerName,
    symbols,
  );

  if (!Array.isArray(filings.files)) {
    throw invalidResponse("SEC EDGAR returned invalid historical metadata");
  }
  const historyNames = filings.files.map((history) => {
    const candidate = objectRecord(history).name;
    if (
      typeof candidate !== "string" ||
      !historyFilePattern(cik).test(candidate)
    ) {
      throw invalidResponse("SEC EDGAR returned an unsafe historical path");
    }
    return candidate;
  });
  if (new Set(historyNames).size !== historyNames.length) {
    throw invalidResponse("SEC EDGAR returned duplicate historical paths");
  }
  const nextCursor =
    historyNames.length === 0 ? undefined : historyNames.join(":");
  if (nextCursor !== undefined && nextCursor.length > MAX_CURSOR_LENGTH) {
    throw invalidResponse("SEC EDGAR historical cursor exceeds the byte limit");
  }

  return {
    records,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
};

const parseHistoricalSubmissions = (
  value: unknown,
  cik: SecCik,
): FinanceSourceBatch => {
  return {
    records: filingRecords(
      parseFilingTable(value),
      cik,
      `CIK ${cik.padded}`,
      [],
    ),
  };
};

const parseTickerIndex = (value: unknown, ticker: string): string => {
  const root = objectRecord(value);
  let rawCik: unknown;
  if (Array.isArray(root.fields) && Array.isArray(root.data)) {
    const fields = root.fields;
    if (fields.some((field) => typeof field !== "string")) {
      throw invalidResponse("SEC EDGAR returned invalid company ticker fields");
    }
    const cikIndex = fields.indexOf("cik");
    const tickerIndex = fields.indexOf("ticker");
    if (cikIndex < 0 || tickerIndex < 0) {
      throw invalidResponse("SEC EDGAR company ticker fields are incomplete");
    }
    const matches = root.data.filter(
      (row) => Array.isArray(row) && row[tickerIndex] === ticker,
    );
    if (matches.length !== 1) {
      throw invalidResponse("SEC EDGAR ticker did not resolve to one issuer");
    }
    rawCik = (matches[0] as readonly unknown[])[cikIndex];
  } else {
    const matches = Object.values(root).filter(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        (entry as Readonly<Record<string, unknown>>).ticker === ticker,
    );
    if (matches.length !== 1) {
      throw invalidResponse("SEC EDGAR ticker did not resolve to one issuer");
    }
    rawCik = (matches[0] as Readonly<Record<string, unknown>>).cik_str;
  }
  const cik =
    typeof rawCik === "number" && Number.isSafeInteger(rawCik)
      ? `${rawCik}`
      : rawCik;
  if (typeof cik !== "string" || !cikPattern.test(cik) || /^0+$/u.test(cik)) {
    throw invalidResponse("SEC EDGAR returned an invalid company ticker CIK");
  }
  return cik;
};

export const createSecEdgarSource = (
  options: SecEdgarSourceOptions,
): FinanceSourceAdapter => {
  const breaker: SecEdgarCircuitBreaker = { blockedUntilMilliseconds: 0 };
  return {
    descriptor,
    fetch: async (input) => {
      assertCircuitClosed(options, breaker);
      const agent = userAgent(options.config);
      const maxResponseBytes = responseLimit(options.config);
      const configuredCik = options.config.cik;
      const configuredTicker = options.config.ticker;
      if (
        (configuredCik === undefined && configuredTicker === undefined) ||
        (configuredCik !== undefined && configuredTicker !== undefined)
      ) {
        throw policyBlocked("SEC EDGAR requires exactly one issuer identifier");
      }
      let cikValue = configuredCik;
      if (configuredTicker !== undefined) {
        if (!tickerPattern.test(configuredTicker)) {
          throw policyBlocked("SEC EDGAR ticker violates the source policy");
        }
        const companyTickersFile =
          options.config.companyTickersFile ?? "company_tickers.json";
        if (!companyTickersFilePattern.test(companyTickersFile)) {
          throw policyBlocked(
            "SEC EDGAR company ticker file violates the path policy",
          );
        }
        const tickerUrl = `https://www.sec.gov/files/${companyTickersFile}`;
        const tickerResponse = await requestSec(options, tickerUrl, agent);
        assertSuccessfulResponse(options, tickerResponse, tickerUrl, breaker);
        const tickerIndex = await readJson(tickerResponse, maxResponseBytes);
        cikValue = parseTickerIndex(tickerIndex, configuredTicker);
      }
      const cik = normalizedCik(cikValue);
      const cursor = input.cursor;
      const historyFiles =
        cursor === undefined ? [] : parseHistoryCursor(cursor, cik);
      const historyFile = historyFiles[0];
      const url = `https://data.sec.gov/submissions/${
        historyFile ?? `CIK${cik.padded}.json`
      }`;
      const response = await requestSec(options, url, agent);
      assertSuccessfulResponse(options, response, url, breaker);
      const value = await readJson(response, maxResponseBytes);
      if (historyFile === undefined) return parseCurrentSubmissions(value, cik);
      const historical = parseHistoricalSubmissions(value, cik);
      const nextCursor =
        historyFiles.length > 1 ? historyFiles.slice(1).join(":") : undefined;
      return {
        records: historical.records,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      };
    },
  };
};
