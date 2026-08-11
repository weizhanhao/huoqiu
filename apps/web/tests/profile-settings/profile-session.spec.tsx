import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createProfileSessionState,
  ProfileSessionProvider,
  profileSessionReducer,
  useProfileSession,
} from "../../src/features/profile-settings/profile-session";

function SessionProbe() {
  const { profile, preferences } = useProfileSession();

  return (
    <output>
      {profile.displayName} · {String(preferences.reducedMotion)}
    </output>
  );
}

describe("profile session public actions", () => {
  it("trims and saves a valid display name and bio for this client session", () => {
    const initial = createProfileSessionState();
    const saved = profileSessionReducer(initial, {
      bio: "  只记录可验证的合成市场信息。  ",
      displayName: "  火球观察员  ",
      type: "save-profile",
    });

    expect(saved.profile.displayName).toBe("火球观察员");
    expect(saved.profile.bio).toBe("只记录可验证的合成市场信息。");
    expect(saved.errors).toEqual({});
    expect(saved.status).toBe("资料已更新，仅在本次浏览会话中保留。");
  });

  it("rejects a display name outside the 2–20 character range", () => {
    const initial = createProfileSessionState();
    const tooShort = profileSessionReducer(initial, {
      bio: initial.profile.bio,
      displayName: "火",
      type: "save-profile",
    });
    const tooLong = profileSessionReducer(initial, {
      bio: initial.profile.bio,
      displayName: "二十一个字符的合成演示显示名称不应保存成功",
      type: "save-profile",
    });

    expect(tooShort.errors.displayName).toBe("显示名需要 2–20 个字符。");
    expect(tooLong.errors.displayName).toBe("显示名需要 2–20 个字符。");
    expect(tooShort.profile).toEqual(initial.profile);
    expect(tooLong.profile).toEqual(initial.profile);
  });

  it("allows an empty bio but rejects a bio longer than 80 characters", () => {
    const initial = createProfileSessionState();
    const emptyBio = profileSessionReducer(initial, {
      bio: "   ",
      displayName: initial.profile.displayName,
      type: "save-profile",
    });
    const tooLong = profileSessionReducer(initial, {
      bio: "这是一段用于验证合成简介长度限制的文字。".repeat(5),
      displayName: initial.profile.displayName,
      type: "save-profile",
    });

    expect(emptyBio.profile.bio).toBe("");
    expect(tooLong.errors.bio).toBe("简介最多 80 个字符。");
    expect(tooLong.profile).toEqual(initial.profile);
  });

  it("restores the fixed fixture after a session edit", () => {
    const initial = createProfileSessionState();
    const withPreferences = profileSessionReducer(
      profileSessionReducer(initial, {
        visible: false,
        type: "set-social-stats-visibility",
      }),
      { enabled: true, type: "set-reduced-motion" },
    );
    const edited = profileSessionReducer(withPreferences, {
      bio: "新的合成简介",
      displayName: "会话显示名",
      type: "save-profile",
    });
    const reset = profileSessionReducer(edited, { type: "reset-profile" });

    expect(reset.profile).toEqual(initial.profile);
    expect(reset.preferences).toEqual(withPreferences.preferences);
    expect(reset.status).toBe("已恢复固定演示资料。");
  });

  it("keeps the reduced-motion preference in the provider session state", () => {
    const initial = createProfileSessionState();
    const statsHidden = profileSessionReducer(initial, {
      visible: false,
      type: "set-social-stats-visibility",
    });
    const enabled = profileSessionReducer(statsHidden, {
      enabled: true,
      type: "set-reduced-motion",
    });

    expect(enabled.preferences.reducedMotion).toBe(true);
    expect(enabled.preferences.showSocialStats).toBe(false);
    expect(enabled.status).toBe("已为本次会话减少界面动效。");
  });

  it("can hide following and follower statistics without changing the profile fixture", () => {
    const initial = createProfileSessionState();
    const hidden = profileSessionReducer(initial, {
      visible: false,
      type: "set-social-stats-visibility",
    });

    expect(hidden.preferences.showSocialStats).toBe(false);
    expect(hidden.profile).toEqual(initial.profile);
    expect(hidden.status).toBe("主页将隐藏关注与粉丝统计。");
  });

  it("publishes fixture-backed state through the feature-local provider seam", () => {
    const markup = renderToStaticMarkup(
      <ProfileSessionProvider>
        <SessionProbe />
      </ProfileSessionProvider>,
    );

    expect(markup).toContain("火球演示用户 · false");
    expect(markup).toContain('data-reduced-motion="false"');
  });
});
