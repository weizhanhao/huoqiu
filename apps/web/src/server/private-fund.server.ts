/*
 * 私募管理人登记信息，来自中国证券投资基金业协会的公示系统。
 *
 * 这一页此前是六只虚构产品：「青岚成长演示一号 +24.6%」「衡宇中性演示二号
 * 回撤 -6.2%」——管理人、产品、收益率、回撤全是编的。
 *
 * 换成真数据时有一件事必须说清楚：**私募的业绩没有公开来源**。
 * 私募基金面向合格投资者，净值与收益依法不得公开披露，中基协公示的是
 * 登记备案信息，不含任何收益率。所以这一页做的是「登记信息查询」，
 * 不是「业绩排行」——排行做不了真的，就不做，而不是拿估算顶上。
 *
 * 接口的三个坑，我都踩过：
 *   1. `size` 只认 10/20/50/100。我一开始传 3，收到 400，据此判定
 *      「中基协接口不可用」，绕了一大圈才发现是自己传错了；
 *   2. 筛选条件走 POST 的 body，query 里只能有 page 和 size；
 *   3. body 为空字符串时上游回 500，必须是 `{}`。
 */

const ORIGIN = "https://gs.amac.org.cn";
const PATH = "/amac-infodisc/api/pof/manager";
/** 管理人公示详情页，站外。 */
const DISCLOSURE_BASE = `${ORIGIN}/amac-infodisc/res/pof/manager/`;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** 上游允许的分页档位。别的值一律 400。 */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
const DEFAULT_SIZE = 20;

/*
 * 机构类型。取值必须和上游一字不差——它是按字符串精确匹配的，
 * 差一个顿号就筛不出任何东西，而且照常回 200。
 */
export const INVEST_TYPES = [
  "私募证券投资基金管理人",
  "私募股权、创业投资基金管理人",
  "私募资产配置类管理人",
  "其他私募投资基金管理人",
] as const;

export type InvestType = (typeof INVEST_TYPES)[number];

export const isInvestType = (value: string): value is InvestType =>
  (INVEST_TYPES as readonly string[]).includes(value);

export type PrivateFundManager = Readonly<{
  /** 中基协公示详情页地址，站外。 */
  disclosureUrl: string;
  /** 成立时间，YYYY-MM-DD；登记信息里可以为空。 */
  establishedOn: string | null;
  /** 已备案基金数量。 */
  fundCount: number | null;
  investType: string | null;
  /** 法定代表人 / 执行事务合伙人。 */
  legalPerson: string | null;
  memberType: string | null;
  name: string;
  orgForm: string | null;
  province: string | null;
  /** 登记编号，例如 P1000265。 */
  registerNo: string | null;
  /** 登记时间，YYYY-MM-DD。 */
  registeredOn: string | null;
}>;

export type PrivateFundPage = Readonly<{
  managers: readonly PrivateFundManager[];
  page: number;
  /** 符合条件的管理人总数。 */
  total: number;
}>;

export type PrivateFundQuery = Readonly<{
  investType?: string | undefined;
  /** 登记编号、管理人名称或法定代表人姓名。 */
  keyword?: string | undefined;
  page?: number | undefined;
  size?: number | undefined;
}>;

/**
 * 毫秒时间戳 → `YYYY-MM-DD`；不是时间戳就返回 null。
 *
 * 上游把日期编码成 UTC 零点（1245974400000 在中基协自己的详情页上
 * 显示为「成立时间 2009-06-26」，已经照页面核过）。所以按 UTC 取日期，
 * 不按本机时区——服务端跑在哪个时区都得到同一天。
 *
 * 0 也算不是日期：登记信息里成立时间可以为空，显示成 1970-01-01
 * 比留白更糟。
 */
export const toDate = (raw: unknown): string | null => {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;
  return at.toISOString().slice(0, 10);
};

const textOf = (raw: unknown): string | null =>
  typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

const countOf = (raw: unknown): number | null =>
  typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;

const fetchJson = async (url: string, body: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      body,
      headers: {
        "Content-Type": "application/json",
        Referer: `${ORIGIN}/amac-infodisc/res/pof/manager/index.html`,
        "User-Agent": "Mozilla/5.0",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (reader === undefined) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim().length === 0) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 一页登记管理人；上游取不到时返回 null。
 *
 * 「取不到」与「没有匹配」要分开：后者是 total 为 0 的正常一页。
 */
export const loadPrivateFundManagers = async (
  query: PrivateFundQuery,
): Promise<PrivateFundPage | null> => {
  /*
   * 往上取到最近的一档，而不是一律回落到默认值：要 3 条给 10 条，
   * 比要 3 条给 20 条更接近调用方的意思。要 200 条给 100 条封顶。
   */
  const wanted = query.size;
  const size =
    typeof wanted === "number" && Number.isInteger(wanted) && wanted > 0
      ? (PAGE_SIZES.find((allowed) => allowed >= wanted) ??
        PAGE_SIZES[PAGE_SIZES.length - 1])
      : DEFAULT_SIZE;
  const page =
    Number.isInteger(query.page) && (query.page ?? 0) >= 0
      ? (query.page ?? 0)
      : 0;

  /*
   * 筛选条件放 body。放进 query 会被静默忽略：照常回 200、照常回一整页，
   * 只是没筛过——界面上写着「私募证券投资基金管理人」，列的是全部类型。
   */
  const filter: Record<string, string> = {};
  const keyword = textOf(query.keyword);
  if (keyword !== null) filter.keyword = keyword;
  if (query.investType !== undefined && isInvestType(query.investType)) {
    filter.primaryInvestType = query.investType;
  }

  const payload = await fetchJson(
    `${ORIGIN}${PATH}?page=${String(page)}&size=${String(size)}`,
    JSON.stringify(filter),
  );
  if (typeof payload !== "object" || payload === null) return null;

  const content = (payload as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;

  const managers: PrivateFundManager[] = [];
  for (const entry of content) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const name = textOf(row.managerName);
    // 没有名字的一条登记记录，列出来也说明不了任何事。
    if (name === null) continue;

    /*
     * 这里刻意不带 paidInCapital / subscribedCapital。
     * 它们不是金额：上海重阳这两个字段是 1 和 0，而它的实缴资本实际是
     * 23,500 万元（照中基协详情页核过）。当成金额显示出来，全站每一家的
     * 注册资本都会变成「1 万元」，而页面上看不出任何异样。
     */
    managers.push({
      disclosureUrl: `${DISCLOSURE_BASE}${textOf(row.url) ?? ""}`,
      establishedOn: toDate(row.establishDate),
      fundCount: countOf(row.fundCount),
      investType: textOf(row.primaryInvestType),
      legalPerson: textOf(row.artificialPersonName),
      memberType: textOf(row.memberType),
      name,
      orgForm: textOf(row.orgForm),
      province: textOf(row.registerProvince),
      registerNo: textOf(row.registerNo),
      registeredOn: toDate(row.registerDate),
    });
  }

  const total = (payload as Record<string, unknown>).totalElements;
  return {
    managers,
    page,
    total: typeof total === "number" && Number.isFinite(total) ? total : 0,
  };
};
