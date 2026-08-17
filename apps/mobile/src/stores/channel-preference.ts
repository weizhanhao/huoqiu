import * as SecureStore from "expo-secure-store";

/*
 * 记住用户排好的频道。
 *
 * 频道管理此前只改一个 useState：删掉「私募」「ETF」、把「资讯」加回来，杀掉
 * App 重开，十个频道原样回来——那个管理面板等于白做。
 *
 * 存 SecureStore 而不是另装一个 AsyncStorage：这个工程已经为令牌装了它，为一份
 * 频道顺序再引一个原生依赖不值当。它比 AsyncStorage 慢一点，但这里一次会话只
 * 读一次、改动时才写。
 *
 * 读写都不抛：存不下就是这次记不住，不该让首页打不开。
 */

const KEY = "huoqiu.channels";

export const readChannelOrder = async (): Promise<readonly string[] | null> => {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    /*
     * 逐项校验，不信任存下来的东西。
     *
     * 上一版存的是别的形状、或者被手工改过时，直接当 string[] 用会让首页渲染
     * 出一堆空频道——而那时用户唯一的出路是重装。
     */
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter(
      (entry): entry is string => typeof entry === "string",
    );
    return ids.length === 0 ? null : ids;
  } catch {
    return null;
  }
};

export const writeChannelOrder = async (
  ids: readonly string[],
): Promise<void> => {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(ids));
  } catch {
    /* 存不下就是这次记不住，不影响当前这一屏。 */
  }
};
