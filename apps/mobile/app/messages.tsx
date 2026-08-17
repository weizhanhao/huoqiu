import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { fetchNotifications } from "../src/api/social-api";
import {
  MessageScreen,
  type MessageCategory,
} from "../src/components/messages/message-screen";
import { useRemote } from "../src/hooks/use-remote";
import { createD0BackHandler } from "../src/navigation/back-or-home";
import { useAccountSession } from "../src/session/account-session";

/*
 * 消息。
 *
 * 这一页此前渲染的是三条写死的合成消息——不管谁登录看到的都是同样三条，而真人
 * 回复了、关注了，这里什么都没有。现在读 /api/social/notifications：服务端从
 * 真实事件推导，没有单独的「消息表」。
 */
export default function MessagesRoute() {
  const router = useRouter();
  const { account, callAs } = useAccountSession();
  const [category, setCategory] = useState<MessageCategory>("replies");

  const notifications = useRemote(
    useCallback(() => callAs(fetchNotifications), [callAs]),
  );

  return (
    <MessageScreen
      category={category}
      /* 没登录时那句「请先登录」由界面说，不必再顶一条红色的失败提示。 */
      failure={account === null ? null : notifications.failure}
      notifications={account === null ? [] : notifications.value}
      onBack={createD0BackHandler(router, "/profile")}
      onOpen={(entry) => {
        /*
         * 服务端给的是网页版地址（/community/posts/<id>、/users/<id>）。手机上
         * 按最后一段自己拼路由——照原样丢给 router 会跳到一个不存在的页面，
         * 而那时用户以为是这条消息坏了。
         */
        const id = entry.href.split("/").pop() ?? "";
        if (id.length === 0) return;
        if (entry.kind === "follow") {
          router.push({
            params: { accountId: id },
            pathname: "/user/[accountId]",
          });
          return;
        }
        router.push({ params: { postId: id }, pathname: "/post/[postId]" });
      }}
      onSelectCategory={setCategory}
      signedIn={account !== null}
    />
  );
}
