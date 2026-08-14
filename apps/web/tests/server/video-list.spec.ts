import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_VIDEO_ROWS,
  loadVideos,
  thumbnailNameOf,
  thumbnailUrlOf,
} from "../../src/server/video-list.server";

/*
 * 视频频道。
 *
 * 这一页此前六条全是编的：「圆桌：哪些笔记值得长期保留 · 18620 次播放 ·
 * 5:42」——标题、作者、时长、播放量没有一样是真的，连封面都是本地渐变。
 *
 * 换成东方财富公开视频列表后，有三件事必须钉住：
 *
 *   1. 时间是**北京时间的墙钟字符串**，不带时区。当成 UTC 解析会整体前移
 *      八小时：晚上 21:03 发的视频显示成下午 13:03，看起来完全正常；
 *   2. 封面要经本站转发，浏览器不直连第三方——这是全站的既定做法。
 *      而转发就意味着「拿一个参数去发请求」，图片名必须严格校验，
 *      否则这个接口就成了替人访问任意地址的跳板；
 *   3. 上游没有时长、播放量、作者。页面上不能有这三样——编不出来就不显示。
 *
 * 值是照真实结构改写的合成数据。
 */

const HOST = "https://np-newspic.dfcfw.com/download";

const videoOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  Code: "202608133840710388",
  ColumnName: "热点小视频",
  Img: `${HOST}/D00000000000000000000_w210h154.jpg`,
  ShowTime: "2026-08-13 21:03:16",
  Title: "示例标题：光通信板块午后走强",
  ...overrides,
});

const bodyOf = (list: readonly unknown[], isSuccess = true): string =>
  JSON.stringify({ IsSuccess: isSuccess, List: list, Message: "成功" });

let requested = "";

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    requested = String(input);
    if (body === null) return new Response("", { status: 500 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested = "";
});

describe("the publish time is Beijing wall-clock text", () => {
  it("does not shift an evening video back into the afternoon", async () => {
    stubUpstream(bodyOf([videoOf({ ShowTime: "2026-08-13 21:03:16" })]));

    const page = await loadVideos();

    /*
     * 上游给的是「2026-08-13 21:03:16」，没有时区。用 new Date(...) 在 UTC
     * 机器上解析再格式化，会变成 13:03——一个看不出错的错：时间还是像个
     * 正常时间，只是不对。所以这里根本不做时区换算，原样保留墙钟。
     */
    expect(page?.videos[0]?.publishedAt).toBe("2026-08-13 21:03");
  });

  it("leaves a malformed time out rather than inventing one", async () => {
    stubUpstream(bodyOf([videoOf({ ShowTime: "" })]));

    const page = await loadVideos();

    expect(page?.videos[0]?.publishedAt).toBeNull();
  });
});

describe("thumbnails only ever come from the one known place", () => {
  it("keeps just the file name of a genuine cover", () => {
    expect(thumbnailNameOf(`${HOST}/D25563694721722912757_w210h154.jpg`)).toBe(
      "D25563694721722912757_w210h154.jpg",
    );
  });

  it("refuses anything that is not that host and shape", () => {
    /*
     * 封面走本站转发，所以「图片名」这个参数最终会变成一次服务端请求。
     * 不卡死它，这个接口就是一个替人访问任意地址的跳板：内网地址、
     * 云元数据服务、别的站点——而调用方只需要改一个查询参数。
     */
    for (const hostile of [
      "http://169.254.169.254/latest/meta-data/",
      "https://evil.example.com/download/a_w210h154.jpg",
      /*
       * 这三条专门打「用字符串包含判断来源」的写法：正主的域名原样出现在
       * 串里，只是不在主机位上。startsWith / includes 全都会放行。
       */
      `https://evil.example.com/?x=${HOST}/a_w210h154.jpg`,
      `https://evil.example.com${HOST.slice("https://".length)}/a.jpg`,
      "https://np-newspic.dfcfw.com.evil.example.com/download/a.jpg",
      `${HOST}/../../etc/passwd`,
      `${HOST}/..%2f..%2fetc%2fpasswd`,
      `${HOST}/a.jpg?next=http://evil.example.com`,
      `${HOST}/a.svg`,
      `${HOST}/`,
      "",
      null,
    ]) {
      expect(thumbnailNameOf(hostile), String(hostile)).toBeNull();
    }
  });

  it("rebuilds the upstream address only from an accepted name", () => {
    expect(thumbnailUrlOf("D25563694721722912757_w210h154.jpg")).toBe(
      `${HOST}/D25563694721722912757_w210h154.jpg`,
    );
    // 反向也要卡住：转发路由拿到的名字同样要过这一关。
    expect(thumbnailUrlOf("../../etc/passwd")).toBeNull();
    expect(thumbnailUrlOf("a.jpg?x=1")).toBeNull();
    expect(thumbnailUrlOf("http://evil.example.com/a.jpg")).toBeNull();
  });
});

describe("loading the video list", () => {
  it("links each video to the page that actually plays it", async () => {
    stubUpstream(bodyOf([videoOf({ Code: "202608133840710388" })]));

    const page = await loadVideos();

    // 列表页给的 /news/1<栏目>,<编号>.html 会 302 到这个地址，直接用终点。
    expect(page?.videos[0]?.href).toBe(
      "https://finance.eastmoney.com/a/202608133840710388.html",
    );
  });

  it("drops an entry with no code to link to", async () => {
    stubUpstream(bodyOf([videoOf(), videoOf({ Code: "" })]));

    const page = await loadVideos();

    // 一条点不开的视频，列出来只会浪费一次点击。
    expect(page?.videos).toHaveLength(1);
  });

  it("carries the column the source itself assigned", async () => {
    stubUpstream(
      bodyOf([
        videoOf({ ColumnName: "财富大咖秀" }),
        videoOf({ Code: "202608123839422886", ColumnName: "投教动画" }),
      ]),
    );

    const page = await loadVideos();

    // 栏目是上游给的四个真实栏目之一，不是我按内容猜的分类。
    expect(page?.videos.map((video) => video.column)).toEqual([
      "财富大咖秀",
      "投教动画",
    ]);
  });

  it("never reports a duration, a view count or an author", async () => {
    stubUpstream(bodyOf([videoOf()]));

    const page = await loadVideos();

    /*
     * 上游没有这三样。页面此前把它们显示得有鼻子有眼（5:42、1.9 万次播放、
     * 离线影像间），全是编的。取数层不给，页面就编不出来。
     */
    const keys = Object.keys(page?.videos[0] ?? {});
    expect(keys).not.toContain("durationSeconds");
    expect(keys).not.toContain("views");
    expect(keys).not.toContain("authorName");
  });

  it("clamps how many rows a caller can ask for", async () => {
    stubUpstream(bodyOf([videoOf()]));

    await loadVideos(100_000);

    expect(requested).toContain(`pagesize=${String(MAX_VIDEO_ROWS)}`);
  });

  it("returns nothing when upstream fails or says it failed", async () => {
    stubUpstream(null);
    expect(await loadVideos()).toBeNull();

    // IsSuccess 为 false 时 List 可能还在，但那份内容不作数。
    stubUpstream(bodyOf([videoOf()], false));
    expect(await loadVideos()).toBeNull();

    // 空列表会被读成「今天没有视频」，那是另一回事。
    stubUpstream(bodyOf([]));
    expect(await loadVideos()).toBeNull();
  });
});
