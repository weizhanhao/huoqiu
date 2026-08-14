/*
 * 侧栏当前停在哪一项，由地址决定。
 *
 * 此前是各页往壳里传 activePrimary / activeChannel：/markets/rankings 传的是
 * "markets"，于是人明明在涨跌榜，点亮的却是「行情」；而涨跌榜、选股器、基金、
 * ETF、私募、模拟交易、收藏这些干脆一个选中态都没有——传参这件事页面很容易
 * 忘、也很容易传错，错了在界面上只是「高亮在别处」，不报任何错。
 *
 * 地址是唯一不会说谎的来源：用户看到的是哪一页，地址就是哪一条。
 */

/**
 * 在一组导航地址里挑出与当前路径匹配的那一条，取**最长**的匹配。
 *
 * 取最长是关键：/markets 与 /markets/rankings 同时在列时，站在涨跌榜上两条
 * 都算匹配——按先到的算就会点亮「行情」，正是原来那个毛病。
 *
 * 匹配只在路径分隔处成立：/marketsplace 不该点亮 /markets。
 *
 * 只按路径判，不看查询串。消息下的「回复」「@我」这些靠 ?category= 区分，
 * 要区分它们就得用 useSearchParams，而那会让每一个套着本壳的静态页退出
 * 预渲染。它们由父项「消息」点亮即可——比为一个高亮把全站转成动态渲染划算。
 */
export const activeNavHref = (
  current: string,
  hrefs: readonly string[],
): string | null => {
  const path = (current.split("#")[0] ?? "").split("?")[0] ?? "";
  /* 结尾的斜杠不影响是哪一页。 */
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  let best: string | null = null;
  for (const href of hrefs) {
    const target = (href.split("#")[0] ?? "").split("?")[0] ?? "";
    /*
     * 首页要全等。按前缀算的话 "/" 是所有地址的前缀，每一页都会点亮首页。
     */
    const matches =
      target === "/"
        ? normalized === "/"
        : normalized === target || normalized.startsWith(`${target}/`);
    if (!matches) continue;

    if (best === null || target.length > best.length) best = href;
  }
  return best;
};
