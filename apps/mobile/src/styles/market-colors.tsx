import { createContext, useContext, type ReactNode } from "react";

import type { MarketColorMode } from "../api/social-api";
import { signColorFor } from "./market-sign";

/*
 * 涨跌配色跟着账号走。
 *
 * 设置页此前能选「红涨绿跌 / 绿涨红跌」，选完存进服务端、界面打上勾——但没有
 * 任何组件读这个值，行情该红还是红。一个存了库、界面确认过、却不生效的开关，
 * 比没有这个开关伤害大：用户会以为没保存上，再选一次，还是不变。
 *
 * 用 context 而不是模块级变量：模块级变量改了不会触发重渲染，切完配色要杀掉
 * App 重进才看得到——那和不生效差不多。
 */

const MarketColorContext = createContext<MarketColorMode>("red-up");

export function MarketColorProvider({
  children,
  mode,
}: Readonly<{ children: ReactNode; mode: MarketColorMode }>) {
  return (
    <MarketColorContext.Provider value={mode}>
      {children}
    </MarketColorContext.Provider>
  );
}

/**
 * 按当前账号的配色给出涨跌色。
 *
 * 返回的是函数而不是颜色，因为一屏上通常要给好几个数字上色。
 */
export const useSignColor = (): ((change: number | null) => string) => {
  const mode = useContext(MarketColorContext);
  return (change) => signColorFor(mode, change);
};
