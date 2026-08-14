import styles from "./login-methods.module.css";

/*
 * 登录方式一览。
 *
 * 密码登录是这台机器上唯一真能走通的：账号真实注册、口令加盐存储、
 * 会话是服务端签发的 HMAC 令牌。
 *
 * 另外三种做不了，原因各不相同，所以逐条写清楚，而不是笼统一句「暂未开放」：
 *   手机验证码 —— 需要短信网关，本机没有可用的发送通道；
 *   扫码登录   —— 需要配套的移动端来扫码，本项目目前只有网页端；
 *   微信登录   —— 需要微信开放平台的应用凭据，须由企业主体申请。
 *
 * 这三项刻意做成不可点的文字，不是灰掉的按钮：一个点下去没反应的按钮，
 * 比一句「这里还没有」更让人困惑——用户会以为是自己网络出了问题。
 */

type Method = Readonly<{
  available: boolean;
  name: string;
  note: string;
}>;

const METHODS: readonly Method[] = [
  {
    available: true,
    name: "邮箱与密码",
    note: "账号真实注册在本机，口令加盐存储，登录后由服务端签发会话令牌。",
  },
  {
    available: false,
    name: "手机验证码",
    note: "需要短信网关，本机没有可用的发送通道。",
  },
  {
    available: false,
    name: "扫码登录",
    note: "需要配套的移动端来扫码，本项目目前只有网页端。",
  },
  {
    available: false,
    name: "微信登录",
    note: "需要微信开放平台的应用凭据，须由企业主体申请。",
  },
];

export function LoginMethods() {
  return (
    <section className={styles.methods} aria-labelledby="login-methods-heading">
      <h2 className={styles.heading} id="login-methods-heading">
        登录方式
      </h2>
      <ul className={styles.list}>
        {METHODS.map((method) => (
          <li
            className={method.available ? styles.item : styles.itemOff}
            key={method.name}
          >
            <span className={styles.name}>
              {method.name}
              <span className={styles.tag}>
                {method.available ? "可用" : "未接入"}
              </span>
            </span>
            <span className={styles.note}>{method.note}</span>
          </li>
        ))}
      </ul>
      {/*
        找回密码同样没做，原因也是缺发信通道。与其放一个点开是空页面的
        「忘记密码」链接，不如在这里说明当前只能另注册一个账号。
      */}
      <p className={styles.footnote}>
        暂不支持找回密码：重置口令需要向邮箱发信，本机没有可用的发信通道。
        忘记口令时可以另注册一个账号。
      </p>
    </section>
  );
}
