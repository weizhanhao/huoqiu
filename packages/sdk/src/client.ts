import { initClient, type ApiFetcher } from "@ts-rest/core";

import { m1Router } from "@huoqiu/contracts/m1";

export type HuoqiuFetch = typeof globalThis.fetch;

const createFetchAdapter = (fetcher: HuoqiuFetch): ApiFetcher =>
  async function fetchWithInjectedTransport({
    body,
    fetchOptions,
    headers,
    method,
    path,
  }) {
    const response = await fetcher(path, {
      ...fetchOptions,
      ...(body === undefined ? {} : { body }),
      headers,
      method,
    });
    const contentType = response.headers.get("content-type");
    let responseBody: unknown;

    if (contentType?.includes("application/") && contentType.includes("json")) {
      responseBody = await response.json();
    } else if (contentType?.includes("text/")) {
      responseBody = await response.text();
    } else {
      responseBody = await response.blob();
    }

    return {
      body: responseBody,
      headers: response.headers,
      status: response.status,
    };
  };

export const createHuoqiuClient = (
  baseUrl: string,
  fetcher: HuoqiuFetch = globalThis.fetch,
) =>
  initClient(m1Router, {
    api: createFetchAdapter(fetcher),
    baseUrl,
  });
