"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "./account.module.css";
import { useAccountSession } from "./account-session";

/*
 * 登录与注册。
 *
 * 这是全站第一处「真的会改变服务端状态」的表单：账号落盘到
 * .runtime/social/social-v1.json，密码经 scrypt 加盐，刷新、换页、
 * 重启进程都还在。关注数与帖子数从此由这些真实账号算出来。
 *
 * 密码下限 12 位是 packages/contracts 的 authRegisterBodySchema 定的，
 * 这里在客户端先提示，服务端仍会再校验一次——客户端校验只是省一次往返，
 * 不是信任边界。
 */

const MINIMUM_PASSWORD_LENGTH = 12;

type Mode = "login" | "register";

/**
 * 登录后要回到哪一页。
 *
 * 站内很多地方是「点了才发现要登录」——关注一个组合、收藏一条帖子。此前
 * 登录成功后一律停在登录页，用户得自己想办法走回刚才那一页。
 *
 * 只接受站内路径。`//evil.example` 是协议相对地址，浏览器会当成外站；
 * 放进去就是一个开放重定向：攻击者拿一条本站的登录链接，把人送到别处
 * 伪造的页面上，而地址栏一路都是本站域名。
 */
export const safeNextPath = (raw: string | null): string | null => {
  if (raw === null || !raw.startsWith("/")) return null;
  // `//host` 与 `/\host` 都会被解析成另一个源。
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
};

export function AuthExperience({
  mode,
  nextPath: rawNextPath,
}: Readonly<{ mode: Mode; nextPath?: string | null }>) {
  // accounts 不再取：登录页上那份公开的账号名册已经删掉了。
  const { account, login, logout, register } = useAccountSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "ok"; text: string }>({
    kind: "ok",
    text: "",
  });
  const [pending, setPending] = useState(false);
  const router = useRouter();
  /*
   * next 由页面（服务端组件）读好传进来。
   *
   * 早先是在这里读 location.search——那只有客户端有，读了就是水合不一致，
   * 于是靠「挂载后再取一次」绕开，代价是那条返回链接会在水合后凭空出现
   * 一下。换成 useSearchParams 首帧就对，但它会让整页退出静态预渲染，
   * 除非再包一层 Suspense。服务端本来就拿得到这个参数，传下来最省事，
   * 而且校验留在这一侧，页面传什么进来都跑不掉。
   */
  const nextPath = safeNextPath(rawNextPath ?? null);

  const isRegister = mode === "register";

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;

    if (isRegister && displayName.trim().length === 0) {
      setStatus({ kind: "error", text: "请填写显示名。" });
      return;
    }
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setStatus({
        kind: "error",
        text: `密码至少 ${MINIMUM_PASSWORD_LENGTH} 位。`,
      });
      return;
    }

    setPending(true);
    setStatus({ kind: "ok", text: isRegister ? "正在注册…" : "正在登录…" });
    /*
     * 解禁按钮必须放在 finally 里。
     *
     * 早先 setPending(false) 写在 await 之后、又没有 catch：断网或服务端断连
     * 时 fetch 直接 reject，这一行永远执行不到，按钮就永久停在禁用态、
     * 状态行永远显示「正在登录…」。用户唯一的出路是刷新页面——
     * 而这是登录页，最不该出这种故障的地方。
     */
    try {
      const failure = isRegister
        ? await register(displayName, email, password)
        : await login(email, password);

      if (failure === null) {
        setPassword("");
        /*
         * 回到刚才那一页。是「点了才发现要登录」走过来的，就送回去；
         * 直接打开登录页的，留在原地看已登录状态。
         */
        const destination = nextPath;
        if (destination !== null) {
          setStatus({ kind: "ok", text: "登录成功，正在返回…" });
          router.replace(destination);
          return;
        }
        setStatus({
          kind: "ok",
          text: isRegister ? "注册成功，已为你登录。" : "登录成功。",
        });
        return;
      }
      setStatus({ kind: "error", text: failure });
    } catch {
      setStatus({
        kind: "error",
        text: "网络异常，没能连上服务端，请稍后再试。",
      });
    } finally {
      setPending(false);
    }
  };

  if (account !== null) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.heading}>
            <h1>已登录</h1>
            <p>
              当前身份 <strong>{account.displayName}</strong>（{account.email}
              ）。
            </p>
          </div>
          <div className={styles.signedIn}>
            {/*
              已经登录、却又带着 next 落在这一页（比如点了浏览器后退），
              要有一条明确的路走回去，而不是让人自己想办法。
            */}
            {nextPath === null ? null : (
              <Link className={styles.secondary} href={nextPath}>
                返回刚才的页面
              </Link>
            )}
            <p className={styles.signedInStats}>
              <span>
                关注 <strong>{account.followingCount}</strong>
              </span>
              <span>
                粉丝 <strong>{account.followerCount}</strong>
              </span>
              <span>
                帖子 <strong>{account.postCount}</strong>
              </span>
            </p>
            <Link className={styles.secondary} href={`/users/${account.id}`}>
              查看我的主页
            </Link>
            <button className={styles.secondary} onClick={logout} type="button">
              退出登录
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.heading}>
          <h1>{isRegister ? "注册火球账号" : "登录火球"}</h1>
          <p>
            账号、帖子与关注关系保存在本机服务端，刷新和重启后仍在。这里不接入
            任何第三方登录，也不会向外发送你的邮箱或密码。
          </p>
        </div>

        <form className={styles.form} onSubmit={submit}>
          {isRegister ? (
            <label className={styles.field}>
              <span>显示名</span>
              <input
                autoComplete="nickname"
                maxLength={80}
                name="display_name"
                onChange={(event) => setDisplayName(event.target.value)}
                required
                type="text"
                value={displayName}
              />
            </label>
          ) : null}

          <label className={styles.field}>
            <span>邮箱</span>
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className={styles.field}>
            <span>密码</span>
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={MINIMUM_PASSWORD_LENGTH}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <small className={styles.hint}>
              至少 {MINIMUM_PASSWORD_LENGTH} 位，仅以加盐散列存储。
            </small>
          </label>

          <p
            aria-live="polite"
            className={`${styles.status} ${
              status.kind === "error" ? styles.statusError : styles.statusOk
            }`}
          >
            {status.text}
          </p>

          <button className={styles.submit} disabled={pending} type="submit">
            {isRegister ? "注册并登录" : "登录"}
          </button>
        </form>

        <p className={styles.switchLine}>
          {isRegister ? (
            <>
              已经有账号？<Link href="/login">直接登录</Link>
            </>
          ) : (
            <>
              还没有账号？<Link href="/register">注册一个</Link>
            </>
          )}
        </p>
      </section>

      {/*
        这里原先有一块「本机已注册的账号」，把全站账号的昵称、粉丝数、帖子数
        连同主页链接一并列在登录页上，理由写的是「用于确认注册确实写入了
        服务端」。那个理由属于开发期自检，代价却是一份公开的用户名册——
        谁都不用登录就能看到这站上有哪些人。安全审查刚修掉 /api/social/me
        泄漏邮箱，这是同一类问题的另一个出口。注册有没有写进去，注册成功后
        自己就看得到，不需要把别人一起摆出来。
      */}
    </div>
  );
}
