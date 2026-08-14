/*
 * 抓取欧洲央行参考汇率并落成本地快照。
 *
 * 只在服务端运行。浏览器绝不直连第三方（HANDOFF 第 3.2 节），
 * 页面只读这里生成的 .runtime/finance/fx-v1.json。
 *
 * 写法上沿用 market-adapters 的原子发布约定：先写临时文件再 rename，
 * 避免读端读到写了一半的 JSON。
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const API_ORIGIN = "https://api.frankfurter.app";
const BASE = "CNY";
const SYMBOLS = [
  "USD",
  "EUR",
  "JPY",
  "HKD",
  "GBP",
  "AUD",
  "CAD",
  "CHF",
  "SGD",
  "KRW",
];
const REQUEST_TIMEOUT_MS = 15_000;
/** 单次响应体上限，防止异常大响应打爆内存。 */
const MAX_BYTES = 256 * 1024;

const fetchJson = async (path) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      headers: { accept: "application/json" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`FX_HTTP_${response.status}`);
    }
    const text = await response.text();
    if (text.length > MAX_BYTES) {
      throw new Error("FX_RESPONSE_TOO_LARGE");
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
};

const isRateMap = (value) =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );

const main = async () => {
  const query = `?base=${BASE}&symbols=${SYMBOLS.join(",")}`;
  const latest = await fetchJson(`/latest${query}`);
  if (typeof latest?.date !== "string" || !isRateMap(latest?.rates)) {
    throw new Error("FX_LATEST_INVALID");
  }

  // 取上一个发布日做涨跌幅基准。ECB 只在工作日发布，
  // 所以往前多取几天，再挑出严格早于 latest.date 的最后一条。
  const from = new Date(`${latest.date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 10);
  const startDate = from.toISOString().slice(0, 10);
  const series = await fetchJson(`/${startDate}..${latest.date}${query}`);

  const previousDate = Object.keys(series?.rates ?? {})
    .filter((date) => date < latest.date)
    .toSorted()
    .at(-1);
  const previous =
    previousDate !== undefined && isRateMap(series.rates[previousDate])
      ? series.rates[previousDate]
      : {};

  const snapshot = {
    base: BASE,
    date: latest.date,
    fetchedAt: new Date().toISOString(),
    previous,
    previousDate: previousDate ?? null,
    rates: latest.rates,
    source: "European Central Bank reference rates via frankfurter.app",
  };

  const directory =
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY ??
    resolve(process.cwd(), ".runtime/finance");
  await mkdir(directory, { recursive: true });
  const target = resolve(directory, "fx-v1.json");
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);

  /*
   * 同时产出一个纯数据 TS 模块。
   *
   * 右栏组件会被测试 harness 用 vite 打进浏览器运行，那里没有 node:fs，
   * 所以组件树里绝不能出现文件读取。快照以编译期常量的形式进入构建，
   * 既保持「浏览器不直连第三方」，又让组件在任何环境都能渲染。
   */
  const generated = resolve(
    process.cwd(),
    "src/features/real-finance/fx-snapshot.generated.ts",
  );
  await writeFile(
    generated,
    [
      "/* 由 scripts/fetch-fx-rates.mjs 生成，请勿手改。 */",
      "/* 数据来源：欧洲央行参考汇率（frankfurter.app）。 */",
      `export const fxSnapshotData = ${JSON.stringify(snapshot, null, 2)} as const;`,
      "",
    ].join("\n"),
    "utf8",
  );

  process.stdout.write(
    `FX_SNAPSHOT_WRITTEN ${target} date=${snapshot.date} previous=${snapshot.previousDate ?? "none"} pairs=${Object.keys(snapshot.rates).length}\n`,
  );
};

main().catch((error) => {
  process.stderr.write(
    `FX_SNAPSHOT_FAILED ${String(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
