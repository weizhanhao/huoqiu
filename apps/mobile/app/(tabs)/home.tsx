import { FollowFeed } from "../../src/components/follow/follow-feed";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 第一个页签就是关注流。
 *
 * 这里原先渲染的是 D0 夹具信息流——写死的「星海智造 SYN001」，跟谁登录、
 * 关注了谁都没关系。现在和网页版一样：进来第一眼是你关注的人写了什么。
 */
export default function HomeScreen() {
  const { account, failure, following, loading, posts, refresh } =
    useAccountSession();

  return (
    <FollowFeed
      failure={failure}
      following={following}
      loading={loading}
      onRefresh={() => {
        void refresh();
      }}
      posts={posts}
      signedIn={account !== null}
    />
  );
}
