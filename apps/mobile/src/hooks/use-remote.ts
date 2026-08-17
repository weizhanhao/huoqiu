import { useCallback, useEffect, useState } from "react";

import type { ApiResult } from "../api/request";

/*
 * 取一份远端数据，带加载态、失败原因和下拉刷新。
 *
 * 三个页签各写一遍的话，「失败时要不要清空已有数据」这种判断迟早会在某一处
 * 写反——而写反的表现是：网络抖一下，页面上的东西全没了，用户以为数据丢了。
 */

export type Remote<T> = Readonly<{
  /** 失败原因。null 表示这一轮没有失败。 */
  failure: string | null;
  loading: boolean;
  refresh: () => void;
  /** 首次成功前为 null。失败时保留上一次的成功值。 */
  value: T | null;
}>;

export const useRemote = <T>(load: () => Promise<ApiResult<T>>): Remote<T> => {
  const [value, setValue] = useState<T | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    const result = await load();
    if (result.kind === "ok") {
      setValue(result.value);
      setFailure(null);
    } else {
      /*
       * 失败不清空 value。
       *
       * 把已经看到的行情抹掉、换成一句错误，比留着旧数字更糟：用户会以为
       * 自选清空了、账号出了问题。旧数字配一条「取不到，下拉重试」，
       * 至少他知道自己在看的是什么。
       */
      setFailure(result.message);
    }
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void run();
  }, [run]);

  const refresh = useCallback(() => {
    void run();
  }, [run]);

  return { failure, loading, refresh, value };
};
