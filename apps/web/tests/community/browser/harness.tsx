import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import HomePage from "../../../src/app/page";
import { AccountSessionProvider } from "../../../src/features/account/account-session";
import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import {
  CommunityFeed,
  PostDetail,
} from "../../../src/features/community/community-experience";

import "../../../src/app/globals.css";
import "../../../src/app/xueqiu-theme.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the synthetic community browser harness root");
}

/*
 * 关注流要有内容才量得出版式。
 *
 * 这一页渲染的是「你关注的人发了什么」，数据来自 /api/social/me。浏览器
 * 用例跑在 Vite 里，没有后端，于是这一页永远停在「登录后这里会显示……」，
 * 量到的是一句话的高度，不是真正的信息流。
 *
 * 这里只补一件事：让 /api/social/me 有得答。答的形状与真实接口一致
 * （src/app/api/social/me/route.ts），账号、关注列表、帖子都齐；别的请求
 * 一律走原样，外部资源仍然会被用例判为违规。
 */
const SESSION_TOKEN = "harness-session-token";

const followedAuthor = {
  createdAt: "2026-01-04T00:00:00.000Z",
  displayName: "林岸",
  email: "lin@example.com",
  followerCount: 128,
  followingCount: 12,
  id: "acct_followed",
  postCount: 8,
} as const;

const viewer = {
  createdAt: "2026-01-02T00:00:00.000Z",
  displayName: "我",
  email: "me@example.com",
  followerCount: 3,
  followingCount: 1,
  id: "acct_viewer",
  postCount: 1,
} as const;

const meResponse = {
  account: viewer,
  accounts: [viewer, followedAuthor],
  bookmarkedPostIds: [],
  following: [followedAuthor.id],
  likedPostIds: [],
  posts: Array.from({ length: 8 }, (_, index) => ({
    authorId: index === 7 ? viewer.id : followedAuthor.id,
    authorName: index === 7 ? viewer.displayName : followedAuthor.displayName,
    body: `第 ${String(index + 1)} 条关注内容。这里放一段足够长的正文，用来撑出真实的行高与换行，便于量版式与触控目标：仓位、估值、以及为什么现在不动。`,
    createdAt: `2026-02-${String(index + 1).padStart(2, "0")}T09:30:00.000Z`,
    id: `post_follow_${String(index)}`,
    likeCount: index,
    title: `关注内容 ${String(index + 1)}`,
  })),
} as const;

const installSessionStub = () => {
  window.localStorage.setItem("huoqiu.account.token", SESSION_TOKEN);
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : new URL(
            String(input instanceof Request ? input.url : input),
            window.location.origin,
          ).pathname;
    if (url.endsWith("/api/social/me")) {
      return new Response(JSON.stringify(meResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    return original(input, init);
  };
};

const renderHarness = () => {
  const pathname = window.location.pathname;
  if (pathname === "/") {
    installSessionStub();
    createRoot(root).render(
      <>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        {/* 会话上下文平时在根布局里，这个夹具不渲染根布局，得自己带上。 */}
        <AccountSessionProvider>{HomePage()}</AccountSessionProvider>
      </>,
    );
    return;
  }

  const surface =
    pathname === "/community/posts/post_syn_0001" ? (
      <PostDetail />
    ) : (
      <CommunityFeed />
    );

  createRoot(root).render(
    <>
      <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      <DesktopShell>{surface}</DesktopShell>
    </>,
  );
};

renderHarness();
