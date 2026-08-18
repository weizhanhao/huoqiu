import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AccountForm } from "../../../src/components/settings/account-form";

/*
 * 改密码与改资料。
 *
 * 服务端要求新密码至少 12 位。界面上不当场说的话，用户输完两栏、点保存、等一个
 * 来回，才收到「新密码至少 12 位。」——而这条规则本该在他打字时就说清楚。
 */

const render = (
  overrides: Partial<Parameters<typeof AccountForm>[0]> = {},
): string =>
  renderToStaticMarkup(
    <AccountForm
      bio=""
      currentPassword=""
      displayName="林岸"
      failure={null}
      newPassword=""
      onChangeBio={vi.fn()}
      onChangeCurrentPassword={vi.fn()}
      onChangeDisplayName={vi.fn()}
      onChangeNewPassword={vi.fn()}
      onSavePassword={vi.fn()}
      onSaveProfile={vi.fn()}
      saved={null}
      saving={false}
      {...overrides}
    />,
  );

const disabled = (markup: string, testId: string): boolean => {
  const at = markup.indexOf(`data-testid="${testId}"`);
  expect(at).toBeGreaterThan(-1);
  const tag = markup.slice(
    markup.lastIndexOf("<", at),
    markup.indexOf(">", at),
  );
  return tag.includes('aria-disabled="true"');
};

describe("account form", () => {
  it("says how many characters are still missing", () => {
    const markup = render({ currentPassword: "old", newPassword: "short" });

    expect(markup).toContain("还差 7 位");
    expect(disabled(markup, "save-password")).toBe(true);
  });

  it("enables the change once both fields are usable", () => {
    const markup = render({
      currentPassword: "old-one-is-fine",
      newPassword: "a-long-enough-secret",
    });

    expect(markup).not.toContain("还差");
    expect(disabled(markup, "save-password")).toBe(false);
  });

  it("refuses to save an empty display name", () => {
    /* 昵称清空之后保存，服务端会退回来——而那时用户已经不知道自己叫什么了。 */
    expect(disabled(render({ displayName: "  " }), "save-profile")).toBe(true);
    expect(disabled(render({ displayName: "林岸" }), "save-profile")).toBe(
      false,
    );
  });

  it("shows the result of the last attempt", () => {
    expect(render({ failure: "当前密码不正确。" })).toContain("当前密码不正确");
    expect(render({ saved: "资料已保存。" })).toContain("资料已保存");
  });
});
