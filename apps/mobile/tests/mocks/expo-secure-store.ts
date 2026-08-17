/*
 * expo-secure-store 的测试替身。
 *
 * 真身要连 iOS Keychain 的原生模块，Node 里没有——直接 import 会在模块加载
 * 阶段抛「Cannot read properties of undefined (reading 'EventEmitter')」，
 * 报出来的位置和被测的东西毫无关系。
 *
 * 这里用一个进程内 Map 顶替。它只需满足会话层用到的三件事：存得进、读得出、
 * 删得掉。Keychain 的加密语义不在这一层验证——那是设备行为，单元测试证明
 * 不了，装出一副证明了的样子反而更糟。
 */

const store = new Map<string, string>();

export const getItemAsync = async (key: string): Promise<string | null> =>
  store.get(key) ?? null;

export const setItemAsync = async (
  key: string,
  value: string,
): Promise<void> => {
  store.set(key, value);
};

export const deleteItemAsync = async (key: string): Promise<void> => {
  store.delete(key);
};

/** 用例之间要互相隔离：上一条留下的令牌会让下一条「已经登录了」。 */
export const resetSecureStore = (): void => {
  store.clear();
};
