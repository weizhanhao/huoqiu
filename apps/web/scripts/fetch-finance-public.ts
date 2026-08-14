/*
 * 生成真实财经公共快照，填充 /news 与 /7x24。
 *
 * 这两条频道此前整页只有一句「真实财经快照尚未生成」——因为
 * .runtime/finance/ 里从来没有过 public-v1.json。
 *
 * 本脚本不另起炉灶：直接复用仓库里已经通过独立评审的 SEC EDGAR 适配器、
 * 采集运行器和原子快照发布器。许可、限流、重定向与响应大小策略都由那套
 * 代码保证，这里只负责把它们接起来并落盘。
 *
 * 数据源现状（2026-08-13 实测）：
 *   - SEC EDGAR：可用，返回真实申报元数据（美国政府公开数据）
 *   - GDELT：持续返回限流提示文本而非 JSON，本机拿不到
 *   - 国家统计局：403
 * 拿不到的源不会被伪造成「正常」——它们干脆不进快照，页面上如实显示
 * 只有 SEC 一个来源在运行。
 */
import { resolve } from "node:path";
import process from "node:process";

import {
  runFinanceIngestion,
  type FinanceIngestionReadyResult,
  type FinanceIngestionRunResult,
} from "../../../packages/market-adapters/src/ingestion.js";
import {
  AtomicJsonPublicFinanceSnapshotStore,
  createPublicFinanceSnapshot,
} from "../../../packages/market-adapters/src/finance/public-snapshot.js";
import { createSecEdgarSource } from "../../../packages/market-adapters/src/finance/sources/sec-edgar-source.js";
import { InMemoryFinanceRecordStore } from "../../../packages/market-adapters/src/testing/in-memory-finance-ingestion.js";

/*
 * SEC 要求所有自动化请求带上可联系到运营方的 User-Agent，否则会封禁。
 * 这两个值必须由环境变量提供——把某个真实邮箱硬编码进仓库是对那个人的
 * 冒用，填一个假的又违反 SEC 的要求。缺失时直接失败。
 */
const operatorCompanyName = process.env.SEC_EDGAR_OPERATOR;
const monitoringEmail = process.env.SEC_EDGAR_CONTACT_EMAIL;

/*
 * 抓取的发行人，直接给 CIK。
 *
 * 用 ticker 时适配器要先去拉 company_tickers.json 做查表，实测五个 ticker
 * 里有四个在这一步拿到 SOURCE_UNAVAILABLE。CIK 是 SEC 的稳定主键，
 * 直接给就省掉了这次额外往返，也就没有了那个失败点。
 */
/*
 * 发行人清单按板块分散，而不是只堆科技股。
 *
 * 只抓五家科技公司时，资讯页看起来像个科技板块专栏；金融、医药、能源、
 * 零售各放一两家之后，同一个页面才像一个市场的横截面。
 *
 * 每加一家都会摊薄每家的配额（上限 250 条按发行人等额分配），
 * 所以没有无限加下去——十家在覆盖面和单家深度之间是个可接受的点。
 */
const ISSUERS = [
  { cik: "320193", label: "Apple" },
  { cik: "789019", label: "Microsoft" },
  { cik: "1045810", label: "NVIDIA" },
  { cik: "1018724", label: "Amazon" },
  { cik: "1652044", label: "Alphabet" },
  { cik: "19617", label: "JPMorgan Chase" },
  { cik: "78003", label: "Pfizer" },
  { cik: "34088", label: "Exxon Mobil" },
  { cik: "104169", label: "Walmart" },
  { cik: "200406", label: "Johnson & Johnson" },
] as const;

const MAX_RECORDS = 250;

/*
 * 请求间隔。
 *
 * SEC 文档写的是每秒 10 次，但实测按 600ms 连续请求五个发行人时，
 * 后四个全部拿到 SOURCE_UNAVAILABLE——适配器的断路器被触发了。
 * 拉到 1.5 秒后稳定。宁可慢，也不要把「被限流」当成「这家公司没有数据」。
 */
const REQUEST_SPACING_MS = 1_500;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolveTimer) => {
    setTimeout(resolveTimer, milliseconds);
  });

const isReady = (
  result: FinanceIngestionRunResult,
): result is FinanceIngestionReadyResult => result.status === "ready";

const main = async (): Promise<void> => {
  if (
    operatorCompanyName === undefined ||
    operatorCompanyName.trim().length === 0 ||
    monitoringEmail === undefined ||
    monitoringEmail.trim().length === 0
  ) {
    throw new Error(
      "SEC_EDGAR_OPERATOR 与 SEC_EDGAR_CONTACT_EMAIL 必须设置：SEC 要求自动化请求带可联系的 User-Agent",
    );
  }

  const attemptedAt = new Date().toISOString();
  const store = new InMemoryFinanceRecordStore();
  const merged = {
    attempts: 0,
    created: 0,
    duplicates: 0,
    fetched: 0,
    records: [] as unknown[],
    updated: 0,
  };

  let descriptor: ReturnType<typeof createSecEdgarSource>["descriptor"] | null =
    null;
  const failures: string[] = [];

  for (const issuer of ISSUERS) {
    const source = createSecEdgarSource({
      clock: () => Date.now(),
      config: {
        cik: issuer.cik,
        /*
         * 提高响应体上限到适配器允许的最大值。
         *
         * 摩根大通有两万多条申报，submissions 压缩后 4.6MB、解压后超过默认的
         * 5MB 上限，于是整家被判为不可用。那道保护本身是对的（防异常大响应
         * 打爆内存），只是对真实的大型金融机构定得偏紧。
         */
        maxResponseBytes: 10_000_000,
        monitoringEmail,
        operatorCompanyName,
      },
      fetch: globalThis.fetch as never,
      throttle: async () => {
        await sleep(REQUEST_SPACING_MS);
      },
    });
    descriptor ??= source.descriptor;

    const result = await runFinanceIngestion(source, store);
    if (isReady(result)) {
      merged.attempts += result.attempts;
      merged.created += result.created;
      merged.duplicates += result.duplicates;
      merged.fetched += result.fetched;
      merged.updated += result.updated;
      merged.records.push(...result.records);
    } else {
      /*
       * 把真正的原因打出来。
       *
       * failure.code 在 fetch 阶段永远是 SOURCE_UNAVAILABLE——摩根大通那次
       * 真实原因是「历史游标超长」，苹果那次是「申报条数超上限」，显示的
       * 却是同一个码，排障时完全分辨不出来。
       *
       * 运行结果本身被设计为不携带上游细节（ingestion 的测试里有五条断言
       * 守这条，其中一条直接叫 do-not-leak），那是刻意的，不该为了排障去
       * 改它。所以只在失败路径上额外裸调一次 fetch 取回分类——多一次请求，
       * 但只发生在已经失败的时候，而且原始文本止步于这个脚本的日志。
       */
      let detail: string = result.failure.code;
      try {
        await source.fetch({});
      } catch (probe) {
        const classification = (probe as { classification?: unknown })
          .classification;
        if (typeof classification === "string") {
          detail = classification;
        }
      }
      failures.push(`${issuer.label}:${detail}`);
    }
    await sleep(600);
  }

  if (descriptor === null || merged.records.length === 0) {
    throw new Error(
      `NO_REAL_FINANCE_RECORDS ${failures.join(",") || "no records returned"}`,
    );
  }

  /*
   * 快照上限 250 条，按发行人等额分配。
   *
   * 原先是把所有记录按 fetchedAt 全局倒序再截断——而 fetchedAt 约等于
   * 「第几个被抓取」，于是最先抓的那家会被整家截掉。实测苹果的记录一条
   * 都没进快照，用户搜它会一无所获，且没有任何提示说明原因。
   *
   * 现在每家先按自己的时间倒序取等额的一份，剩余容量再轮流补——
   * 每一家都出现在快照里，谁被截断也只是少几条，而不是整家消失。
   */
  const byIssuer = new Map<string, unknown[]>();
  for (const record of merged.records) {
    const key = String(
      (record as { content?: { title?: string } }).content?.title ?? "",
    ).split(" filed")[0];
    byIssuer.set(key, [...(byIssuer.get(key) ?? []), record]);
  }

  const newestFirst = (entries: unknown[]): unknown[] =>
    entries
      .slice()
      .sort((left, right) =>
        String((right as { fetchedAt: string }).fetchedAt).localeCompare(
          String((left as { fetchedAt: string }).fetchedAt),
        ),
      );

  const queues = [...byIssuer.values()].map((entries) => newestFirst(entries));
  const records: unknown[] = [];
  let cursor = 0;
  // 轮流各取一条，直到取满上限或所有发行人都取空。
  while (records.length < MAX_RECORDS && queues.some((queue) => queue.length > 0)) {
    const queue = queues[cursor % queues.length];
    const next = queue?.shift();
    if (next !== undefined) {
      records.push(next);
    }
    cursor += 1;
  }

  const snapshot = createPublicFinanceSnapshot({
    generatedAt: new Date().toISOString(),
    publications: [
      {
        attemptedAt,
        descriptor,
        result: {
          attempts: merged.attempts,
          created: merged.created,
          duplicates: merged.duplicates,
          fetched: merged.fetched,
          records: records as never,
          source: descriptor.source,
          sourceMode: descriptor.sourceMode,
          status: "ready",
          updated: merged.updated,
        } as FinanceIngestionReadyResult,
      },
    ],
  });

  const directory =
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY ??
    resolve(process.cwd(), ".runtime/finance");
  await new AtomicJsonPublicFinanceSnapshotStore({ directory }).publish(
    snapshot,
  );

  process.stdout.write(
    `FINANCE_SNAPSHOT_WRITTEN ${directory}/public-v1.json records=${records.length} failures=${failures.length === 0 ? "none" : failures.join(",")}\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(
    `FINANCE_SNAPSHOT_FAILED ${String(error instanceof Error ? error.message : error)}\n`,
  );
  process.exitCode = 1;
});
