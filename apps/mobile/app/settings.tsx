import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import {
  changePassword,
  fetchPrivacy,
  savePrivacy,
  saveProfile,
  type CommentPolicy,
  type MarketColorMode,
  type NotificationCategory,
  type PrivacySettings,
} from "../src/api/social-api";
import {
  SettingsScreen,
  type SettingsSection,
} from "../src/components/settings/settings-screen";
import { useComingSoon } from "../src/components/system/coming-soon";
import { useRemote } from "../src/hooks/use-remote";
import { createD0BackHandler } from "../src/navigation/back-or-home";
import { useAccountSession } from "../src/session/account-session";

/*
 * 设置。
 *
 * 此前只有一个「密度」开关，活在本地内存里——退出去再进来回到默认值，而它本来
 * 也没影响任何东西。现在三项真设置都存在账号下：谁能评论我、哪些通知不要、
 * 涨跌用什么颜色，换台设备还是自己选的那套。
 */
export default function SettingsRoute() {
  const router = useRouter();
  const { show } = useComingSoon();
  const { account, callAs, logout, refresh } = useAccountSession();

  const privacy = useRemote(useCallback(() => callAs(fetchPrivacy), [callAs]));

  const [section, setSection] = useState<SettingsSection>(null);
  /*
   * 昵称和简介的初值来自会话。account 变了要跟着变——刚保存完那一次，
   * 输入框里应该是新值，而不是打开这一页时的旧值。
   */
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountFailure, setAccountFailure] = useState<string | null>(null);
  const [accountSaved, setAccountSaved] = useState<string | null>(null);
  const [pending, setPending] = useState<PrivacySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * 先把选择显示出来，再等服务端确认。
   *
   * 等回包才变的话，点一下要愣半秒才有反应，人会以为没点上，于是再点一次——
   * 而第二下正好把它切回去。失败时丢掉这份乐观值，重新显示服务端那份。
   */
  const current = pending ?? privacy.value;

  const persist = useCallback(
    async (patch: Partial<PrivacySettings>) => {
      if (current === null) return;
      setPending({ ...current, ...patch });
      setSaving(true);
      const result = await callAs((token) => savePrivacy(token, patch));
      setSaving(false);
      if (result.kind === "ok") {
        setFailure(null);
        privacy.refresh();
        return;
      }
      setPending(null);
      setFailure(result.message);
    },
    [callAs, current, privacy],
  );

  const submitProfile = useCallback(async () => {
    setSaving(true);
    const result = await callAs((token) =>
      saveProfile(token, { bio: bio.trim(), displayName: displayName.trim() }),
    );
    setSaving(false);
    if (result.kind === "ok") {
      setAccountFailure(null);
      setAccountSaved("资料已保存。");
      await refresh();
      return;
    }
    setAccountSaved(null);
    setAccountFailure(result.message);
  }, [bio, callAs, displayName, refresh]);

  const submitPassword = useCallback(async () => {
    setSaving(true);
    const result = await callAs((token) =>
      changePassword(token, currentPassword, newPassword),
    );
    setSaving(false);
    if (result.kind === "ok") {
      /* 成功之后立刻清掉两栏：密码留在输入框里没有任何好处。 */
      setCurrentPassword("");
      setNewPassword("");
      setAccountFailure(null);
      setAccountSaved("密码已改。下次登录用新密码。");
      return;
    }
    setAccountSaved(null);
    setAccountFailure(result.message);
  }, [callAs, currentPassword, newPassword]);

  return (
    <SettingsScreen
      account={account}
      accountForm={{
        bio,
        currentPassword,
        displayName,
        failure: accountFailure,
        newPassword,
        onChangeBio: setBio,
        onChangeCurrentPassword: setCurrentPassword,
        onChangeDisplayName: setDisplayName,
        onChangeNewPassword: setNewPassword,
        onSavePassword: () => {
          void submitPassword();
        },
        onSaveProfile: () => {
          void submitProfile();
        },
        saved: accountSaved,
      }}
      failure={failure ?? privacy.failure}
      onBack={createD0BackHandler(router, "/profile")}
      onChangePolicy={(commentPolicy: CommentPolicy) => {
        void persist({ commentPolicy });
      }}
      onLogout={() => {
        void logout();
      }}
      onOpenSection={setSection}
      onSelectColors={(marketColors: MarketColorMode) => {
        void persist({ marketColors });
      }}
      onShowNotice={show}
      onToggleCategory={(category: NotificationCategory) => {
        const muted = current?.mutedCategories ?? [];
        void persist({
          mutedCategories: muted.includes(category)
            ? muted.filter((entry) => entry !== category)
            : [...muted, category],
        });
      }}
      privacy={current}
      saving={saving}
      section={section}
    />
  );
}
