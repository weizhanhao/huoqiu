import { useLocalSearchParams, useRouter } from "expo-router";

import { fetchPublicPosts } from "../../src/api/social-api";
import { TopicScreen } from "../../src/components/topic/topic-screen";
import { useRemote } from "../../src/hooks/use-remote";
import { createD0BackHandler } from "../../src/navigation/back-or-home";

/*
 * 话题页。
 *
 * 正文里的 #话题# 现在是可点的，落到这里。筛选在客户端做——话题没有独立存储，
 * 它就是正文里的一个记号，服务端那条「话题列表」接口也是现扫一遍算出来的。
 */
export default function TopicRoute() {
  const router = useRouter();
  const parameters = useLocalSearchParams<{ tag?: string | string[] }>();
  const raw = Array.isArray(parameters.tag)
    ? parameters.tag[0]
    : parameters.tag;
  const tag = raw ?? "";

  const posts = useRemote(fetchPublicPosts, { refreshOnFocus: true });

  return (
    <TopicScreen
      failure={posts.failure}
      loading={posts.loading}
      onBack={createD0BackHandler(router)}
      onOpenPost={(postId) => {
        router.push({ params: { postId }, pathname: "/post/[postId]" });
      }}
      onRefresh={posts.refresh}
      posts={posts.value}
      tag={tag}
    />
  );
}
