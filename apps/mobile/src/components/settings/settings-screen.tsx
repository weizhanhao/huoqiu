import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  AccountSummary,
  CommentPolicy,
  MarketColorMode,
  NotificationCategory,
  PrivacySettings,
} from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { AccountForm, type AccountFormProperties } from "./account-form";

/*
 * 设置。
 *
 * 参考图（settings-top / settings-bottom）分四组：账号、交易账户、功能设置、
 * 关于。这里保留同样的分组和顺序，但每一行的去向按「有没有真东西」分两类：
 *
 *   - 真能改的，就地展开可选项：评论权限、消息通知、涨跌配色。它们存在账号
 *     下，换台设备还是自己选的那套。
 *   - 没有的（交易账户、扫一扫登录PC、模拟交易），行留着，点了如实说一句。
 *     删掉会让人以为这个产品没打算做；做个假的更糟。
 *
 * 此前这一页只有一个「密度」开关，还只活在本地内存里——退出去再进来回到默认
 * 值，而它本来也没有影响任何东西。
 */

const POLICIES: readonly Readonly<{ id: CommentPolicy; label: string }>[] = [
  { id: "everyone", label: "所有人" },
  { id: "following", label: "我关注的人" },
  { id: "followers", label: "关注我的人" },
  { id: "followers-3d", label: "关注我 3 天以上的" },
  { id: "off", label: "关闭评论" },
];

const CATEGORIES: readonly Readonly<{
  id: NotificationCategory;
  label: string;
}>[] = [
  { id: "replies", label: "回复我的" },
  { id: "mentions", label: "提到我的" },
  { id: "likes", label: "赞我的" },
  { id: "follows", label: "关注我的" },
  { id: "system", label: "系统消息" },
];

const COLORS: readonly Readonly<{ id: MarketColorMode; label: string }>[] = [
  { id: "red-up", label: "红涨绿跌" },
  { id: "green-up", label: "绿涨红跌" },
];

export type SettingsSection =
  "colors" | "comments" | "notifications" | "password" | null;

export type SettingsScreenProperties = Readonly<{
  account: AccountSummary | null;
  /** 改密码与改资料那一组表单的全部状态与回调。 */
  accountForm: Omit<AccountFormProperties, "saving">;
  failure: string | null;
  onBack: () => void;
  onChangePolicy: (policy: CommentPolicy) => void;
  onLogout: () => void;
  onOpenSection: (section: SettingsSection) => void;
  onSelectColors: (mode: MarketColorMode) => void;
  onShowNotice: (title: string, detail: string) => void;
  onToggleCategory: (category: NotificationCategory) => void;
  /** null 表示还没取到。 */
  privacy: PrivacySettings | null;
  saving: boolean;
  section: SettingsSection;
}>;

const Group = ({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) => (
  <>
    <Text style={styles.groupTitle}>{title}</Text>
    <View style={styles.group}>{children}</View>
  </>
);

const Row = ({
  detail,
  label,
  onPress,
}: Readonly<{ detail?: string; label: string; onPress: () => void }>) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    {detail === undefined ? null : (
      <Text numberOfLines={1} style={styles.rowDetail}>
        {detail}
      </Text>
    )}
    <Text style={styles.rowChevron}>›</Text>
  </Pressable>
);

const Choice = ({
  label,
  onPress,
  selected,
}: Readonly<{ label: string; onPress: () => void; selected: boolean }>) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={styles.choice}
  >
    <Text style={selected ? styles.choiceTextOn : styles.choiceText}>
      {label}
    </Text>
    <Text style={styles.choiceMark}>{selected ? "✓" : ""}</Text>
  </Pressable>
);

export function SettingsScreen({
  account,
  accountForm,
  failure,
  onBack,
  onChangePolicy,
  onLogout,
  onOpenSection,
  onSelectColors,
  onShowNotice,
  onToggleCategory,
  privacy,
  saving,
  section,
}: SettingsScreenProperties) {
  const insets = useSafeAreaInsets();
  const soon = (label: string, detail: string) => () => {
    onShowNotice(label, detail);
  };
  const toggle = (next: SettingsSection) => () => {
    onOpenSection(section === next ? null : next);
  };
  const muted = privacy?.mutedCategories ?? [];

  return (
    <View style={styles.screen} testID="settings-screen">
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {failure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{failure}</Text>
          </View>
        )}

        <Group title="火球账号">
          <Row
            detail={account?.email ?? "未登录"}
            label="账号与安全"
            onPress={toggle("password")}
          />
          {section === "password" ? (
            <View style={styles.panel}>
              <Text style={styles.panelText}>
                {account === null
                  ? "登录后可以在这里改昵称、简介和密码。"
                  : `当前账号 ${account.email}。手机和网页是同一套账号，在哪边改都算数。`}
              </Text>
              {account === null ? null : (
                <AccountForm {...accountForm} saving={saving} />
              )}
            </View>
          ) : null}
          <Row
            label="“扫一扫”登录PC"
            onPress={soon("扫一扫登录PC", "网页端扫码登录还没做。")}
          />
        </Group>

        <Group title="交易账户">
          <Row
            label="基金账户"
            onPress={soon("基金账户", "暂未开放。这个版本不涉及交易。")}
          />
          <Row
            label="证券账户"
            onPress={soon("证券账户", "暂未开放。这个版本不涉及交易。")}
          />
        </Group>

        <Group title="功能设置">
          <Row
            detail={
              POLICIES.find(({ id }) => id === privacy?.commentPolicy)?.label ??
              ""
            }
            label="社区功能设置"
            onPress={toggle("comments")}
          />
          {section === "comments" ? (
            <View style={styles.panel}>
              <Text style={styles.panelText}>谁可以评论我发布的内容</Text>
              {POLICIES.map(({ id, label }) => (
                <Choice
                  key={id}
                  label={label}
                  onPress={() => {
                    onChangePolicy(id);
                  }}
                  selected={privacy?.commentPolicy === id}
                />
              ))}
            </View>
          ) : null}

          <Row
            label="“我的”页展示"
            onPress={soon("“我的”页展示", "自定义主页模块还没做。")}
          />

          <Row
            detail={muted.length === 0 ? "全部接收" : `已关 ${muted.length} 类`}
            label="消息通知"
            onPress={toggle("notifications")}
          />
          {section === "notifications" ? (
            <View style={styles.panel}>
              <Text style={styles.panelText}>
                关掉的分类不再出现在消息里，未读数也不再为它跳。
              </Text>
              {CATEGORIES.map(({ id, label }) => (
                <Choice
                  key={id}
                  label={label}
                  onPress={() => {
                    onToggleCategory(id);
                  }}
                  selected={!muted.includes(id)}
                />
              ))}
            </View>
          ) : null}

          <Row
            label="自选"
            onPress={soon("自选设置", "自选分组和排序还没做。")}
          />
          <Row
            label="模拟交易"
            onPress={soon("模拟交易", "暂未开放。这个版本不涉及交易。")}
          />

          <Row
            detail={
              COLORS.find(({ id }) => id === privacy?.marketColors)?.label ?? ""
            }
            label="通用"
            onPress={toggle("colors")}
          />
          {section === "colors" ? (
            <View style={styles.panel}>
              <Text style={styles.panelText}>涨跌配色</Text>
              {COLORS.map(({ id, label }) => (
                <Choice
                  key={id}
                  label={label}
                  onPress={() => {
                    onSelectColors(id);
                  }}
                  selected={privacy?.marketColors === id}
                />
              ))}
            </View>
          ) : null}
        </Group>

        <Group title="关于">
          <Row
            label="个人信息收集清单"
            onPress={soon(
              "个人信息收集清单",
              "只存你自己填的资料和你自己的操作：账号、帖子、评论、关注、自选。没有第三方统计。",
            )}
          />
          <Row
            label="第三方合作清单"
            onPress={soon("第三方合作清单", "没有接入任何第三方 SDK。")}
          />
          <Row
            label="权限与隐私"
            onPress={soon(
              "权限与隐私",
              "只在你点「插入图片」时申请相册权限。没有定位、通讯录、相机。",
            )}
          />
          <Row
            label="建议反馈"
            onPress={soon("建议反馈", "反馈入口还没做。")}
          />
          <Row
            label="关于火球"
            onPress={soon(
              "关于火球",
              "内部预览版本。行情与资讯来自公开数据源，不构成投资建议。",
            )}
          />
        </Group>

        {account === null ? null : (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={onLogout}
            style={styles.logout}
            testID="settings-logout"
          >
            <Text style={styles.logoutText}>退出登录</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  choice: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: appTouchMinimum,
  },
  choiceMark: {
    color: tokens.brand.primary,
    fontSize: 15,
    fontWeight: "700",
    minWidth: 16,
    textAlign: "right",
  },
  choiceText: {
    color: tokens.text.secondary,
    fontSize: 15,
  },
  choiceTextOn: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  content: {
    paddingBottom: 40,
  },
  group: {
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  groupTitle: {
    color: tokens.text.tertiary,
    fontSize: 13,
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  logout: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    justifyContent: "center",
    marginHorizontal: 12,
    marginTop: 20,
    minHeight: appTouchMinimum,
  },
  logoutText: {
    color: tokens.market.up,
    fontSize: 16,
  },
  notice: {
    backgroundColor: tokens.market.warningSubtle,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noticeText: {
    color: tokens.market.warningText,
    fontSize: 13,
  },
  panel: {
    backgroundColor: tokens.surface.canvas,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  panelAction: {
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  panelActionText: {
    color: tokens.brand.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  panelText: {
    color: tokens.text.tertiary,
    fontSize: 13,
    lineHeight: 20,
    paddingBottom: 4,
  },
  row: {
    alignItems: "center",
    borderBottomColor: tokens.border.subtle,
    /*
     * 分隔线从标签左缘起，不通栏。
     *
     * 参考图里卡内的每一条 1px 线都内缩到文字起点——通栏会把一张卡切成
     * 几块看起来不相干的横条。
     */
    borderBottomWidth: 1,
    marginLeft: 16,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowChevron: {
    color: tokens.text.disabled,
    fontSize: 18,
  },
  rowDetail: {
    color: tokens.text.tertiary,
    flexShrink: 1,
    fontSize: 13.5,
  },
  rowLabel: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 16,
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  topAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: 36,
  },
  topGlyph: {
    color: tokens.text.primary,
    fontSize: 26,
    lineHeight: 30,
  },
  topTitle: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    marginRight: 36,
    textAlign: "center",
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
