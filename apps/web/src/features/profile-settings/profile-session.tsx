"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import type { SyntheticProfile } from "./profile-fixtures";
import { syntheticProfileFixture } from "./profile-fixtures";
import styles from "./profile-settings.module.css";

export type ProfileValidationErrors = Readonly<{
  bio?: string;
  displayName?: string;
}>;

export type ProfileSessionState = Readonly<{
  errors: ProfileValidationErrors;
  preferences: Readonly<{
    reducedMotion: boolean;
    showSocialStats: boolean;
    /*
     * 发帖时给本地图片盖上作者名。
     *
     * 图片从不上传服务器（发帖栏写明「仅本地预览，不上传网络」），
     * 所以水印也在浏览器里画——开关打开后预览图上确实会出现水印，
     * 不是一个打开了什么也不发生的开关。
     */
    watermarkImages: boolean;
  }>;
  profile: SyntheticProfile;
  status: string | null;
}>;

export type ProfileSessionAction =
  | Readonly<{
      bio: string;
      displayName: string;
      type: "save-profile";
    }>
  | Readonly<{ type: "reset-profile" }>
  | Readonly<{ enabled: boolean; type: "set-reduced-motion" }>
  | Readonly<{ type: "set-social-stats-visibility"; visible: boolean }>
  | Readonly<{ enabled: boolean; type: "set-image-watermark" }>
  | Readonly<{ type: "clear-feedback" }>;

export type ProfileInput = Readonly<{ bio: string; displayName: string }>;

export const validateProfileInput = (
  input: ProfileInput,
): ProfileValidationErrors => {
  const displayNameLength = Array.from(input.displayName.trim()).length;
  const errors: { bio?: string; displayName?: string } = {};
  if (displayNameLength < 2 || displayNameLength > 20) {
    errors.displayName = "显示名需要 2–20 个字符。";
  }
  if (Array.from(input.bio.trim()).length > 80) {
    errors.bio = "简介最多 80 个字符。";
  }
  return errors;
};

export const createProfileSessionState = (): ProfileSessionState => ({
  errors: {},
  preferences: {
    reducedMotion: false,
    showSocialStats: true,
    // 默认不加：水印是用户主动要的，不该替他决定往自己的图上盖字。
    watermarkImages: false,
  },
  profile: { ...syntheticProfileFixture },
  status: null,
});

export const profileSessionReducer = (
  state: ProfileSessionState,
  action: ProfileSessionAction,
): ProfileSessionState => {
  if (action.type === "clear-feedback") {
    return { ...state, errors: {}, status: null };
  }

  if (action.type === "reset-profile") {
    return {
      ...createProfileSessionState(),
      preferences: state.preferences,
      status: "已恢复固定演示资料。",
    };
  }

  if (action.type === "set-reduced-motion") {
    return {
      ...state,
      preferences: { ...state.preferences, reducedMotion: action.enabled },
      status: action.enabled
        ? "已为本次会话减少界面动效。"
        : "已恢复本次会话的标准动效。",
    };
  }

  if (action.type === "set-image-watermark") {
    return {
      ...state,
      preferences: { ...state.preferences, watermarkImages: action.enabled },
      status: action.enabled
        ? "发帖时将在本地图片右下角加上你的昵称。"
        : "发帖时不再给本地图片加水印。",
    };
  }

  if (action.type === "set-social-stats-visibility") {
    return {
      ...state,
      preferences: { ...state.preferences, showSocialStats: action.visible },
      status: action.visible
        ? "主页将显示关注与粉丝统计。"
        : "主页将隐藏关注与粉丝统计。",
    };
  }

  const displayName = action.displayName.trim();
  const bio = action.bio.trim();
  const errors = validateProfileInput(action);
  if (Object.keys(errors).length > 0) {
    return {
      ...state,
      errors,
      status: null,
    };
  }

  return {
    ...state,
    errors: {},
    profile: { ...state.profile, bio, displayName },
    status: "资料已更新，仅在本次浏览会话中保留。",
  };
};

export type ProfileSessionContextValue = Readonly<{
  clearFeedback: () => void;
  errors: ProfileValidationErrors;
  preferences: ProfileSessionState["preferences"];
  profile: SyntheticProfile;
  resetProfile: () => void;
  saveProfile: (input: ProfileInput) => ProfileValidationErrors;
  setImageWatermark: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setSocialStatsVisibility: (visible: boolean) => void;
  status: string | null;
}>;

const ProfileSessionContext = createContext<ProfileSessionContextValue | null>(
  null,
);

type ProfileSessionProviderProperties = Readonly<{ children: ReactNode }>;

export function ProfileSessionProvider({
  children,
}: ProfileSessionProviderProperties) {
  const [state, dispatch] = useReducer(
    profileSessionReducer,
    undefined,
    createProfileSessionState,
  );
  const clearFeedback = useCallback(() => {
    dispatch({ type: "clear-feedback" });
  }, []);
  const saveProfile = useCallback((input: ProfileInput) => {
    const errors = validateProfileInput(input);
    dispatch({ ...input, type: "save-profile" });
    return errors;
  }, []);
  const resetProfile = useCallback(() => {
    dispatch({ type: "reset-profile" });
  }, []);
  const setReducedMotion = useCallback((enabled: boolean) => {
    dispatch({ enabled, type: "set-reduced-motion" });
  }, []);
  const setSocialStatsVisibility = useCallback((visible: boolean) => {
    dispatch({ type: "set-social-stats-visibility", visible });
  }, []);
  const setImageWatermark = useCallback((enabled: boolean) => {
    dispatch({ enabled, type: "set-image-watermark" });
  }, []);
  const value = useMemo(
    () => ({
      clearFeedback,
      errors: state.errors,
      setImageWatermark,
      preferences: state.preferences,
      profile: state.profile,
      resetProfile,
      saveProfile,
      setReducedMotion,
      setSocialStatsVisibility,
      status: state.status,
    }),
    [
      clearFeedback,
      resetProfile,
      saveProfile,
      setImageWatermark,
      setReducedMotion,
      setSocialStatsVisibility,
      state,
    ],
  );

  return (
    <ProfileSessionContext.Provider value={value}>
      <div
        className={styles.sessionBoundary}
        data-reduced-motion={String(state.preferences.reducedMotion)}
      >
        {children}
      </div>
    </ProfileSessionContext.Provider>
  );
}

/*
 * 偏好的「可选」读法。
 *
 * 设置页必须在 Provider 里，读不到就是接错了，该抛错。
 * 但发帖框只是想知道「要不要加水印」——它在别的上下文里也会被渲染
 * （比如只挂发帖组件的组件测试）。为一个可有可无的偏好把发帖整个搞崩，
 * 代价和收益完全不成比例，所以这里读不到就按默认值走。
 */
export const useOptionalProfileSession =
  (): ProfileSessionContextValue | null => useContext(ProfileSessionContext);

export const useProfileSession = (): ProfileSessionContextValue => {
  const value = useContext(ProfileSessionContext);
  if (value === null) {
    throw new Error(
      "useProfileSession must be used inside ProfileSessionProvider",
    );
  }
  return value;
};
