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
  preferences: { reducedMotion: false, showSocialStats: true },
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
  const value = useMemo(
    () => ({
      clearFeedback,
      errors: state.errors,
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

export const useProfileSession = (): ProfileSessionContextValue => {
  const value = useContext(ProfileSessionContext);
  if (value === null) {
    throw new Error(
      "useProfileSession must be used inside ProfileSessionProvider",
    );
  }
  return value;
};
