import Constants from "expo-constants";

/*
 * 接口基址。
 *
 * 网页版可以用相对路径——它和接口是同一个源。手机上不行：App 跑在设备上，
 * 「/api/social/me」对它来说没有任何含义，必须给出完整地址。
 *
 * 取值顺序有意如此：
 *   1. EXPO_PUBLIC_HUOQIU_API —— 临时改指向不必改代码，
 *      指向本机开发服务器时尤其有用。
 *   2. app.json 的 extra.apiBaseUrl —— 随包走的默认值。
 *   3. 兜底常量 —— 前两者都没有时的部署地址。
 *
 * 兜底值是内网地址，这一点必须说清楚：设备连不到这个网段时，拿不到的是
 * 全部数据，而不是某一块。所以取数失败的提示要指向网络，不能说成
 * 「暂无内容」——后者会让人以为是产品空了。
 */

const FALLBACK_BASE_URL = "http://172.29.98.11";

/* 末尾斜杠会拼出「//api/...」，有的网关 301，有的直接 404。 */
const stripTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const readConfiguredBaseUrl = (): string | null => {
  const fromEnvironment = process.env.EXPO_PUBLIC_HUOQIU_API;
  if (typeof fromEnvironment === "string" && fromEnvironment.length > 0) {
    return fromEnvironment;
  }

  const fromManifest = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof fromManifest === "string" && fromManifest.length > 0) {
    return fromManifest;
  }

  return null;
};

export const apiBaseUrl = (): string =>
  stripTrailingSlash(readConfiguredBaseUrl() ?? FALLBACK_BASE_URL);

export const apiUrl = (path: string): string =>
  `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
