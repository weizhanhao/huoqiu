import { describe, expect, it } from "vitest";

import {
  createSecEdgarSource,
  type SecEdgarHttpResponse,
  type SecEdgarThrottlePolicy,
} from "../src/finance/sources/sec-edgar-source.js";
import {
  FinanceSourceFetchError,
  runFinanceIngestion,
} from "../src/ingestion.js";
import { InMemoryFinanceRecordStore } from "../src/testing/in-memory-finance-ingestion.js";

const responseBody = (text: string) => ({
  getReader: () => {
    let delivered = false;
    return {
      read: () => {
        if (delivered) return Promise.resolve({ done: true as const });
        delivered = true;
        return Promise.resolve({
          done: false as const,
          value: new TextEncoder().encode(text),
        });
      },
      cancel: () => Promise.resolve(),
    };
  },
});

const jsonResponse = (
  body: unknown,
  url = "https://data.sec.gov/submissions/CIK0000320193.json",
): SecEdgarHttpResponse => ({
  status: 200,
  redirected: false,
  url,
  headers: { get: () => null },
  body: responseBody(JSON.stringify(body)),
});

const currentSubmissions = {
  cik: "320193",
  name: "Example Issuer, Inc.",
  tickers: ["EXMPL"],
  filings: {
    recent: {
      accessionNumber: ["0009999999-26-000042"],
      filingDate: ["2026-08-11"],
      reportDate: ["2026-06-30"],
      acceptanceDateTime: ["2026-08-11T20:15:30.000Z"],
      form: ["10-Q"],
      primaryDocument: ["example-20260630.htm"],
    },
    files: [
      {
        name: "CIK0000320193-submissions-001.json",
        filingCount: 1,
        filingFrom: "2025-01-01",
        filingTo: "2025-12-31",
      },
    ],
  },
} as const;

const createSource = (overrides: Record<string, unknown> = {}) => {
  const { config: configOverride, ...optionOverrides } = overrides;
  const requests: Readonly<{
    url: string;
    init: Readonly<Record<string, unknown>>;
  }>[] = [];
  const throttles: SecEdgarThrottlePolicy[] = [];
  const source = createSecEdgarSource({
    config: {
      cik: "320193",
      operatorCompanyName: "Huoqiu Test Monitor",
      monitoringEmail: "sec-monitor@example.org",
      ...((configOverride as Record<string, unknown> | undefined) ?? {}),
    },
    clock: () => 1_786_483_200_000,
    throttle: (policy) => {
      throttles.push(policy);
      return Promise.resolve();
    },
    fetch: (url, init) => {
      requests.push({ url, init });
      return Promise.resolve(jsonResponse(currentSubmissions, url));
    },
    ...optionOverrides,
  });
  return { requests, source, throttles };
};

describe("SEC EDGAR finance source", () => {
  it("declares the approved real public-reuse descriptor", () => {
    const { source } = createSource();

    expect(source.descriptor).toMatchObject({
      source: "sec-edgar",
      sourceMode: "real",
      licenseScope: "public-reuse",
      capabilities: ["filing"],
      officialSource: true,
      authType: "none",
      market: "us",
      languages: ["en"],
      documentedRateLimit: { status: "known", requests: 10, perSeconds: 1 },
      configuredRateLimit: { requests: 2, perSeconds: 1 },
      externalDisplayAllowed: true,
      bodyStorageAllowed: false,
      imageStorageAllowed: false,
      redistributionAllowed: false,
      transformationAllowed: true,
      attributionRequired: true,
      transportSecurity: "https",
      transportKind: "origin",
      transportBaseUrl: "https://data.sec.gov/",
      tlsVerification: "required",
      redirectPolicy: "error",
      rawRetentionDays: 0,
    });
    expect(JSON.stringify(source.descriptor)).not.toContain(
      "sec-monitor@example.org",
    );
  });

  it("fetches current submissions and emits only canonical filing metadata", async () => {
    const { requests, source, throttles } = createSource();

    await expect(source.fetch({})).resolves.toEqual({
      records: [
        {
          sourceRecordId: "0009999999-26-000042",
          kind: "filing",
          sourceUrl:
            "https://www.sec.gov/Archives/edgar/data/320193/000999999926000042/example-20260630.htm",
          publishedAt: "2026-08-11T20:15:30.000Z",
          publisher: {
            name: "U.S. Securities and Exchange Commission",
            identifier: "sec-edgar",
            url: "https://www.sec.gov/",
          },
          content: {
            title: "Example Issuer, Inc. filed Form 10-Q",
            language: "en",
            symbols: ["EXMPL"],
            topics: ["sec-filing", "10-q"],
            attributes: {
              accessionNumber: "0009999999-26-000042",
              cik: "0000320193",
              formType: "10-Q",
              reportingPeriod: "2026-06-30",
            },
          },
        },
      ],
      nextCursor: "CIK0000320193-submissions-001.json",
    });
    expect(requests).toEqual([
      {
        url: "https://data.sec.gov/submissions/CIK0000320193.json",
        init: {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "User-Agent": "Huoqiu Test Monitor sec-monitor@example.org",
          },
        },
      },
    ]);
    expect(throttles).toEqual([
      {
        key: "sec-edgar",
        requests: 2,
        perMilliseconds: 1_000,
        burst: 1,
        nowMilliseconds: 1_786_483_200_000,
      },
    ]);
  });

  it("satisfies the existing ingestion seam with a display-ready filing", async () => {
    const { source } = createSource();

    const result = await runFinanceIngestion(
      source,
      new InMemoryFinanceRecordStore(),
      { clock: () => "2026-08-12T00:00:00.000Z" },
    );

    expect(result).toMatchObject({
      status: "ready",
      source: "sec-edgar",
      sourceMode: "real",
      fetched: 1,
      records: [
        {
          kind: "filing",
          provenance: {
            licenseScope: "public-reuse",
            officialSource: true,
          },
          content: {
            language: "en",
            attributes: {
              accessionNumber: "0009999999-26-000042",
              cik: "0000320193",
              formType: "10-Q",
              reportingPeriod: "2026-06-30",
            },
          },
        },
      ],
    });
  });

  it("fetches a fixed historical submissions cursor and excludes amendments", async () => {
    const requests: string[] = [];
    const { source } = createSource({
      fetch: (url: string) => {
        requests.push(url);
        return Promise.resolve(
          jsonResponse(
            {
              accessionNumber: ["0001111111-25-000001", "0001111111-25-000002"],
              filingDate: ["2025-02-20", "2025-03-01"],
              reportDate: ["2024-12-31", "2024-12-31"],
              acceptanceDateTime: [
                "2025-02-20T19:30:00.000Z",
                "2025-03-01T18:00:00.000Z",
              ],
              form: ["20-F", "20-F/A"],
              primaryDocument: ["annual.htm", "annual-amendment.htm"],
            },
            url,
          ),
        );
      },
    });

    await expect(
      source.fetch({ cursor: "CIK0000320193-submissions-001.json" }),
    ).resolves.toEqual({
      records: [
        {
          sourceRecordId: "0001111111-25-000001",
          kind: "filing",
          sourceUrl:
            "https://www.sec.gov/Archives/edgar/data/320193/000111111125000001/annual.htm",
          publishedAt: "2025-02-20T19:30:00.000Z",
          publisher: {
            name: "U.S. Securities and Exchange Commission",
            identifier: "sec-edgar",
            url: "https://www.sec.gov/",
          },
          content: {
            title: "CIK 0000320193 filed Form 20-F",
            language: "en",
            symbols: [],
            topics: ["sec-filing", "20-f"],
            attributes: {
              accessionNumber: "0001111111-25-000001",
              cik: "0000320193",
              formType: "20-F",
              reportingPeriod: "2024-12-31",
            },
          },
        },
      ],
    });
    expect(requests).toEqual([
      "https://data.sec.gov/submissions/CIK0000320193-submissions-001.json",
    ]);
  });

  it("carries every allowlisted historical file through an opaque cursor queue", async () => {
    const historyOne = "CIK0000320193-submissions-001.json";
    const historyTwo = "CIK0000320193-submissions-002.json";
    const requests: string[] = [];
    const { source } = createSource({
      fetch: (url: string) => {
        requests.push(url);
        if (url.endsWith("CIK0000320193.json")) {
          return Promise.resolve(
            jsonResponse(
              {
                ...currentSubmissions,
                filings: {
                  ...currentSubmissions.filings,
                  files: [{ name: historyOne }, { name: historyTwo }],
                },
              },
              url,
            ),
          );
        }
        return Promise.resolve(
          jsonResponse(
            {
              accessionNumber: [],
              filingDate: [],
              reportDate: [],
              acceptanceDateTime: [],
              form: [],
              primaryDocument: [],
            },
            url,
          ),
        );
      },
    });

    const current = await source.fetch({});
    expect(current.nextCursor).toBe(`${historyOne}:${historyTwo}`);
    if (current.nextCursor === undefined) {
      throw new Error("expected a historical cursor queue");
    }

    const historical = await source.fetch({ cursor: current.nextCursor });
    expect(historical).toEqual({ records: [], nextCursor: historyTwo });
    expect(requests).toEqual([
      "https://data.sec.gov/submissions/CIK0000320193.json",
      `https://data.sec.gov/submissions/${historyOne}`,
    ]);
  });

  it("resolves an issuer through an allowlisted company_tickers file", async () => {
    const requests: string[] = [];
    const throttlePolicies: SecEdgarThrottlePolicy[] = [];
    const source = createSecEdgarSource({
      config: {
        ticker: "EXMPL",
        companyTickersFile: "company_tickers_exchange.json",
        operatorCompanyName: "Huoqiu Test Monitor",
        monitoringEmail: "sec-monitor@example.org",
      },
      clock: () => 1_786_483_200_000,
      throttle: (policy) => {
        throttlePolicies.push(policy);
        return Promise.resolve();
      },
      fetch: (url) => {
        requests.push(url);
        if (url.endsWith("company_tickers_exchange.json")) {
          return Promise.resolve(
            jsonResponse(
              {
                fields: ["cik", "name", "ticker", "exchange"],
                data: [[320193, "Example Issuer, Inc.", "EXMPL", "Nasdaq"]],
              },
              url,
            ),
          );
        }
        return Promise.resolve(jsonResponse(currentSubmissions, url));
      },
    });

    const batch = await source.fetch({});

    expect(batch.records).toHaveLength(1);
    expect(batch.records[0]?.sourceUrl).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000999999926000042/example-20260630.htm",
    );
    expect(requests).toEqual([
      "https://www.sec.gov/files/company_tickers_exchange.json",
      "https://data.sec.gov/submissions/CIK0000320193.json",
    ]);
    expect(throttlePolicies).toHaveLength(2);
    expect(
      throttlePolicies.every(
        ({ requests, burst }) => requests === 2 && burst === 1,
      ),
    ).toBe(true);
  });

  it("uses a valid Retry-After value for a typed 429 failure", async () => {
    let bodyRead = false;
    const { source } = createSource({
      fetch: (url: string) =>
        Promise.resolve({
          status: 429,
          redirected: false,
          url,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "retry-after" ? "900" : null,
          },
          body: {
            getReader: () => {
              bodyRead = true;
              throw new Error("rate-limit body must not be read");
            },
          },
        }),
    });

    const failure = await source.fetch({}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FinanceSourceFetchError);
    expect(failure).toMatchObject({
      classification: "rate-limited",
      retry: { kind: "after", delayMilliseconds: 900_000 },
    });
    expect(bodyRead).toBe(false);
  });

  it("backs off for at least ten minutes when a 403 has no Retry-After", async () => {
    let networkFetches = 0;
    const { source } = createSource({
      fetch: (url: string) => {
        networkFetches += 1;
        return Promise.resolve({
          ...jsonResponse({}, url),
          status: 403,
        });
      },
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      name: "FinanceSourceFetchError",
      classification: "rate-limited",
      retry: { kind: "after", delayMilliseconds: 600_000 },
    });
    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "rate-limited",
    });
    expect(networkFetches).toBe(1);
  });

  it("opens an in-memory breaker for the product backoff window", async () => {
    let nowMilliseconds = 1_786_483_200_000;
    let networkFetches = 0;
    const { source, throttles } = createSource({
      clock: () => nowMilliseconds,
      fetch: (url: string) => {
        networkFetches += 1;
        if (networkFetches === 1) {
          return Promise.resolve({
            status: 429,
            redirected: false,
            url,
            headers: {
              get: (name: string) =>
                name.toLowerCase() === "retry-after" ? "120" : null,
            },
            body: null,
          });
        }
        return Promise.resolve(jsonResponse(currentSubmissions, url));
      },
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "rate-limited",
      retry: { kind: "after", delayMilliseconds: 600_000 },
    });

    nowMilliseconds += 599_999;
    await expect(source.fetch({})).rejects.toMatchObject({
      name: "FinanceSourceFetchError",
      classification: "rate-limited",
    });
    expect(networkFetches).toBe(1);
    expect(throttles).toHaveLength(1);

    nowMilliseconds += 1;
    await expect(source.fetch({})).resolves.toMatchObject({
      records: [{ sourceRecordId: "0009999999-26-000042" }],
    });
    expect(networkFetches).toBe(2);
    expect(throttles).toHaveLength(2);
  });

  it("never retries a missing SEC resource", async () => {
    const { source } = createSource({
      fetch: (url: string) =>
        Promise.resolve({
          ...jsonResponse({}, url),
          status: 404,
        }),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      name: "FinanceSourceFetchError",
      classification: "upstream-unavailable",
      retry: { kind: "never" },
    });
  });

  it.each([
    [404, "upstream-unavailable"],
    [500, "invalid-response"],
  ] as const)(
    "does not open the breaker for HTTP %i",
    async (status, classification) => {
      let networkFetches = 0;
      const { source } = createSource({
        fetch: (url: string) => {
          networkFetches += 1;
          return Promise.resolve(
            networkFetches === 1
              ? { ...jsonResponse({}, url), status }
              : jsonResponse(currentSubmissions, url),
          );
        },
      });

      await expect(source.fetch({})).rejects.toMatchObject({ classification });
      await expect(source.fetch({})).resolves.toMatchObject({
        records: [{ sourceRecordId: "0009999999-26-000042" }],
      });
      expect(networkFetches).toBe(2);
    },
  );

  it("rejects an oversized response before reading its body", async () => {
    let bodyRead = false;
    let bodyCancelled = false;
    const { source } = createSource({
      config: { maxResponseBytes: 16 },
      fetch: (url: string) =>
        Promise.resolve({
          status: 200,
          redirected: false,
          url,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-length" ? "17" : null,
          },
          body: {
            getReader: () => ({
              read: () => {
                bodyRead = true;
                return Promise.resolve({ done: true as const });
              },
              cancel: () => {
                bodyCancelled = true;
                return Promise.resolve();
              },
            }),
          },
        }),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "invalid-response",
      retry: { kind: "never" },
    });
    expect(bodyRead).toBe(false);
    expect(bodyCancelled).toBe(true);
  });

  it("cancels a JSON stream as soon as cumulative bytes exceed the limit", async () => {
    const chunks = [new Uint8Array(800), new Uint8Array(225)];
    let reads = 0;
    let cancels = 0;
    const { source } = createSource({
      config: { maxResponseBytes: 1_024 },
      fetch: (url: string) =>
        Promise.resolve({
          status: 200,
          redirected: false,
          url,
          headers: { get: () => null },
          body: {
            getReader: () => ({
              read: () => {
                const value = chunks[reads];
                reads += 1;
                return Promise.resolve(
                  value === undefined
                    ? { done: true as const }
                    : { done: false as const, value },
                );
              },
              cancel: () => {
                cancels += 1;
                return Promise.resolve();
              },
            }),
          },
        }),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "invalid-response",
      retry: { kind: "never" },
    });
    expect(reads).toBe(2);
    expect(cancels).toBe(1);
  });

  it("fails safely instead of silently dropping an empty filing field", async () => {
    const { source } = createSource({
      fetch: (url: string) =>
        Promise.resolve(
          jsonResponse(
            {
              ...currentSubmissions,
              filings: {
                ...currentSubmissions.filings,
                recent: {
                  ...currentSubmissions.filings.recent,
                  form: [""],
                },
              },
            },
            url,
          ),
        ),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "invalid-response",
      retry: { kind: "never" },
    });
  });

  it("blocks redirects before reading a response outside the fixed URL", async () => {
    let bodyRead = false;
    const { source } = createSource({
      fetch: () =>
        Promise.resolve({
          status: 200,
          redirected: true,
          url: "https://redirected.example.org/submissions.json",
          headers: { get: () => null },
          body: {
            getReader: () => {
              bodyRead = true;
              throw new Error("redirect body must not be read");
            },
          },
        }),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "policy-blocked",
      retry: { kind: "never" },
    });
    expect(bodyRead).toBe(false);
  });

  it("policy-blocks a manual redirect response that was not followed", async () => {
    const { source } = createSource({
      fetch: (url: string) =>
        Promise.resolve({
          ...jsonResponse({}, url),
          status: 302,
        }),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "policy-blocked",
      retry: { kind: "never" },
    });
  });

  it("supports the default company_tickers object format", async () => {
    const requests: string[] = [];
    const source = createSecEdgarSource({
      config: {
        ticker: "EXMPL",
        operatorCompanyName: "Huoqiu Test Monitor",
        monitoringEmail: "sec-monitor@example.org",
      },
      clock: () => 1_786_483_200_000,
      throttle: () => Promise.resolve(),
      fetch: (url) => {
        requests.push(url);
        return Promise.resolve(
          url.endsWith("company_tickers.json")
            ? jsonResponse(
                {
                  "0": {
                    cik_str: 320193,
                    ticker: "EXMPL",
                    title: "Example Issuer, Inc.",
                  },
                },
                url,
              )
            : jsonResponse(currentSubmissions, url),
        );
      },
    });

    await expect(source.fetch({})).resolves.toMatchObject({
      records: [{ sourceRecordId: "0009999999-26-000042" }],
    });
    expect(requests[0]).toBe("https://www.sec.gov/files/company_tickers.json");
  });

  it("wraps a network failure in a sanitized typed error", async () => {
    const { source } = createSource({
      fetch: () => Promise.reject(new Error("socket included secret detail")),
    });

    const failure = await source.fetch({}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FinanceSourceFetchError);
    expect(failure).toMatchObject({
      message: "SEC EDGAR request failed",
      classification: "transient",
      retry: { kind: "backoff" },
    });
  });

  it("emits the complete form allowlist and excludes every amendment", async () => {
    const forms = [
      "8-K",
      "10-Q",
      "10-K",
      "20-F",
      "6-K",
      "8-K/A",
      "10-Q/A",
      "10-K/A",
      "20-F/A",
      "6-K/A",
    ];
    const { source } = createSource({
      fetch: (url: string) =>
        Promise.resolve(
          jsonResponse(
            {
              ...currentSubmissions,
              filings: {
                files: [],
                recent: {
                  accessionNumber: forms.map(
                    (_form, index) =>
                      `0009999999-26-${`${index + 1}`.padStart(6, "0")}`,
                  ),
                  filingDate: forms.map(() => "2026-08-11"),
                  reportDate: forms.map(() => "2026-06-30"),
                  acceptanceDateTime: forms.map(
                    () => "2026-08-11T20:15:30.000Z",
                  ),
                  form: forms,
                  primaryDocument: forms.map(
                    (_form, index) => `filing-${index + 1}.htm`,
                  ),
                },
              },
            },
            url,
          ),
        ),
    });

    const batch = await source.fetch({});

    expect(
      batch.records.map((record) => record.content.attributes?.formType),
    ).toEqual(["8-K", "10-Q", "10-K", "20-F", "6-K"]);
  });

  it.each([
    ["operator company", { operatorCompanyName: undefined }, {}],
    ["monitoring email", { monitoringEmail: undefined }, {}],
    ["CIK", { cik: "320193/../1" }, {}],
    ["historical cursor", {}, { cursor: "../CIK0000320193.json" }],
    [
      "company ticker file",
      {
        cik: undefined,
        ticker: "EXMPL",
        companyTickersFile: "../company_tickers.json",
      },
      {},
    ],
  ] as const)(
    "fails policy-closed before I/O for an unsafe %s",
    async (_label, config, input) => {
      const { requests, source, throttles } = createSource({ config });

      await expect(source.fetch(input)).rejects.toMatchObject({
        classification: "policy-blocked",
        retry: { kind: "never" },
      });
      expect(requests).toEqual([]);
      expect(throttles).toEqual([]);
    },
  );

  it.each([
    ["accession", { accessionNumber: ["0009999999/26/000042"] }],
    ["primary document", { primaryDocument: ["../private.htm"] }],
  ] as const)("rejects an unsafe filing %s path", async (_label, field) => {
    const { source } = createSource({
      fetch: (url: string) =>
        Promise.resolve(
          jsonResponse(
            {
              ...currentSubmissions,
              filings: {
                ...currentSubmissions.filings,
                recent: {
                  ...currentSubmissions.filings.recent,
                  ...field,
                },
              },
            },
            url,
          ),
        ),
    });

    await expect(source.fetch({})).rejects.toMatchObject({
      classification: "invalid-response",
      retry: { kind: "never" },
    });
  });

  it.each([
    ["bad JSON", "{", 100],
    ["actual byte limit", '{"padding":"123456789"}', 8],
  ] as const)(
    "fails safely for %s without a Content-Length hint",
    async (_label, body, maxResponseBytes) => {
      const { source } = createSource({
        config: { maxResponseBytes },
        fetch: (url: string) =>
          Promise.resolve({
            status: 200,
            redirected: false,
            url,
            headers: { get: () => null },
            body: responseBody(body),
          }),
      });

      await expect(source.fetch({})).rejects.toMatchObject({
        classification: "invalid-response",
        retry: { kind: "never" },
      });
    },
  );
});
