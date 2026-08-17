/*
 * 这里写的是不带扩展名的相对路径，包里别处写的是 "./x.js"。
 *
 * 手机端的打包器（Metro）不认 .js 指向 .ts 的那套 NodeNext 写法：一加上扩展名
 * 就是 "Unable to resolve module ./post-body.js"，而这个错只在 expo export
 * 时才炸——本地 tsc 和 vitest 都能解析，看不出问题。
 */
import { parsePostBody } from "./post-body";

/*
 * 把帖子归到基金 / ETF / 私募频道。
 *
 * 首页那几个频道此前是同一份全量帖子流，只换了空态文案——因为没有归类的依据。
 * 现在有了：发帖器把股票引用写成 $名称(SH513850)$，正文里带着真实代码。
 *
 * 判定一律拿真名单比对，不按号段猜：
 *   - ETF：正文引用的代码在真实 ETF 列表里
 *   - 基金：正文提到真实基金的代码或全名
 *   - 私募：正文提到中基协名单里某家管理人的名称
 *
 * 按「51 开头就是 ETF」这类号段规则猜，会造出一份看着像、实则错的分类，而错在
 * 哪儿没人查得出来——每一条单看都合理。名单来自接口，错了也是上游的事实，
 * 不是我们编的。
 */

/** 正文里被 $…$ 引用到的六位代码，去掉市场前缀、统一小写。 */
export const referencedCodes = (body: string): ReadonlySet<string> => {
  const codes = new Set<string>();
  for (const segment of parsePostBody(body, { accounts: [], topics: [] })) {
    if (segment.kind !== "cashtag") continue;
    /* href 形如 /instruments/sh513850，末段是带市场前缀的代码。 */
    const symbol = segment.href.split("/").pop() ?? "";
    const digits = symbol.replace(/^[a-z]+/iu, "").toLowerCase();
    if (digits.length > 0) codes.add(digits);
  }
  return codes;
};

export type ChannelIndex = Readonly<{
  /** 真实 ETF 列表里的六位代码。 */
  etfCodes: ReadonlySet<string>;
  /** 真实基金的六位代码。 */
  fundCodes: ReadonlySet<string>;
  /** 基金全名。名字比代码更常出现在正文里。 */
  fundNames: readonly string[];
  /** 中基协名单里的私募管理人名称。 */
  privateNames: readonly string[];
}>;

/*
 * 一个字的名字不参与匹配。
 *
 * 名单里偶尔会有极短的名称，拿它去 includes 整篇正文，几乎每篇都会命中——
 * 那样这个频道就等于没筛。
 */
const mentionsAny = (body: string, names: readonly string[]): boolean =>
  names.some((name) => name.length >= 2 && body.includes(name));

const referencesAny = (
  body: string,
  codes: ReadonlySet<string>,
): boolean => {
  for (const code of referencedCodes(body)) {
    if (codes.has(code)) return true;
  }
  return false;
};

export const isEtfPost = (body: string, index: ChannelIndex): boolean =>
  referencesAny(body, index.etfCodes);

export const isFundPost = (body: string, index: ChannelIndex): boolean => {
  if (referencesAny(body, index.fundCodes)) return true;
  /*
   * 场外基金没有站内标的页，引用不成 $…$，只能以代码或名字出现在正文里，
   * 所以这一档额外扫一遍纯文本。ETF 那档不需要——它一定是场内的。
   */
  for (const code of index.fundCodes) {
    if (body.includes(code)) return true;
  }
  return mentionsAny(body, index.fundNames);
};

export const isPrivateFundPost = (body: string, index: ChannelIndex): boolean =>
  mentionsAny(body, index.privateNames);
