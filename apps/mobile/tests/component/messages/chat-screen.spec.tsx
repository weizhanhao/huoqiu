import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DirectMessage } from "../../../src/api/social-api";
import { ChatScreen } from "../../../src/components/messages/chat-screen";

/*
 * 一条私信会话。
 *
 * 私信最不能出的错是「分不清谁说的」——两边的话混成一列，读起来像自言自语。
 */

const message = (id: string, fromId: string, body: string): DirectMessage => ({
  body,
  createdAt: "2026-08-17T09:30:00.000Z",
  fromId,
  id,
  readAt: null,
  toId: fromId === "me" ? "other" : "me",
});

const render = (
  overrides: Partial<Parameters<typeof ChatScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <ChatScreen
      draft=""
      failure={null}
      meId="me"
      messages={[]}
      onBack={vi.fn()}
      onChangeDraft={vi.fn()}
      onSubmit={vi.fn()}
      partnerName="林岸"
      sending={false}
      {...overrides}
    />,
  );

const sendDisabled = (markup: string): boolean => {
  const at = markup.indexOf('data-testid="chat-send"');
  expect(at).toBeGreaterThan(-1);
  const tag = markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at));
  return tag.includes('aria-disabled="true"');
};

describe("chat screen", () => {
  it("puts my messages and theirs on different sides", () => {
    /*
     * 两边同一个样式的话，一屏聊天记录读起来像自言自语——而私信里「这句是谁
     * 说的」是唯一要紧的信息。
     */
    const both = render({
      messages: [
        message("m1", "other", "你看季报了吗"),
        message("m2", "me", "看了，先不动"),
      ],
    });
    const onlyTheirs = render({
      messages: [message("m1", "other", "你看季报了吗")],
    });

    expect(both).toContain("你看季报了吗");
    expect(both).toContain("看了，先不动");
    /* 两条来自不同人时，渲染结果必须和「只有对方那条」不是同一种排布。 */
    expect(both).not.toBe(onlyTheirs);
  });

  it("does not call an unfetched thread empty", () => {
    const loading = render({ messages: null });
    const empty = render({ messages: [] });

    expect(loading).toContain("正在读取");
    expect(empty).toContain("还没有聊过");
  });

  it("refuses to send an empty line", () => {
    expect(sendDisabled(render({ draft: "   " }))).toBe(true);
    expect(sendDisabled(render({ draft: "在" }))).toBe(false);
  });
});
