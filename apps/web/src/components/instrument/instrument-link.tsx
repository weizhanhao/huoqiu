import Link from "next/link";
import type { ReactNode } from "react";

/*
 * 指向一只股票的链接。
 *
 * 雪球点一只股票是新开一页，原来那页留在原处——用户翻榜单、点开几只、
 * 挨个比较，榜单本身不该被顶掉。站内此前是原页跳转，点一只就丢了上下文，
 * 得按返回键才回得来。
 *
 * 各处榜单此前各写各的 <Link>，新窗口这件事要么漏、要么写法不一。
 * 收在这里之后，「点一只股票会发生什么」只有一个答案。
 *
 * 新窗口对读屏用户尤其要交代：焦点毫无预告地跳进一个新窗口，读屏软件
 * 不会主动播报，人只会发现「返回键怎么按不动了」。所以每条链接都带一句
 * 眼睛看不到、读屏念得到的说明——这是 WCAG 3.2.5 的要求。
 */

/** 沪深六位、港股五位、美股字母代码（点号在站内地址里写成下划线）。 */
const LISTING_PATTERN = /^(?:(?:sh|sz)\d{6}|hk\d{1,5}|us[a-z][a-z0-9_]{0,9})$/iu;

export const isListingSymbol = (symbol: string): boolean =>
  LISTING_PATTERN.test(symbol);

export function InstrumentLink({
  children,
  className,
  symbol,
}: Readonly<{
  children: ReactNode;
  /*
   * CSS Modules 取出来的类名类型是 string | undefined（键可能不存在），
   * 而 exactOptionalPropertyTypes 下 `?: string` 收不了显式的 undefined。
   * 写成联合类型，调用方就不必在每个榜单里各写一次 ?? ""。
   */
  className?: string | undefined;
  symbol: string;
}>) {
  /*
   * 拼接前先认一遍代码。任由调用方把任意字符串塞进地址，得到的是一条
   * 指向 404 的链接——而它和真链接看起来一模一样，要点下去才知道。
   * 认不出来就只渲染文字，不给链接。
   */
  if (!isListingSymbol(symbol)) return <>{children}</>;

  return (
    <Link
      className={className}
      href={`/instruments/${symbol.toLowerCase()}`}
      /*
       * 缺了 noopener，新开的那页能通过 window.opener 反过来改写原页地址。
       * 站内链接也一样：一个存量 XSS 就能借它把用户从行情页推去钓鱼页。
       */
      rel="noopener"
      target="_blank"
    >
      {children}
      <span className="visually-hidden">（新窗口打开）</span>
    </Link>
  );
}
