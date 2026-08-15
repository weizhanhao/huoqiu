import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * 关注流只列关注对象发的内容。
 *
 * 用户的原话是「这个关注只显示关注人发的内容」——此前这一页是热门那整套版面，
 * 点「关注」和点「热门」看到的东西一模一样。
 *
 * 会话取数在这里打桩：要验的是筛选与呈现规则，不是接口。桩必须在被测模块
 * 加载之前装上，所以每条用例各自 resetModules 后动态导入。
 */

type SessionOverrides = Readonly<{
  account?: unknown;
  following?: readonly string[];
  posts?: readonly unknown[];
}>;

const post = (
  id: string,
  authorId: string,
  createdAt: string,
  body: string,
  title?: string,
) => ({
  authorId,
  authorName: `作者${authorId}`,
  body,
  createdAt,
  id,
  likeCount: 0,
  /* 短帖的标题就是正文前 24 个字，与 post-composer.tsx 一致。 */
  title: title ?? body.slice(0, 24),
});

const render = async (overrides: SessionOverrides): Promise<string> => {
  vi.resetModules();
  vi.doMock("../../src/features/account/account-session", () => ({
    useAccountSession: () => ({
      account: { displayName: "我", id: "me" },
      following: [],
      posts: [],
      ...overrides,
    }),
  }));
  const { FollowFeed } = await import(
    "../../src/features/community/follow-feed"
  );
  return renderToStaticMarkup(<FollowFeed />);
};

describe("follow feed", () => {
  it("lists only posts written by people the viewer follows", async () => {
    const markup = await render({
      following: ["alice"],
      posts: [
        post("p1", "alice", "2026-02-01T09:00:00.000Z", "被关注的人写的"),
        post("p2", "bob", "2026-02-02T09:00:00.000Z", "没关注的人写的"),
        post("p3", "me", "2026-02-03T09:00:00.000Z", "我自己写的"),
      ],
    });

    expect(markup).toContain("被关注的人写的");
    /* 没关注的人不该出现——出现了，这个页签就和「热门」没区别。 */
    expect(markup).not.toContain("没关注的人写的");
    /* 自己发的在「我的主页」。 */
    expect(markup).not.toContain("我自己写的");
  });

  it("orders the newest post first", async () => {
    const markup = await render({
      following: ["alice"],
      posts: [
        post("p1", "alice", "2026-02-01T09:00:00.000Z", "旧的一条"),
        post("p2", "alice", "2026-03-01T09:00:00.000Z", "新的一条"),
      ],
    });

    expect(markup.indexOf("新的一条")).toBeLessThan(markup.indexOf("旧的一条"));
  });

  it("does not print a short post's body twice", async () => {
    /*
     * 短帖的标题是正文前 24 个字截出来的，不是作者另写的。照着把两者都印出来，
     * 同一句话会连着出现两遍，第一遍还带着半个词的截断。
     */
    const body = "今天没动仓位，等季报出来再说，现在这个价位不值得追。";
    const markup = await render({
      following: ["alice"],
      posts: [post("p1", "alice", "2026-02-01T09:00:00.000Z", body)],
    });

    expect(markup).toContain(body);
    expect(markup).not.toMatch(/<h3/u);
  });

  it("keeps a long-form title that the author actually wrote", async () => {
    const markup = await render({
      following: ["alice"],
      posts: [
        post(
          "p1",
          "alice",
          "2026-02-01T09:00:00.000Z",
          "正文从这里开始，和标题完全不同。",
          "一份关于估值的长文",
        ),
      ],
    });

    expect(markup).toMatch(/<h3[^>]*>[\s\S]*一份关于估值的长文/u);
  });

  it("tells a signed-out visitor what this page is for", async () => {
    const markup = await render({ account: null });

    expect(markup).toContain("后这里会显示你关注的人发的内容");
    expect(markup).toContain('href="/login"');
  });

  it("distinguishes following nobody from followed people posting nothing", async () => {
    /*
     * 两种空态说法必须不同。合成一句「暂无内容」，刚关注完一个人的用户
     * 会以为关注没生效，回头再点一遍。
     */
    expect(await render({ following: [], posts: [] })).toContain(
      "还没有关注任何人",
    );
    expect(await render({ following: ["alice"], posts: [] })).toContain(
      "你关注的人还没有发过内容",
    );
  });
});
