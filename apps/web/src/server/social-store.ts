import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 真实账号、帖子与关注关系的持久化存储。
 *
 * 之前侧栏的「关注 18 / 粉丝 186 / 帖子 42」是写死的字面量——
 * 无论你做什么它都不变，这是最典型的「看着像做完了」。
 * 现在这三个数字全部由这里的真实数据算出来：注册一个账号、发一条帖、
 * 关注一个人，数字立刻跟着动，刷新也还在。
 *
 * 为什么是文件而不是数据库：
 * 本地受保护预览没有数据库依赖，交接文档也明确要求不为演示切片新增
 * 数据库迁移。文件存储配合原子写（先写 .tmp 再 rename）足以支撑单机预览，
 * 接口形状与 DB 实现一致，随时可以替换。
 *
 * 密码用 scrypt + 每账号独立盐，明文不落盘；比较走 timingSafeEqual。
 */

const SCRYPT_KEY_LENGTH = 64;

/** 性别取值与设置页下拉一致，默认保密。 */
export const genders = ["secret", "male", "female"] as const;

export type Gender = (typeof genders)[number];

export type Account = Readonly<{
  /** 个人简介，上限 200 字；设置页注明会公开显示在主页上。 */
  bio?: string;
  city?: string;
  createdAt: string;
  displayName: string;
  email: string;
  gender?: Gender;
  id: string;
  province?: string;
  passwordHash: string;
  salt: string;
  /*
   * 令牌世代号。改密码时 +1，使此前签发的所有令牌立刻作废。
   *
   * 没有它的话，「改密码」只挡住了知道旧口令的人，而真正的威胁——已经拿到
   * 会话令牌的人——照样能继续用。受害者改完密码以为安全了，其实攻击者
   * 手上那张票还有七天有效期。
   *
   * 后加的字段：早于它写入的账号没有，读取端按 0 处理。
   */
  tokenEpoch?: number;
}>;

/** 讨论是短帖，长文带标题、封面与分享范围。 */
export const postKinds = ["article", "discussion"] as const;
export type PostKind = (typeof postKinds)[number];

/** 草稿只有作者自己看得见；已发布才进公开列表。 */
export const postStatuses = ["draft", "published"] as const;
export type PostStatus = (typeof postStatuses)[number];

export const postVisibilities = ["followers", "private", "public"] as const;
export type PostVisibility = (typeof postVisibilities)[number];

/**
 * 创作声明。
 *
 * 目前只有「本文包含 AI 生成内容」一种。做成联合类型而不是布尔，是因为
 * 声明这件事天然会长出第二种（转载、广告），而布尔改起来要动库里的每一条。
 */
export const postDisclosures = ["ai"] as const;
export type PostDisclosure = (typeof postDisclosures)[number];

export type Post = Readonly<{
  authorId: string;
  body: string;
  /** 长文封面。 */
  coverUrl?: string;
  createdAt: string;
  /** 作者主动加的创作声明；没加就没有这一项。 */
  disclosure?: PostDisclosure;
  id: string;
  /** 旧记录没有这一项，读取端按讨论处理。 */
  kind?: PostKind;
  /**
   * 被转发的原帖 id。只有转发才有这个字段——旧记录没有它，读取端按普通
   * 帖子处理即可，不需要数据迁移。
   */
  quotedPostId?: string;
  /** 旧记录没有这一项，读取端按已发布处理——否则存量帖子会整片消失。 */
  status?: PostStatus;
  title: string;
  updatedAt?: string;
  visibility?: PostVisibility;
}>;

/*
 * 浏览计数按天分桶。
 *
 * 数据中心显示的是「昨天阅读量」，只记总数的话那个「昨天」永远只能给出
 * 累计值——数字在涨，含义是错的。
 */
export type PostView = Readonly<{
  count: number;
  /** YYYY-MM-DD。 */
  date: string;
  postId: string;
}>;

export type Follow = Readonly<{
  createdAt: string;
  followeeId: string;
  followerId: string;
}>;

export type Message = Readonly<{
  body: string;
  createdAt: string;
  fromId: string;
  id: string;
  /** 收件人读过之后写入时间戳；未读为 null。 */
  readAt: string | null;
  toId: string;
}>;

export type Like = Readonly<{
  accountId: string;
  createdAt: string;
  postId: string;
}>;

export type Bookmark = Readonly<{
  accountId: string;
  createdAt: string;
  postId: string;
}>;

/*
 * 自选。
 *
 * 此前自选只活在浏览器的 localStorage 里：换台设备就没了，手机上加的网页上
 * 看不到，反过来也一样。而自选恰恰是最该跟着人走的东西——在手机上把一只票
 * 加进自选，回到电脑前打开却没有，用户会认为这个功能是坏的。
 *
 * 存代码而不是存 listing id：代码（sh600519）是全站唯一那份标识，行情、
 * 搜索、个股页都用它。
 */
export type WatchlistEntry = Readonly<{
  accountId: string;
  createdAt: string;
  symbol: string;
}>;

export type Comment = Readonly<{
  authorId: string;
  body: string;
  createdAt: string;
  id: string;
  /** 回复某条评论时指向它；顶层评论没有这个字段。 */
  parentId?: string;
  postId: string;
}>;

export type Block = Readonly<{
  blockedId: string;
  createdAt: string;
  /** 屏蔽是单向的：ownerId 屏蔽了 blockedId，反过来不成立。 */
  ownerId: string;
}>;

/*
 * 谁可以评论我发布的讨论。
 *
 * 取值对应设置页上的五个选项，不多不少：
 *   everyone      所有人
 *   following     我关注的人
 *   followers     关注我的人
 *   followers-3d  关注我 3 天或以上的粉丝
 *   off           关闭评论
 */
export const commentPolicies = [
  "everyone",
  "following",
  "followers",
  "followers-3d",
  "off",
] as const;

export type CommentPolicy = (typeof commentPolicies)[number];

/** 涨跌配色。默认红涨绿跌，与 A 股习惯一致。 */
export const marketColorModes = ["red-up", "green-up"] as const;

export type MarketColorMode = (typeof marketColorModes)[number];

/** 可关闭的通知分类，与通知页的五个页签一一对应。 */
export const notificationCategories = [
  "replies",
  "mentions",
  "likes",
  "follows",
  "system",
] as const;

export type NotificationCategory = (typeof notificationCategories)[number];

export type Preference = Readonly<{
  accountId: string;
  commentPolicy: CommentPolicy;
  /** 后加的字段：早于它写入的记录没有，读取端按默认值处理。 */
  marketColors?: MarketColorMode;
  /*
   * 已关闭提醒的分类。
   *
   * 存「关掉了哪些」而不是「开着哪些」：将来新增分类时，老记录里没有它，
   * 默认就是开——新功能默认可见，而不是对老用户悄悄静音。
   */
  mutedCategories?: readonly NotificationCategory[];
  updatedAt: string;
}>;

interface Store {
  accounts: Account[];
  blocks: Block[];
  bookmarks: Bookmark[];
  comments: Comment[];
  follows: Follow[];
  likes: Like[];
  messages: Message[];
  posts: Post[];
  preferences: Preference[];
  views: PostView[];
  watchlist: WatchlistEntry[];
}

const storeDirectory = (): string =>
  process.env.HUOQIU_SOCIAL_STORE_DIRECTORY ??
  resolve(process.cwd(), ".runtime/social");

const storePath = (): string => resolve(storeDirectory(), "social-v1.json");

const readStore = (): Store => {
  try {
    const parsed = JSON.parse(
      readFileSync(storePath(), "utf8"),
    ) as Partial<Store>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      // 屏蔽、评论、点赞、私信都是后加的：早于它们写入的快照没有这些键，
      // 回落空数组而不是把整份快照判为损坏。
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      follows: Array.isArray(parsed.follows) ? parsed.follows : [],
      likes: Array.isArray(parsed.likes) ? parsed.likes : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
      // 浏览计数是后加的，早于它写入的快照没有这个键。
      views: Array.isArray(parsed.views) ? parsed.views : [],
      // 自选同理：在它之前写下的快照里没有这一项。
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
    };
  } catch {
    // 文件不存在或损坏都退回空库：宁可从零开始，也不把半截数据当真。
    return {
      accounts: [],
      blocks: [],
      bookmarks: [],
      comments: [],
      follows: [],
      likes: [],
      messages: [],
      posts: [],
      preferences: [],
      views: [],
      watchlist: [],
    };
  }
};

const writeStore = (store: Store): void => {
  mkdirSync(storeDirectory(), { recursive: true });
  const target = storePath();
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
};

const hashPassword = (password: string, salt: string): string =>
  scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");

const passwordMatches = (
  password: string,
  account: Pick<Account, "passwordHash" | "salt">,
): boolean => {
  const candidate = Buffer.from(hashPassword(password, account.salt), "hex");
  const expected = Buffer.from(account.passwordHash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
};

export type PublicAccount = Readonly<{
  /*
   * 资料字段随公开账号一起带出。
   *
   * 设置页明写「简介将公开显示在你的雪球个人主页上」——那就得真的显示出来。
   * 存了却不下发，改完资料主页还是老样子，等于没做。
   *
   * 这里**没有** email，而且不能再加回来。它此前是有的，而 /api/social/me
   * 会把 listAccounts() 的结果原样发给任何人——不带令牌 curl 一下，
   * 全站账号的真实邮箱就是一整段 JSON，没有分页也没有条数上限。
   * 登录接口统一回 401、注册接口不说邮箱是否已注册，都是为了挡住
   * 「探测某个邮箱在不在站上」，那个列表把这两处防护一起作废了。
   *
   * 本人的邮箱走 getOwnAccount，那条路要求持有本人的令牌。
   */
  bio: string;
  city: string;
  createdAt: string;
  displayName: string;
  followerCount: number;
  followingCount: number;
  gender: Gender;
  id: string;
  postCount: number;
  province: string;
}>;

const toPublic = (account: Account, store: Store): PublicAccount => ({
  bio: account.bio ?? "",
  city: account.city ?? "",
  createdAt: account.createdAt,
  displayName: account.displayName,
  gender: account.gender ?? "secret",
  province: account.province ?? "",
  followerCount: store.follows.filter(
    (follow) => follow.followeeId === account.id,
  ).length,
  followingCount: store.follows.filter(
    (follow) => follow.followerId === account.id,
  ).length,
  id: account.id,
  postCount: store.posts.filter((post) => post.authorId === account.id).length,
});

export const registerAccount = (input: {
  displayName: string;
  email: string;
  now: string;
  password: string;
  /*
   * 带邮箱：注册的人就是这个账号本人，把他刚填的地址回给他不算泄漏。
   * 邮箱不能出现的地方是**列表**——见 PublicAccount 上的说明。
   */
}): { account: OwnAccount } | { error: string } => {
  const store = readStore();
  const email = input.email.trim().toLowerCase();
  /*
   * 注册这一侧也要有长度上限，理由和改邮箱那边一样：
   * 一个几 MB 的地址写进去，之后全站每次认证都要同步解析一份几 MB 的 JSON。
   */
  if (email.length > MAX_EMAIL_LENGTH) {
    return { error: "邮箱地址过长。" };
  }
  if (store.accounts.some((account) => account.email === email)) {
    return { error: "该邮箱已注册。" };
  }

  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    createdAt: input.now,
    displayName: input.displayName.trim(),
    email,
    id: `acct_${randomBytes(8).toString("hex")}`,
    passwordHash: hashPassword(input.password, salt),
    salt,
  };
  store.accounts.push(account);
  writeStore(store);
  return { account: { ...toPublic(account, store), email: account.email } };
};

export const authenticate = (input: {
  email: string;
  password: string;
  // 同上：登录成功即证明了身份，回给本人的那份可以带邮箱。
}): { account: OwnAccount } | { error: string } => {
  const store = readStore();
  const email = input.email.trim().toLowerCase();
  const account = store.accounts.find((candidate) => candidate.email === email);
  // 邮箱不存在与密码错误返回同一句话，避免暴露哪些邮箱已注册。
  if (account === undefined || !passwordMatches(input.password, account)) {
    return { error: "邮箱或密码不正确。" };
  }
  return { account: { ...toPublic(account, store), email: account.email } };
};

const MAX_BIO_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_REGION_LENGTH = 40;

/*
 * 编辑资料。
 *
 * 昵称、居住地、性别、简介。写进账号本身，而不是另存一份「资料」——
 * 另存一份就会出现主页显示旧昵称、设置页显示新昵称这种两处不一致。
 *
 * 只覆盖显式传入的字段：设置页分三个页签，一次只提交其中一部分，
 * 整条替换会把没在这一屏里的字段抹掉。
 */
export const updateProfile = (input: {
  accountId: string;
  bio?: string;
  city?: string;
  displayName?: string;
  gender?: string;
  province?: string;
}): { account: PublicAccount } | { error: string } => {
  const store = readStore();
  const index = store.accounts.findIndex(
    (account) => account.id === input.accountId,
  );
  const account = store.accounts[index];
  if (account === undefined) {
    return { error: "账号不存在，请先登录。" };
  }

  const displayName =
    input.displayName === undefined
      ? account.displayName
      : input.displayName.trim();
  if (
    displayName.length === 0 ||
    displayName.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    return { error: `昵称需要 1–${MAX_DISPLAY_NAME_LENGTH} 个字符。` };
  }

  const bio = input.bio === undefined ? (account.bio ?? "") : input.bio.trim();
  if (bio.length > MAX_BIO_LENGTH) {
    return { error: `个人简介不超过 ${MAX_BIO_LENGTH} 字。` };
  }

  const province =
    input.province === undefined
      ? (account.province ?? "")
      : input.province.trim();
  const city =
    input.city === undefined ? (account.city ?? "") : input.city.trim();
  if (province.length > MAX_REGION_LENGTH || city.length > MAX_REGION_LENGTH) {
    return { error: "居住地填写过长。" };
  }

  if (
    input.gender !== undefined &&
    !(genders as readonly string[]).includes(input.gender)
  ) {
    return { error: "无效的性别设置。" };
  }
  const gender =
    input.gender === undefined
      ? (account.gender ?? "secret")
      : (input.gender as Gender);

  store.accounts[index] = {
    ...account,
    bio,
    city,
    displayName,
    gender,
    province,
  };
  writeStore(store);
  return { account: toPublic(store.accounts[index], store) };
};

export const getTokenEpoch = (accountId: string): number =>
  readStore().accounts.find((account) => account.id === accountId)
    ?.tokenEpoch ?? 0;

const MINIMUM_PASSWORD_LENGTH = 12;

/*
 * 改密码。
 *
 * 设置页截图上只有「新密码 / 确认密码」两栏，没有旧密码——照着做会留下一个
 * 洞：任何拿到会话的人（借用的电脑、被偷的令牌）都能直接改掉密码，把真正的
 * 机主锁在外面。所以这里要求先验旧口令。
 *
 * 改成功后把令牌世代号 +1，此前签发的所有令牌立刻失效。少了这一步，
 * 「改密码」只挡住知道旧口令的人，而攻击者手上那张票还有七天有效期。
 */
export const changePassword = (input: {
  accountId: string;
  currentPassword: string;
  newPassword: string;
  now: string;
}): { tokenEpoch: number } | { error: string } => {
  const store = readStore();
  const index = store.accounts.findIndex(
    (account) => account.id === input.accountId,
  );
  const account = store.accounts[index];
  if (account === undefined) {
    return { error: "账号不存在，请先登录。" };
  }
  if (!passwordMatches(input.currentPassword, account)) {
    return { error: "当前密码不正确。" };
  }
  if (input.newPassword.length < MINIMUM_PASSWORD_LENGTH) {
    return { error: `新密码至少 ${MINIMUM_PASSWORD_LENGTH} 位。` };
  }
  if (input.newPassword === input.currentPassword) {
    return { error: "新密码不能与当前密码相同。" };
  }

  // 换新盐，不复用旧的：旧盐配新口令仍会让两次泄露之间存在可比性。
  const salt = randomBytes(16).toString("hex");
  store.accounts[index] = {
    ...account,
    passwordHash: hashPassword(input.newPassword, salt),
    salt,
    tokenEpoch: (account.tokenEpoch ?? 0) + 1,
  };
  writeStore(store);
  return { tokenEpoch: store.accounts[index].tokenEpoch ?? 0 };
};

/*
 * 修改登录邮箱。
 *
 * 账号绑定那一页上手机号与微信都接不了（没有短信通道、没有开放平台资质），
 * 唯一能做真的就是这一项。
 *
 * 必须验当前口令：改登录邮箱等于改登录入口。只凭一个已登录的会话就能改掉它，
 * 那么任何一次会话泄露都会直接变成账号被夺走——受害者连登录都做不到了。
 *
 * 不动 tokenEpoch：改邮箱不必让现有会话失效，那是改口令才需要做的事。
 */
/*
 * 邮箱长度上限，取 RFC 5321 的 254。
 *
 * 这不是洁癖：每一个带令牌的请求都会调 getTokenEpoch，而它是同步读整个
 * social-v1.json 再 JSON.parse。一个几 MB 的邮箱地址写进去之后，全站每次
 * 认证都要同步解析一份几 MB 的 JSON，事件循环直接被顶住。
 */
const MAX_EMAIL_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const changeEmail = (input: {
  accountId: string;
  currentPassword: string;
  newEmail: string;
}): { email: string } | { error: string } => {
  const store = readStore();
  const index = store.accounts.findIndex(
    (account) => account.id === input.accountId,
  );
  const account = store.accounts[index];
  if (account === undefined) {
    return { error: "账号不存在，请先登录。" };
  }
  if (!passwordMatches(input.currentPassword, account)) {
    return { error: "当前密码不正确。" };
  }

  const email = input.newEmail.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { error: "请填写一个有效的邮箱地址。" };
  }

  /*
   * 只跟**别人**比。改成自己现在这个地址不算冲突——否则「没改动就提交」
   * 会报一句莫名其妙的「该邮箱已被占用」。
   */
  const taken = store.accounts.some(
    (candidate) => candidate.email === email && candidate.id !== account.id,
  );
  if (taken) {
    return { error: "该邮箱已被其他账号使用。" };
  }

  store.accounts[index] = { ...account, email };
  writeStore(store);
  return { email };
};

export const getAccount = (accountId: string): PublicAccount | null => {
  const store = readStore();
  const account = store.accounts.find(
    (candidate) => candidate.id === accountId,
  );
  return account === undefined ? null : toPublic(account, store);
};

export const listAccounts = (): readonly PublicAccount[] => {
  const store = readStore();
  return store.accounts.map((account) => toPublic(account, store));
};

/** 本人视角的账号：比公开视图多一个登录邮箱。 */
export type OwnAccount = PublicAccount & Readonly<{ email: string }>;

/**
 * 本人的账号，含登录邮箱。
 *
 * 只应该用当前会话的 id 调用它。想看别人用 getAccount——那一条不带邮箱，
 * 而这个区分正是 /api/social/me 泄漏全站邮箱的修法：邮箱只跟着
 * 「我自己」这条路走，不跟着任何列表走。
 */
export const getOwnAccount = (accountId: string): OwnAccount | null => {
  const store = readStore();
  const account = store.accounts.find(
    (candidate) => candidate.id === accountId,
  );
  if (account === undefined) return null;
  return { ...toPublic(account, store), email: account.email };
};

export const createPost = (input: {
  accountId: string;
  body: string;
  disclosure?: PostDisclosure;
  now: string;
  quotedPostId?: string;
  title: string;
}): { post: Post } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }

  /*
   * 转发的原帖必须真实存在。
   *
   * 允许引用一个不存在的 id，会生成一条永远显示「原帖已删除」的转发——
   * 那是凭空造出来的坏数据，不是用户操作的结果。
   * 栏目帖子（post_syn_*）不在本存储里，所以只校验形如 post_<hex> 的
   * 用户帖；栏目帖子由调用方自己保证。
   */
  if (
    input.quotedPostId !== undefined &&
    /^post_[0-9a-f]{16}$/u.test(input.quotedPostId) &&
    !store.posts.some((post) => post.id === input.quotedPostId)
  ) {
    return { error: "被转发的帖子不存在。" };
  }

  const post: Post = {
    authorId: input.accountId,
    body: input.body.trim(),
    createdAt: input.now,
    id: `post_${randomBytes(8).toString("hex")}`,
    /*
     * 新记录明确写上这两个字段。读取端仍然给旧记录兜默认值——那是给
     * 存量数据的，不是让新数据也依赖默认。
     */
    kind: "discussion",
    status: "published",
    title: input.title.trim(),
    /*
     * 没加声明就不写这个键，而不是写一个 "none"。库里躺着一个表示
     * 「什么都没声明」的值，读取端迟早会把它当成一种声明显示出来。
     */
    ...(input.disclosure === undefined ? {} : { disclosure: input.disclosure }),
    ...(input.quotedPostId === undefined
      ? {}
      : { quotedPostId: input.quotedPostId }),
  };
  store.posts.unshift(post);
  writeStore(store);
  return { post };
};

/*
 * 读取端给旧记录补默认值。
 *
 * 存量帖子没有 kind 与 status 两个字段。不补的话它们会被当成草稿——
 * 整个社区的内容一夜之间从公开列表上消失，而数据其实完好无损。
 */
const withDefaults = (
  post: Post,
): Post & {
  kind: PostKind;
  status: PostStatus;
} => ({
  ...post,
  kind: post.kind ?? "discussion",
  status: post.status ?? "published",
});

const isPublished = (post: Post): boolean =>
  (post.status ?? "published") === "published";

/**
 * 存一份草稿。草稿只有作者自己看得见，不进任何公开列表。
 */
export const saveDraft = (input: {
  accountId: string;
  body: string;
  coverUrl?: string;
  disclosure?: PostDisclosure;
  kind: PostKind;
  now: string;
  postId?: string;
  title: string;
  visibility?: PostVisibility;
}): { post: Post } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }

  /* 给了 id 就是改已有那一条，而不是每存一次都多出一份。 */
  if (input.postId !== undefined) {
    const index = store.posts.findIndex((post) => post.id === input.postId);
    const existing = store.posts[index];
    if (existing === undefined) return { error: "草稿不存在。" };
    if (existing.authorId !== input.accountId) {
      return { error: "只能修改自己的草稿。" };
    }
    const updated: Post = {
      ...existing,
      body: input.body.trim(),
      kind: input.kind,
      status: "draft",
      title: input.title.trim(),
      updatedAt: input.now,
      ...(input.coverUrl === undefined ? {} : { coverUrl: input.coverUrl }),
      ...(input.disclosure === undefined
        ? {}
        : { disclosure: input.disclosure }),
      ...(input.visibility === undefined
        ? {}
        : { visibility: input.visibility }),
    };
    store.posts[index] = updated;
    writeStore(store);
    return { post: updated };
  }

  const post: Post = {
    authorId: input.accountId,
    body: input.body.trim(),
    createdAt: input.now,
    id: `post_${randomBytes(8).toString("hex")}`,
    kind: input.kind,
    status: "draft",
    title: input.title.trim(),
    updatedAt: input.now,
    ...(input.coverUrl === undefined ? {} : { coverUrl: input.coverUrl }),
    ...(input.disclosure === undefined ? {} : { disclosure: input.disclosure }),
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
  };
  store.posts.unshift(post);
  writeStore(store);
  return { post };
};

/**
 * 把草稿发出去。
 *
 * 改的是这一条的状态，不是新建一条——新建会在草稿箱里留下一份孤儿，
 * 而用户以为自己只发了一次。
 */
export const publishDraft = (input: {
  accountId: string;
  now: string;
  postId: string;
}): { post: Post } | { error: string } => {
  const store = readStore();
  const index = store.posts.findIndex((post) => post.id === input.postId);
  const existing = store.posts[index];
  if (existing === undefined) return { error: "草稿不存在。" };
  /* 只能发自己的。别人的草稿被发出去，作者甚至不会知道。 */
  if (existing.authorId !== input.accountId) {
    return { error: "只能发布自己的草稿。" };
  }

  const published: Post = {
    ...existing,
    createdAt: input.now,
    status: "published",
    updatedAt: input.now,
  };
  store.posts[index] = published;
  writeStore(store);
  return { post: published };
};

/** 某个作者的全部内容，草稿与已发布都算——这是创作者中心要看的那一份。 */
export const listAuthorPosts = (
  accountId: string,
): readonly (Post & { kind: PostKind; status: PostStatus })[] =>
  readStore()
    .posts.filter((post) => post.authorId === accountId)
    .map(withDefaults);

/**
 * 记一次浏览。
 *
 * 不存在的帖子不记：照记的话数据中心会凭空多出阅读量，而那个数字
 * 看不出是假的。
 */
export const countPostView = (input: { now: string; postId: string }): void => {
  const store = readStore();
  if (!store.posts.some((post) => post.id === input.postId)) return;

  const date = input.now.slice(0, 10);
  const index = store.views.findIndex(
    (view) => view.date === date && view.postId === input.postId,
  );
  const existing = store.views[index];
  if (existing === undefined) {
    store.views.push({ count: 1, date, postId: input.postId });
  } else {
    store.views[index] = { ...existing, count: existing.count + 1 };
  }
  writeStore(store);
};

/**
 * 一篇帖子的累计阅读量。
 *
 * 各天相加。只取最近一天的话，帖子页上的数字每到零点就掉回去，
 * 而读者会以为阅读量被清了。
 */
export const readPostViews = (postId: string): number =>
  readStore()
    .views.filter((view) => view.postId === postId)
    .reduce((total, view) => total + view.count, 0);

export type AuthorStats = Readonly<{
  bookmarkCount: number;
  commentCount: number;
  likeCount: number;
  publishedCount: number;
  totalViews: number;
  /** 按日聚合，键是 YYYY-MM-DD。 */
  viewsByDate: Readonly<Record<string, number>>;
}>;

/**
 * 一个作者的真实数据。
 *
 * 每一项都从库里数出来，没有估算：阅读量来自浏览记录，讨论/点赞/收藏
 * 来自各自的表。数不出来的（转发量、主页访问量）这里就没有——
 * 编一个填上去，比空着糟得多。
 */
export const readAuthorStats = (accountId: string): AuthorStats => {
  const store = readStore();
  const mine = new Set(
    store.posts
      .filter((post) => post.authorId === accountId)
      .map((post) => post.id),
  );

  const viewsByDate: Record<string, number> = {};
  let totalViews = 0;
  for (const view of store.views) {
    /* 只算自己帖子的浏览——串台是这一层最容易出的错。 */
    if (!mine.has(view.postId)) continue;
    viewsByDate[view.date] = (viewsByDate[view.date] ?? 0) + view.count;
    totalViews += view.count;
  }

  return {
    bookmarkCount: store.bookmarks.filter((row) => mine.has(row.postId)).length,
    commentCount: store.comments.filter((row) => mine.has(row.postId)).length,
    likeCount: store.likes.filter((row) => mine.has(row.postId)).length,
    publishedCount: store.posts.filter(
      (post) => post.authorId === accountId && isPublished(post),
    ).length,
    totalViews,
    viewsByDate,
  };
};

export const listPosts = (): readonly (Post & {
  authorName: string;
  likeCount: number;
})[] => {
  const store = readStore();
  /*
   * 草稿不进公开列表。
   *
   * 这是草稿这套东西最不能出的错：用户以为存着，其实已经发出去了，
   * 而列表上它和已发布的帖子长得一模一样，没有任何迹象。
   */
  return store.posts.filter(isPublished).map((post) => ({
    ...post,
    authorName:
      store.accounts.find((account) => account.id === post.authorId)
        ?.displayName ?? "已注销账号",
    // 赞数从 likes 现算，不另存计数器——存两份迟早对不上。
    likeCount: store.likes.filter((like) => like.postId === post.id).length,
  }));
};

export const setFollow = (input: {
  followeeId: string;
  followerId: string;
  following: boolean;
  now: string;
}): { followerCount: number } | { error: string } => {
  const store = readStore();
  if (input.followerId === input.followeeId) {
    return { error: "不能关注自己。" };
  }
  if (!store.accounts.some((account) => account.id === input.followerId)) {
    return { error: "账号不存在，请先登录。" };
  }

  /*
   * 被对方屏蔽就关注不了。
   *
   * 只挡新增、不挡取消：已经被屏蔽的人如果之前关注过，应当仍能自己取关，
   * 否则等于把他锁在一段自己无法解除的关系里。
   */
  if (input.following && blockedBy(store, input.followeeId, input.followerId)) {
    return { error: "你无法关注该用户。" };
  }

  const others = store.follows.filter(
    (follow) =>
      follow.followerId !== input.followerId ||
      follow.followeeId !== input.followeeId,
  );
  store.follows = input.following
    ? [
        ...others,
        {
          createdAt: input.now,
          followeeId: input.followeeId,
          followerId: input.followerId,
        },
      ]
    : others;
  writeStore(store);

  return {
    followerCount: store.follows.filter(
      (follow) => follow.followeeId === input.followeeId,
    ).length,
  };
};

export const listFollowing = (accountId: string): readonly string[] =>
  readStore()
    .follows.filter((follow) => follow.followerId === accountId)
    .map((follow) => follow.followeeId);

export const listFollowers = (accountId: string): readonly string[] =>
  readStore()
    .follows.filter((follow) => follow.followeeId === accountId)
    .map((follow) => follow.followerId);

export const getPost = (
  postId: string,
): (Post & { authorName: string }) | null => {
  const store = readStore();
  const post = store.posts.find((candidate) => candidate.id === postId);
  if (post === undefined) {
    return null;
  }
  return {
    ...post,
    authorName:
      store.accounts.find((account) => account.id === post.authorId)
        ?.displayName ?? "已注销账号",
  };
};

/*
 * 某人主页上的帖子。只列已发布的——草稿是私人的，出现在主页上等于
 * 未经作者同意就发出去了。作者自己的全部内容走 listAuthorPosts。
 */
export const listPostsByAuthor = (authorId: string): readonly Post[] =>
  readStore().posts.filter(
    (post) => post.authorId === authorId && isPublished(post),
  );

/**
 * 某只标的下的讨论，最新的在前。
 *
 * 标的页的讨论区此前只有一个发帖框，从不把这只标的下的帖子读回来——发出去
 * 的话在这一页上再也看不到，得自己去主页找。讨论区之所以叫讨论区，是因为
 * 能看见别人说了什么。
 *
 * 归属看的是正文里的 `$代码$` 标记，也就是发帖框写进去的那个形式。必须整段
 * 匹配：按子串找的话，`$sh6005$` 会把 `sh600519` 的讨论一并吸过来——
 * 两只毫不相干的标的，讨论混在一起，而界面上完全看不出来。
 */
export const listPostsBySymbol = (
  symbol: string,
): readonly (Post & { authorName: string })[] => {
  const tag = `$${symbol.toLowerCase()}$`;
  const store = readStore();
  return store.posts
    .filter((post) => post.body.toLowerCase().includes(tag))
    .map((post) => ({
      ...post,
      // 讨论区要显示作者名。只给一个 acct_ 开头的 id，读的人认不出是谁。
      authorName:
        store.accounts.find((account) => account.id === post.authorId)
          ?.displayName ?? "已注销账号",
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

/*
 * 屏蔽。
 *
 * 设置页上写着「已屏蔽用户不能对你进行关注、评论、私信等操作」，但屏蔽此前
 * 只存在浏览器 localStorage 里：换台设备就没了，服务端更是一无所知，那三个
 * 接口照样放行。也就是说那句话是假的——它只是把对方的内容从我这边藏起来，
 * 对方该关注关注、该私信私信。
 *
 * 落盘之后，拦截放在接口里执行；界面上的隐藏仍然保留，两者是不同层面的事。
 */
export const setBlock = (input: {
  blocked: boolean;
  blockedId: string;
  now: string;
  ownerId: string;
}): { blocked: readonly string[] } | { error: string } => {
  const store = readStore();
  if (input.ownerId === input.blockedId) {
    return { error: "不能屏蔽自己。" };
  }
  if (!store.accounts.some((account) => account.id === input.ownerId)) {
    return { error: "账号不存在，请先登录。" };
  }

  const others = store.blocks.filter(
    (block) =>
      block.ownerId !== input.ownerId || block.blockedId !== input.blockedId,
  );
  store.blocks = input.blocked
    ? [
        ...others,
        {
          blockedId: input.blockedId,
          createdAt: input.now,
          ownerId: input.ownerId,
        },
      ]
    : others;
  writeStore(store);

  return {
    blocked: store.blocks
      .filter((block) => block.ownerId === input.ownerId)
      .map((block) => block.blockedId),
  };
};

export const listBlocked = (
  ownerId: string,
): readonly (Block & { displayName: string })[] => {
  const store = readStore();
  return store.blocks
    .filter((block) => block.ownerId === ownerId)
    .map((block) => ({
      ...block,
      displayName:
        store.accounts.find((account) => account.id === block.blockedId)
          ?.displayName ?? "已注销账号",
    }));
};

/*
 * 评论权限。
 *
 * 默认所有人可评论——没设置过就该是最宽松的那档，而不是悄悄替用户收紧。
 */
export const getCommentPolicy = (accountId: string): CommentPolicy =>
  readStore().preferences.find(
    (preference) => preference.accountId === accountId,
  )?.commentPolicy ?? "everyone";

export const setCommentPolicy = (input: {
  accountId: string;
  now: string;
  policy: string;
}): { commentPolicy: CommentPolicy } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }
  // 只接受枚举内的取值：存进一个认不出的值，等于把评论权限变成未定义行为。
  if (!(commentPolicies as readonly string[]).includes(input.policy)) {
    return { error: "无效的评论权限设置。" };
  }
  const policy = input.policy as CommentPolicy;

  const existing = store.preferences.find(
    (preference) => preference.accountId === input.accountId,
  );
  store.preferences = [
    ...store.preferences.filter(
      (preference) => preference.accountId !== input.accountId,
    ),
    {
      accountId: input.accountId,
      commentPolicy: policy,
      /*
       * 保留已有的配色选择。
       *
       * 整条替换会把 marketColors 丢掉——用户改一下评论权限，涨跌配色就
       * 悄悄回到默认，而他根本没碰那个设置。两个字段互相不能覆盖。
       */
      ...(existing?.marketColors === undefined
        ? {}
        : { marketColors: existing.marketColors }),
      ...(existing?.mutedCategories === undefined
        ? {}
        : { mutedCategories: existing.mutedCategories }),
      updatedAt: input.now,
    },
  ];
  writeStore(store);
  return { commentPolicy: policy };
};

export const getMutedCategories = (
  accountId: string,
): readonly NotificationCategory[] =>
  readStore().preferences.find(
    (preference) => preference.accountId === accountId,
  )?.mutedCategories ?? [];

/*
 * 消息提醒设置。
 *
 * 关键在于这个设置要真的作用于通知列表——只把值存下来、通知照旧推送，
 * 那个开关就是个摆设：用户以为自己关掉了提醒，实际照收不误。
 * 过滤在 listNotifications 里做。
 */
export const setMutedCategories = (input: {
  accountId: string;
  categories: readonly string[];
  now: string;
}):
  { mutedCategories: readonly NotificationCategory[] } | { error: string } => {
  const store = readStore();
  const existing = store.preferences.find(
    (preference) => preference.accountId === input.accountId,
  );
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }

  const unknown = input.categories.filter(
    (category) =>
      !(notificationCategories as readonly string[]).includes(category),
  );
  // 认不出的分类直接拒绝：静默丢弃会让用户以为关掉了，其实没关。
  if (unknown.length > 0) {
    return { error: "无效的通知分类。" };
  }

  const muted = [
    ...new Set(input.categories as readonly NotificationCategory[]),
  ];
  store.preferences = [
    ...store.preferences.filter(
      (preference) => preference.accountId !== input.accountId,
    ),
    {
      accountId: input.accountId,
      // 与配色那次同理：不能把别的偏好覆盖成默认值。
      commentPolicy: existing?.commentPolicy ?? "everyone",
      ...(existing?.marketColors === undefined
        ? {}
        : { marketColors: existing.marketColors }),
      mutedCategories: muted,
      updatedAt: input.now,
    },
  ];
  writeStore(store);
  return { mutedCategories: muted };
};

export const getMarketColors = (accountId: string): MarketColorMode =>
  readStore().preferences.find(
    (preference) => preference.accountId === accountId,
  )?.marketColors ?? "red-up";

/*
 * 配色也存在账号下，换台设备仍然是自己选的那套。
 *
 * 界面同时会写一份 localStorage，那是给首帧预涂用的——不预涂的话，设成
 * 绿涨红跌的人会先看到一帧红色再翻绿，而那一帧传达的信息完全相反。
 * 两处都写，职责不同：本地负责快，账号负责跨设备。
 */
export const setMarketColors = (input: {
  accountId: string;
  mode: string;
  now: string;
}): { marketColors: MarketColorMode } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }
  if (!(marketColorModes as readonly string[]).includes(input.mode)) {
    return { error: "无效的涨跌配色设置。" };
  }
  const mode = input.mode as MarketColorMode;

  const existing = store.preferences.find(
    (preference) => preference.accountId === input.accountId,
  );
  store.preferences = [
    ...store.preferences.filter(
      (preference) => preference.accountId !== input.accountId,
    ),
    {
      accountId: input.accountId,
      // 不能把已有的评论权限覆盖成默认值——那会在用户改配色时悄悄放开评论。
      commentPolicy: existing?.commentPolicy ?? "everyone",
      marketColors: mode,
      ...(existing?.mutedCategories === undefined
        ? {}
        : { mutedCategories: existing.mutedCategories }),
      updatedAt: input.now,
    },
  ];
  writeStore(store);
  return { marketColors: mode };
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/*
 * 按作者设定的权限判断某人能不能评论。
 *
 * 「我关注的人」看的是作者关注了谁；「关注我的人」看的是谁关注了作者。
 * 两者方向相反，写反了会让设置的效果恰好颠倒，而界面上完全看不出来。
 */
const commentAllowed = (
  store: Store,
  authorId: string,
  actorId: string,
  now: string,
): boolean => {
  // 作者永远能评论自己的帖子，任何设置都不该把自己挡在外面。
  if (authorId === actorId) return true;

  const policy =
    store.preferences.find((preference) => preference.accountId === authorId)
      ?.commentPolicy ?? "everyone";

  if (policy === "everyone") return true;
  if (policy === "off") return false;

  if (policy === "following") {
    return store.follows.some(
      (follow) =>
        follow.followerId === authorId && follow.followeeId === actorId,
    );
  }

  const follow = store.follows.find(
    (candidate) =>
      candidate.followerId === actorId && candidate.followeeId === authorId,
  );
  if (follow === undefined) return false;
  if (policy === "followers") return true;

  const followedAt = new Date(follow.createdAt).getTime();
  const moment = new Date(now).getTime();
  // 时间解析不出来时按不满足处理：宁可挡住，也不要因为一个坏时间戳放行。
  if (Number.isNaN(followedAt) || Number.isNaN(moment)) return false;
  return moment - followedAt >= THREE_DAYS_MS;
};

/** actor 是否被 owner 屏蔽了。屏蔽单向：owner 拉黑 actor，不影响反向。 */
const blockedBy = (store: Store, ownerId: string, actorId: string): boolean =>
  store.blocks.some(
    (block) => block.ownerId === ownerId && block.blockedId === actorId,
  );

export const isBlocked = (ownerId: string, actorId: string): boolean =>
  blockedBy(readStore(), ownerId, actorId);

const MAX_COMMENT_LENGTH = 2000;

/*
 * 评论。
 *
 * 评论此前和点赞同病：只存在客户端 reducer 里，id 形如 comment_session_1，
 * 刷新即失、别人看不到。署名上一轮已经改成真人，但内容留不下来，于是
 * 「回复我的」这一类只能靠转发撑着。
 */
export const createComment = (input: {
  accountId: string;
  body: string;
  now: string;
  parentId?: string;
  postId: string;
}): { comment: Comment } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }

  const body = input.body.trim();
  if (body.length === 0) {
    return { error: "请输入评论内容后再发布。" };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return { error: "评论内容过长。" };
  }

  // 与转发、点赞一致：只校验本存储里的用户帖，栏目帖不在这里。
  const target = store.posts.find((post) => post.id === input.postId);
  if (/^post_[0-9a-f]{16}$/u.test(input.postId) && target === undefined) {
    return { error: "帖子不存在。" };
  }

  /*
   * 被作者屏蔽的人评论不进去。
   *
   * 设置页承诺「已屏蔽用户不能对你进行关注、评论、私信等操作」，这一句
   * 必须在这里兑现——只在界面上把对方的内容藏起来，对方照样能在我帖子下
   * 留言，那句话就是假的。
   */
  if (
    target !== undefined &&
    blockedBy(store, target.authorId, input.accountId)
  ) {
    return { error: "你无法在该用户的内容下发表评论。" };
  }

  /*
   * 作者设定的评论权限在这里兑现。
   *
   * 隐私设置页让人从五档里选一档，如果只是把选择存下来而不在这里执行，
   * 那个单选框就是个摆设——用户以为自己关掉了评论，其实谁都还能评。
   */
  if (
    target !== undefined &&
    !commentAllowed(store, target.authorId, input.accountId, input.now)
  ) {
    return { error: "作者限制了评论范围，你暂时无法评论。" };
  }

  /*
   * 被回复的评论必须真实存在，且必须属于同一条帖子。
   *
   * 少了后半个条件，就能把一条评论挂到另一条帖子的评论树下——详情页会
   * 渲染出一条没有上文的回复，看起来像数据错乱。
   */
  if (input.parentId !== undefined) {
    const parent = store.comments.find(
      (comment) => comment.id === input.parentId,
    );
    if (parent === undefined || parent.postId !== input.postId) {
      return { error: "被回复的评论不存在。" };
    }
  }

  const comment: Comment = {
    authorId: input.accountId,
    body,
    createdAt: input.now,
    id: `comment_${randomBytes(8).toString("hex")}`,
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    postId: input.postId,
  };
  store.comments.push(comment);
  writeStore(store);
  return { comment };
};

export const listComments = (
  postId: string,
): readonly (Comment & { authorName: string })[] => {
  const store = readStore();
  return store.comments
    .filter((comment) => comment.postId === postId)
    .map((comment) => ({
      ...comment,
      authorName:
        store.accounts.find((account) => account.id === comment.authorId)
          ?.displayName ?? "已注销账号",
    }))
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
};

export const countComments = (postId: string): number =>
  readStore().comments.filter((comment) => comment.postId === postId).length;

/*
 * 点赞。
 *
 * 此前点赞只活在客户端会话里：刷新即失，别人也看不到，于是「赞我的」这个
 * 分类永远是空的——不是没人赞，是赞根本没留下过。
 *
 * 一个账号对一条帖子只算一次，用 (accountId, postId) 去重；再点一次是取消。
 */
export const setLike = (input: {
  accountId: string;
  liked: boolean;
  now: string;
  postId: string;
}): { likeCount: number } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }

  /*
   * 只校验本存储里的用户帖。栏目帖子（post_syn_*）不在这里，
   * 允许它们被赞，但不校验存在性——和转发那里的处理保持一致。
   */
  if (
    /^post_[0-9a-f]{16}$/u.test(input.postId) &&
    !store.posts.some((post) => post.id === input.postId)
  ) {
    return { error: "帖子不存在。" };
  }

  const others = store.likes.filter(
    (like) =>
      like.accountId !== input.accountId || like.postId !== input.postId,
  );
  store.likes = input.liked
    ? [
        ...others,
        {
          accountId: input.accountId,
          createdAt: input.now,
          postId: input.postId,
        },
      ]
    : others;
  writeStore(store);

  return {
    likeCount: store.likes.filter((like) => like.postId === input.postId)
      .length,
  };
};

/*
 * 收藏。
 *
 * 个人主页有「收藏」页签，此前没有任何存储支撑它——页签在那里，点开永远是空的。
 * 与点赞同构：(accountId, postId) 去重，再点即取消。
 */
export const setBookmark = (input: {
  accountId: string;
  bookmarked: boolean;
  now: string;
  postId: string;
}): { bookmarkCount: number } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }
  if (
    /^post_[0-9a-f]{16}$/u.test(input.postId) &&
    !store.posts.some((post) => post.id === input.postId)
  ) {
    return { error: "帖子不存在。" };
  }

  const others = store.bookmarks.filter(
    (bookmark) =>
      bookmark.accountId !== input.accountId ||
      bookmark.postId !== input.postId,
  );
  store.bookmarks = input.bookmarked
    ? [
        ...others,
        {
          accountId: input.accountId,
          createdAt: input.now,
          postId: input.postId,
        },
      ]
    : others;
  writeStore(store);

  return {
    bookmarkCount: store.bookmarks.filter(
      (bookmark) => bookmark.accountId === input.accountId,
    ).length,
  };
};

/** 当前账号收藏过哪些帖子——界面据此把按钮显示为已收藏。 */
export const listBookmarkedPostIds = (accountId: string): readonly string[] =>
  readStore()
    .bookmarks.filter((bookmark) => bookmark.accountId === accountId)
    .map((bookmark) => bookmark.postId);

/*
 * 自选上限。
 *
 * 不设上限的话，一次请求就能往库里塞进任意多条——文件存储会被撑爆，而且
 * 每次取自选都要为它们批量拉行情。这个数字比任何人手动维护的自选都宽裕。
 */
const MAX_WATCHLIST = 300;

export const setWatchlisted = (input: {
  accountId: string;
  now: string;
  symbol: string;
  watchlisted: boolean;
}): { symbols: readonly string[] } | { error: string } => {
  const store = readStore();
  if (!store.accounts.some((account) => account.id === input.accountId)) {
    return { error: "账号不存在，请先登录。" };
  }

  const others = store.watchlist.filter(
    (entry) =>
      entry.accountId !== input.accountId || entry.symbol !== input.symbol,
  );

  if (input.watchlisted) {
    const mine = others.filter((entry) => entry.accountId === input.accountId);
    if (mine.length >= MAX_WATCHLIST) {
      return { error: `自选最多 ${String(MAX_WATCHLIST)} 只。` };
    }
    store.watchlist = [
      ...others,
      {
        accountId: input.accountId,
        createdAt: input.now,
        symbol: input.symbol,
      },
    ];
  } else {
    store.watchlist = others;
  }

  writeStore(store);

  return {
    symbols: store.watchlist
      .filter((entry) => entry.accountId === input.accountId)
      .map((entry) => entry.symbol),
  };
};

/*
 * 当前账号的自选代码，按加入时间正序。
 *
 * 顺序要稳定：按加入先后排，用户看到的次序才和他添加的次序一致。依赖
 * 文件里的物理顺序是不行的——删掉中间一条再加回来，它会跑到末尾。
 */
export const listWatchlistSymbols = (accountId: string): readonly string[] =>
  readStore()
    .watchlist.filter((entry) => entry.accountId === accountId)
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((entry) => entry.symbol);

/** 我收藏的帖子，最新在前；已被删除的原帖不会出现在结果里。 */
export const listBookmarkedPosts = (
  accountId: string,
): readonly (Post & { authorName: string })[] => {
  const store = readStore();
  const mine = store.bookmarks.filter(
    (bookmark) => bookmark.accountId === accountId,
  );
  return mine
    .flatMap((bookmark) => {
      const post = store.posts.find(
        (candidate) => candidate.id === bookmark.postId,
      );
      return post === undefined
        ? []
        : [
            {
              ...post,
              authorName:
                store.accounts.find((account) => account.id === post.authorId)
                  ?.displayName ?? "已注销账号",
            },
          ];
    })
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
};

/*
 * 我发过的评论，供个人主页「回复」页签。
 *
 * 一并带出所在帖子的标题，否则列表里只有一句孤零零的评论，读者不知道
 * 它是在回应什么。
 */
export const listCommentsByAuthor = (
  authorId: string,
): readonly (Comment & { postTitle: string })[] => {
  const store = readStore();
  return store.comments
    .filter((comment) => comment.authorId === authorId)
    .map((comment) => ({
      ...comment,
      postTitle:
        store.posts.find((post) => post.id === comment.postId)?.title ??
        "原帖已不存在",
    }))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const countLikes = (postId: string): number =>
  readStore().likes.filter((like) => like.postId === postId).length;

/** 当前账号赞过哪些帖子——界面据此把按钮显示为已赞。 */
export const listLikedPostIds = (accountId: string): readonly string[] =>
  readStore()
    .likes.filter((like) => like.accountId === accountId)
    .map((like) => like.postId);

export type RealNotification = Readonly<{
  actorName: string;
  category: "follows" | "likes" | "replies";
  createdAt: string;
  href: string;
  id: string;
  isRead: boolean;
  kind: "comment" | "follow" | "like" | "quote";
  summary: string;
  targetLabel: string;
}>;

/*
 * 从真实事件推导通知。
 *
 * 通知页此前整页都是虚构角色的固定样本：真实账号被真人关注了，通知里什么
 * 都没有，却挂着「北岸观察员回复了你的讨论」。事件明明已经落在库里，只是
 * 没人去读。
 *
 * 只推导库里真实存在的四类，不为了凑满分类去造第五类：
 *   关注 —— follows 里 followeeId 是我的
 *   转发 —— posts 里 quotedPostId 指向我的帖子
 *   点赞 —— likes 里 postId 是我的帖子
 *   评论 —— comments 里 postId 是我的帖子
 *
 * 「@」目前没有对应的真实数据，所以那一类一条都不产出——宁可空着，
 * 也不造几条假的填进去。
 *
 * 私信也不进通知：站内已有独立的 /messages 页和它自己的未读徽标，
 * 同一件事在两处各报一遍，用户会以为有两条待办。
 */
export const listNotifications = (
  accountId: string,
): readonly RealNotification[] => {
  const store = readStore();
  const nameOf = (id: string): string =>
    store.accounts.find((account) => account.id === id)?.displayName ??
    "已注销用户";

  const myPostIds = new Set(
    store.posts
      .filter((post) => post.authorId === accountId)
      .map((post) => post.id),
  );

  const follows: RealNotification[] = store.follows
    .filter((follow) => follow.followeeId === accountId)
    .map((follow) => ({
      actorName: nameOf(follow.followerId),
      category: "follows",
      createdAt: follow.createdAt,
      href: `/users/${follow.followerId}`,
      id: `notification_follow_${follow.followerId}`,
      // 关注没有已读概念，恒为已读，免得徽标上挂一个永远消不掉的数字。
      isRead: true,
      kind: "follow",
      summary: "关注了你",
      targetLabel: nameOf(follow.followerId),
    }));

  const quotes: RealNotification[] = store.posts
    .filter(
      (post) =>
        post.quotedPostId !== undefined &&
        myPostIds.has(post.quotedPostId) &&
        post.authorId !== accountId,
    )
    .map((post) => ({
      actorName: nameOf(post.authorId),
      category: "replies",
      createdAt: post.createdAt,
      href: `/community/posts/${post.id}`,
      id: `notification_quote_${post.id}`,
      isRead: true,
      kind: "quote",
      summary: post.body.slice(0, 60),
      targetLabel: post.title,
    }));

  const titleOf = (postId: string): string =>
    store.posts.find((post) => post.id === postId)?.title ?? "我的帖子";

  const likes: RealNotification[] = store.likes
    .filter(
      (like) => myPostIds.has(like.postId) && like.accountId !== accountId,
    )
    .map((like) => ({
      actorName: nameOf(like.accountId),
      category: "likes",
      createdAt: like.createdAt,
      href: `/community/posts/${like.postId}`,
      id: `notification_like_${like.accountId}_${like.postId}`,
      isRead: true,
      kind: "like",
      summary: titleOf(like.postId),
      targetLabel: titleOf(like.postId),
    }));

  const comments: RealNotification[] = store.comments
    .filter(
      (comment) =>
        myPostIds.has(comment.postId) && comment.authorId !== accountId,
    )
    .map((comment) => ({
      actorName: nameOf(comment.authorId),
      category: "replies",
      createdAt: comment.createdAt,
      href: `/community/posts/${comment.postId}`,
      id: `notification_comment_${comment.id}`,
      isRead: true,
      kind: "comment",
      summary: comment.body.slice(0, 60),
      targetLabel: titleOf(comment.postId),
    }));

  /*
   * 关掉的分类不出现在结果里。
   *
   * 过滤放在这里而不是界面：只在界面藏起来，未读计数照样会跳，
   * 徽标上挂着一个点开什么都没有的数字。
   */
  const muted = new Set(
    store.preferences.find((preference) => preference.accountId === accountId)
      ?.mutedCategories ?? [],
  );

  return [...follows, ...quotes, ...likes, ...comments]
    .filter((notification) => !muted.has(notification.category))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
};

/**
 * 关注计数按标的方查询。目标不必是本机账号——社区里的编辑账号也能被关注，
 * 所以这里不校验 followeeId 是否存在于 accounts。
 */
/*
 * 私信。
 *
 * 消息中心过去只有回复/提到/赞/系统四类，连私信分类都没有——而雪球的
 * 消息中心第一个 tab 就是私信。这里补上最小可用的一对一会话。
 *
 * 只在注册账号之间收发：栏目账号没有人在operating，给它发消息不会有人回，
 * 那种「发得出去但永远没有回应」的入口是另一种假。
 */
export const sendMessage = (input: {
  body: string;
  fromId: string;
  now: string;
  toId: string;
}): { message: Message } | { error: string } => {
  const store = readStore();
  const body = input.body.trim();
  if (body.length === 0) {
    return { error: "私信内容不能为空。" };
  }
  if (body.length > 2000) {
    return { error: "私信内容过长。" };
  }
  if (input.fromId === input.toId) {
    return { error: "不能给自己发私信。" };
  }
  const known = (id: string): boolean =>
    store.accounts.some((account) => account.id === id);
  if (!known(input.fromId)) {
    return { error: "账号不存在，请先登录。" };
  }
  if (!known(input.toId)) {
    return { error: "对方不是本机注册账号，无法接收私信。" };
  }

  // 被对方屏蔽就发不进去——设置页承诺的三件事里的第三件。
  if (blockedBy(store, input.toId, input.fromId)) {
    return { error: "你无法给该用户发送私信。" };
  }

  const message: Message = {
    body,
    createdAt: input.now,
    fromId: input.fromId,
    id: `msg_${randomBytes(8).toString("hex")}`,
    readAt: null,
    toId: input.toId,
  };
  store.messages.push(message);
  writeStore(store);
  return { message };
};

export type Conversation = Readonly<{
  lastBody: string;
  lastAt: string;
  partnerId: string;
  partnerName: string;
  unread: number;
}>;

export const listConversations = (
  accountId: string,
): readonly Conversation[] => {
  const store = readStore();
  const mine = store.messages.filter(
    (message) => message.fromId === accountId || message.toId === accountId,
  );

  const byPartner = new Map<string, Message[]>();
  for (const message of mine) {
    const partnerId =
      message.fromId === accountId ? message.toId : message.fromId;
    byPartner.set(partnerId, [...(byPartner.get(partnerId) ?? []), message]);
  }

  return [...byPartner.entries()]
    .map(([partnerId, messages]) => {
      const ordered = messages.toSorted((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
      const last = ordered.at(-1) as Message;
      return {
        lastAt: last.createdAt,
        lastBody: last.body,
        partnerId,
        partnerName:
          store.accounts.find((account) => account.id === partnerId)
            ?.displayName ?? "已注销账号",
        unread: ordered.filter(
          (message) => message.toId === accountId && message.readAt === null,
        ).length,
      };
    })
    .toSorted((left, right) => right.lastAt.localeCompare(left.lastAt));
};

export const listThread = (
  accountId: string,
  partnerId: string,
): readonly Message[] =>
  readStore()
    .messages.filter(
      (message) =>
        (message.fromId === accountId && message.toId === partnerId) ||
        (message.fromId === partnerId && message.toId === accountId),
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));

/** 打开会话即把对方发来的消息标为已读。 */
export const markThreadRead = (
  accountId: string,
  partnerId: string,
  now: string,
): void => {
  const store = readStore();
  let changed = false;
  store.messages = store.messages.map((message) => {
    if (
      message.toId === accountId &&
      message.fromId === partnerId &&
      message.readAt === null
    ) {
      changed = true;
      return { ...message, readAt: now };
    }
    return message;
  });
  // 没有变化就不落盘，避免每次打开会话都写一次文件。
  if (changed) {
    writeStore(store);
  }
};

export const countFollowers = (followeeId: string): number =>
  readStore().follows.filter((follow) => follow.followeeId === followeeId)
    .length;
