import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/*
 * 设置页顶部那块「当前会话资料 / 当前会话统计」。
 *
 * 它此前显示的是一份写死的身份：「火球演示用户」「@huoqiu_demo」，
 * 动态 12、收藏 38、关注 24。这几个数字跟谁登录了没有关系——真实账号
 * 打开设置页，看到的仍然是这一套，而且没有任何地方说明它是假的
 * （旁边那条说明讲的是「哪些设置已接真实账号」，不是这块资料）。
 *
 * 未登录时正确的做法是承认未登录，而不是拿一个虚构用户顶上。
 */

const loadSettings = async () =>
  import("../../src/features/profile-settings/profile-settings-experience");

const loadProviders = async () =>
  import("../../src/features/profile-settings/profile-session");

describe("the settings page identity block when nobody is signed in", () => {
  it("does not present an invented user as the current session", async () => {
    const { SettingsPageExperience } = await loadSettings();
    const { ProfileSessionProvider } = await loadProviders();

    const markup = renderToStaticMarkup(
      <ProfileSessionProvider>
        <SettingsPageExperience />
      </ProfileSessionProvider>,
    );

    expect(markup).not.toContain("火球演示用户");
    expect(markup).not.toContain("@huoqiu_demo");
  });

  it("does not print invented activity counts", async () => {
    const { SettingsPageExperience } = await loadSettings();
    const { ProfileSessionProvider } = await loadProviders();

    const markup = renderToStaticMarkup(
      <ProfileSessionProvider>
        <SettingsPageExperience />
      </ProfileSessionProvider>,
    );

    /*
     * 未登录时这块要么不出现，要么说「未登录」。无论哪种，都不该出现
     * 那三个写死的数字被当成「你的」动态、收藏与关注。
     */
    const identity =
      /<section[^>]*aria-labelledby="settings-profile-heading"[\s\S]*?<\/section>/u.exec(
        markup,
      )?.[0] ?? "";
    for (const invented of [">12<", ">38<", ">24<"]) {
      expect(identity, invented).not.toContain(invented);
    }
  });
});
