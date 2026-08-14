"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 个人资料：昵称、居住地、性别、个人简介。
 *
 * 落到真实账号，并且改完主页立即生效——设置页明写「简介将公开显示在你的
 * 个人主页上」，存了却看不见，这项就等于没做。
 *
 * 本页此前另有一个编辑器，改的是会话态 fixture：刷新即回退，别人也看不到。
 * 那个留在原处不动（它服务的是演示身份），这个才是落账号的那一份。
 */

const MAX_BIO = 200;

/*
 * 省份下拉。
 *
 * 只列这几项，而不是硬凑三十四个省级行政区——凑出来的清单里一旦有错漏，
 * 用户选不到自己所在地，比清单短更糟。这里够用，需要时再补全。
 */
const PROVINCES = [
  "北京",
  "上海",
  "广东",
  "浙江",
  "江苏",
  "四川",
  "湖北",
  "山东",
  "福建",
  "陕西",
] as const;

const GENDERS = [
  { id: "secret", label: "保密" },
  { id: "male", label: "男" },
  { id: "female", label: "女" },
] as const;

export function ProfileEditorPanel() {
  const { account, authorizedFetch, refresh } = useAccountSession();
  const [displayName, setDisplayName] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("secret");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  /*
   * 只在首次拿到账号时把昵称灌进输入框，之后不再覆盖——否则会把用户正在
   * 输入的内容冲掉。
   *
   * 在渲染期做而不是放进 effect：effect 版本会先渲染一帧空输入框、提交、
   * 再填一次，用户看得见输入框闪一下从空变成有值。渲染期改状态 React 会
   * 直接重跑这一帧，那一帧根本不会被提交。
   */
  if (account !== null && !ready) {
    setDisplayName(account.displayName);
    setReady(true);
  }

  useEffect(() => {
    if (account === null) return;
    void (async () => {
      try {
        const response = await authorizedFetch("/api/social/me", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          account: {
            bio?: string;
            city?: string;
            gender?: string;
            province?: string;
          } | null;
        };
        setBio(data.account?.bio ?? "");
        setCity(data.account?.city ?? "");
        setGender(data.account?.gender ?? "secret");
        setProvince(data.account?.province ?? "");
      } catch {
        // 读不到就留空，不替用户填一个他没写过的居住地。
      }
    })();
  }, [account, authorizedFetch]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setStatus("");
    try {
      const response = await authorizedFetch("/api/social/profile", {
        body: JSON.stringify({
          bio,
          city,
          display_name: displayName,
          gender,
          province,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus(data.error ?? "保存失败。");
        return;
      }
      await refresh();
      setStatus("已保存，个人主页同步更新。");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="profile-editor-heading"
      className={styles.contentSection}
      data-testid="profile-editor-panel"
    >
      <h3 className={styles.sectionHeading} id="profile-editor-heading">
        个人简介
      </h3>

      {account === null ? (
        <Link className={styles.inverseLink} href="/login">
          登录后编辑资料
        </Link>
      ) : (
        <form method="post" onSubmit={submit}>
          <div className={styles.formField}>
            <label htmlFor="profile-display-name">昵称</label>
            <input
              id="profile-display-name"
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              type="text"
              value={displayName}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="profile-province">居住地</label>
            <select
              id="profile-province"
              onChange={(event) => setProvince(event.target.value)}
              value={province}
            >
              <option value="">省/直辖市</option>
              {PROVINCES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input
              aria-label="城市/地区"
              maxLength={40}
              onChange={(event) => setCity(event.target.value)}
              placeholder="城市/地区"
              type="text"
              value={city}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="profile-gender">性别</label>
            <select
              id="profile-gender"
              onChange={(event) => setGender(event.target.value)}
              value={gender}
            >
              {GENDERS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label htmlFor="profile-bio">个人简介</label>
            <textarea
              id="profile-bio"
              maxLength={MAX_BIO}
              onChange={(event) => setBio(event.target.value)}
              placeholder="请填写一段与投资相关的个人简介，全长不超过200字，简介将公开显示在你的个人主页上。"
              value={bio}
            />
            <span className={styles.contentMeta}>
              {bio.length} / {MAX_BIO}
            </span>
          </div>

          <button
            className={styles.primaryButton}
            disabled={pending}
            type="submit"
          >
            {pending ? "保存中" : "保存"}
          </button>
        </form>
      )}

      {status === "" ? null : (
        <p aria-live="polite" className={styles.contentMeta}>
          {status}
        </p>
      )}
    </section>
  );
}
