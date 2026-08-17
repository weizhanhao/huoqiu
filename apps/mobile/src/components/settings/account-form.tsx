import { tokens } from "@huoqiu/native-ui";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 改密码与改资料。
 *
 * 这两条接口服务端一直都有，移动端也早就封装好了（social-api 里的
 * changePassword / saveProfile），只是没有任何界面调它们——设置页里那一行点
 * 下去，弹的是「手机上的改密码表单还没做，网页版可以改」。链路只差这一块。
 *
 * 改资料尤其要紧：注册时填的昵称，此前在手机上永远改不了。
 */

/** 与服务端一致。写在这里是为了当场拦住，而不是提交完才被退回来。 */
export const MINIMUM_PASSWORD_LENGTH = 12;

export type AccountFormProperties = Readonly<{
  bio: string;
  currentPassword: string;
  displayName: string;
  failure: string | null;
  newPassword: string;
  onChangeBio: (value: string) => void;
  onChangeCurrentPassword: (value: string) => void;
  onChangeDisplayName: (value: string) => void;
  onChangeNewPassword: (value: string) => void;
  onSavePassword: () => void;
  onSaveProfile: () => void;
  saved: string | null;
  saving: boolean;
}>;

const Field = ({
  children,
  label,
}: Readonly<{ children: ReactNode; label: string }>) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

export function AccountForm({
  bio,
  currentPassword,
  displayName,
  failure,
  newPassword,
  onChangeBio,
  onChangeCurrentPassword,
  onChangeDisplayName,
  onChangeNewPassword,
  onSavePassword,
  onSaveProfile,
  saved,
  saving,
}: AccountFormProperties) {
  const canSaveProfile = !saving && displayName.trim().length > 0;
  /*
   * 新密码的长度当场校验。
   *
   * 不校验的话，用户输完两栏、点保存、等一个来回，才收到「新密码至少 12 位」
   * ——而这条规则本该在他打字时就说清楚。
   */
  const passwordLongEnough = newPassword.length >= MINIMUM_PASSWORD_LENGTH;
  const canSavePassword =
    !saving && currentPassword.length > 0 && passwordLongEnough;

  return (
    <View style={styles.root}>
      {failure === null ? null : <Text style={styles.failure}>{failure}</Text>}
      {saved === null ? null : <Text style={styles.saved}>{saved}</Text>}

      <Field label="昵称">
        <TextInput
          maxLength={24}
          onChangeText={onChangeDisplayName}
          placeholder="别人看到的名字"
          placeholderTextColor={tokens.text.disabled}
          style={styles.input}
          value={displayName}
        />
      </Field>

      <Field label="简介">
        <TextInput
          maxLength={200}
          multiline
          onChangeText={onChangeBio}
          placeholder="会显示在你的主页上"
          placeholderTextColor={tokens.text.disabled}
          style={[styles.input, styles.multiline]}
          value={bio}
        />
      </Field>

      <Pressable
        accessibilityRole="button"
        disabled={!canSaveProfile}
        onPress={onSaveProfile}
        style={[styles.save, canSaveProfile ? null : styles.saveOff]}
        testID="save-profile"
      >
        <Text style={styles.saveText}>保存资料</Text>
      </Pressable>

      <View style={styles.divider} />

      <Field label="当前密码">
        <TextInput
          autoCapitalize="none"
          autoComplete="current-password"
          onChangeText={onChangeCurrentPassword}
          placeholderTextColor={tokens.text.disabled}
          secureTextEntry
          style={styles.input}
          textContentType="password"
          value={currentPassword}
        />
      </Field>

      <Field label="新密码">
        <TextInput
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={onChangeNewPassword}
          placeholder={`至少 ${String(MINIMUM_PASSWORD_LENGTH)} 位`}
          placeholderTextColor={tokens.text.disabled}
          secureTextEntry
          style={styles.input}
          textContentType="newPassword"
          value={newPassword}
        />
      </Field>

      {newPassword.length > 0 && !passwordLongEnough ? (
        <Text style={styles.hint}>
          还差 {MINIMUM_PASSWORD_LENGTH - newPassword.length} 位。
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canSavePassword}
        onPress={onSavePassword}
        style={[styles.save, canSavePassword ? null : styles.saveOff]}
        testID="save-password"
      >
        <Text style={styles.saveText}>改密码</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: tokens.border.subtle,
    height: 1,
    marginVertical: 6,
  },
  failure: {
    color: tokens.market.upText,
    fontSize: 13,
    lineHeight: 20,
  },
  field: {
    gap: 4,
  },
  hint: {
    color: tokens.market.warningText,
    fontSize: 12.5,
  },
  input: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 8,
    borderWidth: 1,
    color: tokens.text.primary,
    fontSize: 15,
    minHeight: appTouchMinimum,
    paddingHorizontal: 12,
  },
  label: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  multiline: {
    minHeight: 72,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  root: {
    gap: 10,
    paddingBottom: 6,
  },
  save: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  saveOff: {
    backgroundColor: tokens.brand.subtle,
  },
  saveText: {
    color: tokens.text.inverse,
    fontSize: 15,
    fontWeight: "600",
  },
  saved: {
    color: tokens.market.downText,
    fontSize: 13,
  },
});
