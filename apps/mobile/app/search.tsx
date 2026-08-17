import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

import {
  fetchChart,
  fetchHotBoard,
  fetchLiveNews,
  searchInstruments,
  type SearchHit,
} from "../src/api/market-api";
import { SearchScreen as SearchView } from "../src/components/search/search-screen";
import { useRemote } from "../src/hooks/use-remote";
import { createD0BackHandler } from "../src/navigation/back-or-home";

/*
 * 搜索。
 *
 * 这一页此前读 D0 夹具——写死的一份名单，搜什么都只出那几只。现在走真实的
 * 代码表接口。
 *
 * 输入到发请求之间隔 250 毫秒。不隔的话，「贵州茅台」四个字会打出四次请求，
 * 而返回顺序不保证：第二次的结果后到就把第四次的盖掉，屏幕上留下的是打到
 * 两个字时的联想。
 */

const DEBOUNCE_MS = 250;
const SPARKLINE_ROWS = 6;

export default function SearchRoute() {
  const router = useRouter();
  const onBack = createD0BackHandler(router);

  const [query, setQuery] = useState("");
  /*
   * 一份状态里同时记着「搜的是哪个词」和「搜到了什么」。
   *
   * 拆成 results / failure / searching 三份的话，「正在搜」必须在 effect 里
   * 同步置起来，那是一次级联渲染；更要紧的是三份可以不一致——某个分支忘了
   * 关 searching，页面就永远停在「正在搜」。合成一份之后，「还在搜」直接由
   * 「已搜的词 ≠ 当前的词」推出来，不用维护。
   */
  const [settled, setSettled] = useState<
    Readonly<{ failure: string | null; hits: readonly SearchHit[]; query: string }>
  >({ failure: null, hits: [], query: "" });
  const [intraday, setIntraday] = useState<
    ReadonlyMap<string, readonly number[]>
  >(new Map());

  const news = useRemote(fetchLiveNews);
  const hot = useRemote(fetchHotBoard);

  const needle = query.trim();
  const searching = needle.length > 0 && settled.query !== needle;

  useEffect(() => {
    if (needle.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await searchInstruments(needle);
        /*
         * 迟到的响应直接丢掉。
         *
         * 少了这一句，先发的请求后到时会把新结果盖回旧的——用户看着自己
         * 打完的四个字，底下列的是打到第二个字时的联想。
         */
        if (cancelled) return;
        setSettled((previous) =>
          result.kind === "ok"
            ? { failure: null, hits: result.value, query: needle }
            : /* 失败时留着上一批结果：抹掉比留着旧的更让人以为是搜没了。 */
              { failure: result.message, hits: previous.hits, query: needle },
        );
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle]);

  /*
   * 榜单到手后，给前几行各取一条分时。
   *
   * 只取前几行：每行都是一次请求，整榜取完既慢又对上游不客气，而一屏能看到
   * 的本来就这几行。取不到的那行不画图，也不画一条假的平线。
   */
  useEffect(() => {
    const rows = (hot.value ?? []).slice(0, SPARKLINE_ROWS);
    if (rows.length === 0) return;

    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        rows.map(async (row) => {
          const symbol = row.href.split("/").pop() ?? "";
          const series = await fetchChart(symbol, "intraday");
          if (series.kind !== "ok" || series.value.kind !== "line") return null;
          return [
            row.href,
            series.value.points.map((point) => point.price),
          ] as const;
        }),
      );
      if (cancelled) return;
      setIntraday(new Map(loaded.filter((entry) => entry !== null)));
    })();

    return () => {
      cancelled = true;
    };
  }, [hot.value]);

  return (
    <SearchView
      guesses={news.value}
      hot={hot.value}
      hotFailure={hot.failure}
      intraday={intraday}
      onBack={onBack}
      onChangeQuery={setQuery}
      onOpenHot={(href) => {
        const listingId = href.split("/").pop() ?? "";
        if (listingId.length === 0) return;
        router.push({
          params: { listingId },
          pathname: "/instrument/[listingId]",
        });
      }}
      onOpenNews={(item) => {
        void Linking.openURL(item.href);
      }}
      onOpenSymbol={(symbol) => {
        router.push({
          params: { listingId: symbol },
          pathname: "/instrument/[listingId]",
        });
      }}
      onSubmit={() => {
        /*
         * 联想随输入自动出，「搜索」这个按钮只用来收起键盘。再发一次一模一样
         * 的请求，除了多一次上游调用，什么都不会变。
         */
      }}
      query={query}
      results={needle.length === 0 || settled.query === "" ? null : settled.hits}
      resultsFailure={needle.length === 0 ? null : settled.failure}
      searching={searching}
    />
  );
}
