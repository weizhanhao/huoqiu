import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { fetchThread, sendDirectMessage } from "../../src/api/social-api";
import { ChatScreen } from "../../src/components/messages/chat-screen";
import { useRemote } from "../../src/hooks/use-remote";
import { createD0BackHandler } from "../../src/navigation/back-or-home";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 一条私信会话。
 *
 * 打开即已读——服务端在这条 GET 里顺手标掉，不需要用户再点一次「标记已读」。
 */
export default function ChatRoute() {
  const router = useRouter();
  const { account, callAs } = useAccountSession();
  const parameters = useLocalSearchParams<{
    name?: string;
    partnerId?: string | string[];
  }>();

  const raw = Array.isArray(parameters.partnerId)
    ? parameters.partnerId[0]
    : parameters.partnerId;
  const partnerId = raw ?? "";

  const thread = useRemote(
    useCallback(
      () => callAs((token) => fetchThread(token, partnerId)),
      [callAs, partnerId],
    ),
    { refreshOnFocus: true },
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  /*
   * 对方的名字优先用地址上带过来的那个。
   *
   * 会话列表里才有 partnerName；从别处直接进来时地址里带一个，省一次请求。
   * 都没有时用 id 顶着，也比一个空标题强。
   */
  const fromParameters =
    typeof parameters.name === "string" && parameters.name.length > 0
      ? parameters.name
      : null;
  const fromThread =
    thread.value?.conversations.find((chat) => chat.partnerId === partnerId)
      ?.partnerName ?? null;
  const partnerName = fromParameters ?? fromThread ?? partnerId;

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    const result = await callAs((token) =>
      sendDirectMessage(token, partnerId, text),
    );
    setSending(false);
    if (result.kind === "ok") {
      /* 先清空再刷新：留着草稿会让人以为没发出去，然后再发一遍。 */
      setDraft("");
      thread.refresh();
    }
    /* 失败时留着草稿——那句话是用户打的，不该由我们丢掉；失败原因由页面顶部显示。 */
  }, [callAs, draft, partnerId, sending, thread]);

  return (
    <ChatScreen
      draft={draft}
      failure={thread.failure}
      meId={account?.id ?? null}
      messages={thread.value?.messages ?? null}
      onBack={createD0BackHandler(router, "/profile")}
      onChangeDraft={setDraft}
      onSubmit={() => {
        void submit();
      }}
      partnerName={partnerName}
      sending={sending}
    />
  );
}
