"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { InstrumentQuote } from "../../server/market-quote.server";
import type { QuoteMetrics } from "../../server/quote-metrics.server";
import type { TickTape } from "../../server/tick-details.server";

/*
 * 个股页上会变的那一整套：报价、指标、五档盘口、成交明细。
 *
 * 一处轮询、一处分发，而不是每块各问各的。看实盘的人盯的是这些数字之间的
 * 关系——委比对着盘口、成交量对着换手。各块分别轮询，屏上就会出现盘口
 * 来自 14:35、委比来自 14:36 的组合：两个数各自都「对」，凑在一起却是错的。
 *
 * 组件在没有这层包裹时（比如测试里单独渲染）读到 null，各自回落到服务端
 * 渲染那一份 props。所以这层是「加上去就会动」，不是「必须有才能用」。
 */

export type LiveSnapshot = Readonly<{
  metrics: QuoteMetrics | null;
  quote: InstrumentQuote | null;
  tape: TickTape | null;
}>;

const LiveContext = createContext<LiveSnapshot | null>(null);

export const useLiveInstrument = (): LiveSnapshot | null =>
  useContext(LiveContext);

/** 多久问一次。分时是分钟级的，再密也没有新东西，只是白压上游。 */
const REFRESH_MS = 30_000;

export function LiveInstrumentProvider({
  children,
  symbol,
}: Readonly<{ children: ReactNode; symbol: string }>) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    const pull = async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/market/instrument-live?symbol=${encodeURIComponent(symbol)}`,
        );
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as LiveSnapshot;
        if (cancelled) return;
        /*
         * 逐块保留：这一轮没取到的那一块维持上一轮的值，而不是清空。
         * 清空会让盘口整片变成「—」，看着像这只票突然停牌了，
         * 而实际上只是这一次没问到。
         */
        setSnapshot((current) => ({
          metrics: data.metrics ?? current?.metrics ?? null,
          quote: data.quote ?? current?.quote ?? null,
          tape: data.tape ?? current?.tape ?? null,
        }));
      } catch {
        /* 这一次没问到，保持原样，下一轮再说。 */
      }
    };

    const timer = setInterval(() => void pull(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  return (
    <LiveContext.Provider value={snapshot}>{children}</LiveContext.Provider>
  );
}
