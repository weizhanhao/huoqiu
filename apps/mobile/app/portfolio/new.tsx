import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

import {
  createPortfolio,
  searchInstruments,
  type SearchHit,
} from "../../src/api/market-api";
import {
  PortfolioComposer,
  type DraftHolding,
} from "../../src/components/markets/portfolio-composer";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 新建组合。
 *
 * 「新建组合」这个按钮此前点了只弹一句「这一块还没做」，而服务端的建组合接口
 * 一直在那儿。
 */

const DEBOUNCE_MS = 250;

export default function NewPortfolioRoute() {
  const router = useRouter();
  const { callAs } = useAccountSession();

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [holdings, setHoldings] = useState<readonly DraftHolding[]>([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<
    Readonly<{
      failure: string | null;
      hits: readonly SearchHit[];
      query: string;
    }>
  >({ failure: null, hits: [], query: "" });
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needle = query.trim();

  useEffect(() => {
    if (needle.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await searchInstruments(needle);
        /* 迟到的响应丢掉：先发的后到会把新结果盖回旧的。 */
        if (cancelled) return;
        /* 失败塞成空数组，面板会说「没有匹配的标的」——那是假话。 */
        setSettled({
          failure: result.kind === "ok" ? null : result.message,
          hits: result.kind === "ok" ? result.value : [],
          query: needle,
        });
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle]);

  const submit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const result = await callAs((token) =>
      createPortfolio(
        token,
        name.trim(),
        summary.trim(),
        holdings.map((holding) => ({
          symbol: holding.symbol,
          weight: Number.parseFloat(holding.weight),
        })),
      ),
    );
    setSaving(false);
    if (result.kind === "ok") {
      router.back();
      return;
    }
    setFailure(result.message);
  }, [callAs, holdings, name, router, saving, summary]);

  return (
    <PortfolioComposer
      failure={failure}
      holdings={holdings}
      name={name}
      onChangeName={setName}
      onChangeQuery={setQuery}
      onChangeSummary={setSummary}
      onChangeWeight={(symbol, weight) => {
        setHoldings((previous) =>
          previous.map((holding) =>
            holding.symbol === symbol ? { ...holding, weight } : holding,
          ),
        );
      }}
      onClose={() => {
        /* 加了十几只票、一项项调好权重，误点一下全没了。 */
        if (name.trim().length === 0 && holdings.length === 0) {
          router.back();
          return;
        }
        Alert.alert("放弃这个组合？", "填的名称和持仓不会保存。", [
          { style: "cancel", text: "继续填" },
          {
            onPress: () => {
              router.back();
            },
            style: "destructive",
            text: "放弃",
          },
        ]);
      }}
      onPick={(hit) => {
        if (hit.symbol === null) return;
        const symbol = hit.symbol;
        setHoldings((previous) =>
          /*
           * 同一只只能加一次——服务端会以「重复出现」整条退回，而那时用户已经
           * 填完了十项，得自己去找是哪一只重了。
           */
          previous.some((holding) => holding.symbol === symbol)
            ? previous
            : [...previous, { name: hit.name, symbol, weight: "" }],
        );
        setPicking(false);
        setQuery("");
      }}
      onRemove={(symbol) => {
        setHoldings((previous) =>
          previous.filter((holding) => holding.symbol !== symbol),
        );
      }}
      onSubmit={() => {
        void submit();
      }}
      onTogglePicker={() => {
        setPicking((previous) => !previous);
      }}
      picking={picking}
      query={query}
      resultsFailure={
        needle.length === 0 || settled.query !== needle ? null : settled.failure
      }
      results={
        needle.length === 0 ||
        settled.query !== needle ||
        settled.failure !== null
          ? null
          : settled.hits
      }
      saving={saving}
      summary={summary}
    />
  );
}
