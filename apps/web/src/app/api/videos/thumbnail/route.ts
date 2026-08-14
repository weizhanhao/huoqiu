import { NextResponse } from "next/server";

import { thumbnailUrlOf } from "../../../../server/video-list.server";
import { throttleUpstream } from "../../../../server/upstream-throttle";

/*
 * 视频封面转发。
 *
 * 为什么要转发，而不是让 <img> 直接指向对方的 CDN：全站的既定做法是
 * 浏览器不直连第三方（顶栏搜索那里也是这么写的）。直连等于把每个访客的
 * IP、UA 和正在看哪一页，交给一个我们不控制的域名。
 *
 * 但「拿一个参数去发请求」本身就是个危险动作：参数不卡死，这个接口就是
 * 替人访问任意地址的跳板——内网地址、云元数据服务、别人的站点。
 * 所以地址不是拼出来的，是由 thumbnailUrlOf 从一个严格形状的文件名
 * **重建**出来的，调用方给不了主机名。
 */
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 8_000;
/** 封面图实测不到 20KB，留足余量即可。 */
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request): Promise<NextResponse> {
  // 每次调用都会向站外发一次请求，先过闸。
  const throttled = throttleUpstream(request, "videos-thumbnail");
  if (throttled !== null) return throttled;

  const name = new URL(request.url).searchParams.get("name");
  const upstream = thumbnailUrlOf(name);
  if (upstream === null) {
    return NextResponse.json({ error: "封面地址不正确。" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(upstream, {
      headers: {
        Referer: "https://video.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
      // 不跟跳转：跟了就等于把上面那道主机校验作废。
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      return NextResponse.json({ error: "封面取不到。" }, { status: 502 });
    }

    const type = response.headers.get("content-type") ?? "";
    /*
     * 回来的必须真是图片。否则这个接口就成了「从本站域名下发任意内容」，
     * 而同源的 HTML 或脚本能做的事比一张图多得多。
     */
    if (!type.startsWith("image/") || type.startsWith("image/svg")) {
      return NextResponse.json({ error: "封面取不到。" }, { status: 502 });
    }

    /*
     * 边读边数，超了立刻掐断。
     *
     * 这里原先是 `await response.arrayBuffer()` 再判断长度——那等于先把整个
     * 响应体收进内存，再说「太大了」。上限就没起到上限的作用：真来一个超大
     * 响应，内存已经吃下去了。取数层那两个模块都是流式读的，这里也要一致。
     */
    const reader = response.body?.getReader();
    if (reader === undefined) {
      return NextResponse.json({ error: "封面取不到。" }, { status: 502 });
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "封面过大。" }, { status: 502 });
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);

    return new NextResponse(bytes, {
      headers: {
        // 封面不会变，缓存一天，省下重复的转发。
        "cache-control": "public, max-age=86400",
        "content-length": String(bytes.byteLength),
        "content-type": type,
        // 无论上游怎么说，都不让浏览器把它当别的东西解析。
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "封面取不到。" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
