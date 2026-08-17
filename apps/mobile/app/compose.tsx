import {
  cashtagToken,
  imageToken,
  insertAtCursor,
  mentionToken,
  topicToken,
} from "@huoqiu/domain/social/post-body";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { searchInstruments, type SearchHit } from "../src/api/market-api";
import { fetchTopics, uploadImage } from "../src/api/social-api";
import {
  ComposeScreen,
  type ComposeMode,
  type ComposePanel,
} from "../src/components/compose/compose-screen";
import { useComingSoon } from "../src/components/system/coming-soon";
import { useRemote } from "../src/hooks/use-remote";
import { pickPhoto } from "../src/lib/pick-photo";
import { useAccountSession } from "../src/session/account-session";

/*
 * 发帖器。
 *
 * 地址上可以带 symbol / name：从个股页的「发讨论」进来时预填一条股票记号——
 * 在哪只票下点的发讨论，就该是在讨论那只票，不该让人再搜一遍。
 */

const DEBOUNCE_MS = 250;

/* 短帖没有作者写的标题，列表那一栏取正文头一段。截多长要和服务端一致。 */
const SHORT_TITLE_LENGTH = 24;

export default function ComposeRoute() {
  const router = useRouter();
  const { show } = useComingSoon();
  const { accounts, callAs, publish } = useAccountSession();
  const parameters = useLocalSearchParams<{ name?: string; symbol?: string }>();

  const topics = useRemote(fetchTopics);

  const [mode, setMode] = useState<ComposeMode>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(() => {
    const { name, symbol } = parameters;
    return typeof symbol === "string" && typeof name === "string"
      ? `${cashtagToken(name, symbol)} `
      : "";
  });
  const [selection, setSelection] = useState({ end: 0, start: 0 });
  const [caret, setCaret] = useState<number | null>(null);
  const [panel, setPanel] = useState<ComposePanel>(null);
  const [cashtagQuery, setCashtagQuery] = useState("");
  const [cashtagSettled, setCashtagSettled] = useState<
    Readonly<{ hits: readonly SearchHit[]; query: string }>
  >({ hits: [], query: "" });
  const [failure, setFailure] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const needle = cashtagQuery.trim();

  useEffect(() => {
    if (needle.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await searchInstruments(needle);
        /* 迟到的响应丢掉，否则先发的后到会把新结果盖回旧的。 */
        if (cancelled) return;
        setCashtagSettled({
          hits: result.kind === "ok" ? result.value : [],
          query: needle,
        });
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle]);

  /*
   * 插入统一走这里。
   *
   * 各按钮各自拼字符串的话，「插到光标处」这条迟早有一个漏成「追加到末尾」——
   * 而那个按钮在句中用时，插出来的东西会跑到文章最后。
   */
  const insert = useCallback(
    (text: string) => {
      const next = insertAtCursor(body, selection.start, selection.end, text);
      setBody(next.value);
      setCaret(next.caret);
      setSelection({ end: next.caret, start: next.caret });
      setPanel(null);
    },
    [body, selection.end, selection.start],
  );

  const attachPhoto = useCallback(async () => {
    setUploading(true);
    const photo = await pickPhoto();
    if (photo.kind === "cancelled") {
      setUploading(false);
      return;
    }
    if (photo.kind === "failed") {
      setUploading(false);
      setFailure(photo.message);
      return;
    }
    const uploaded = await callAs((token) => uploadImage(token, photo.base64));
    setUploading(false);
    if (uploaded.kind !== "ok") {
      setFailure(uploaded.message);
      return;
    }
    setFailure(null);
    /* 图片记号独占一行：夹在句子中间时，正文渲染出来会断得很难看。 */
    insert(`\n${imageToken(uploaded.value)}\n`);
  }, [callAs, insert]);

  const submit = useCallback(async () => {
    if (publishing) return;
    setPublishing(true);
    const finalTitle =
      mode === "longform"
        ? title.trim()
        : body.trim().slice(0, SHORT_TITLE_LENGTH);
    const message = await publish(finalTitle, body.trim());
    setPublishing(false);
    if (message === null) {
      router.back();
      return;
    }
    setFailure(message);
  }, [body, mode, publish, publishing, router, title]);

  return (
    <ComposeScreen
      accounts={accounts}
      body={body}
      caret={caret}
      cashtagQuery={cashtagQuery}
      cashtagResults={
        needle.length === 0 || cashtagSettled.query !== needle
          ? null
          : cashtagSettled.hits
      }
      failure={failure}
      mode={mode}
      onChangeBody={(text) => {
        setBody(text);
        /* 打字之后就别再管光标，否则每敲一个字都会被拽回插入点。 */
        setCaret(null);
      }}
      onChangeCashtagQuery={setCashtagQuery}
      onChangeSelection={(start, end) => {
        setSelection({ end, start });
        setCaret(null);
      }}
      onChangeTitle={setTitle}
      onClose={() => {
        router.back();
      }}
      onOpenPanel={setPanel}
      onPickAccount={(account) => {
        insert(mentionToken(account.displayName));
      }}
      onPickCashtag={(hit) => {
        if (hit.symbol === null) return;
        insert(`${cashtagToken(hit.name, hit.symbol)} `);
      }}
      onPickEmoji={insert}
      onPickImage={() => {
        void attachPhoto();
      }}
      onPickTopic={(topic) => {
        insert(topicToken(topic));
      }}
      onSelectMode={setMode}
      onShowNotice={show}
      onSubmit={() => {
        void submit();
      }}
      panel={panel}
      publishing={publishing}
      title={title}
      topics={topics.value ?? []}
      uploading={uploading}
    />
  );
}
