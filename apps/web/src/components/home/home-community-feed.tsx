"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useAccountSession } from "../../features/account/account-session";
import { useOptionalHomeView } from "./home-view-context";

const channels = [
  "关注",
  "热门",
  "7x24",
  "自选",
  "视频",
  "基金",
  "资讯",
  "达人",
  "私募",
  "ETF",
] as const;
type HomeChannel = (typeof channels)[number];

type HomePost = Readonly<{
  author: string;
  avatar: string;
  channel: HomeChannel;
  commentCount: number;
  content: string;
  id: string;
  likeCount: number;
  meta: string;
  shareCount: number;
  title: string;
}>;

type PostActionIconName = "comment" | "favorite" | "like" | "report" | "share";

const reportReasons = [
  "时政有害",
  "非法荐股",
  "广告营销",
  "涉企侵权",
  "其他侵权（非涉企）",
  "造谣传谣",
  "辱骂引战",
  "财经类信息违规",
  "色情低俗",
  "恶意蹭流量",
  "低质不相关内容",
  "其他违法违规",
] as const;
type ReportReason = (typeof reportReasons)[number];

const reportDetails: Partial<Record<ReportReason, readonly string[]>> = {
  时政有害: ["涉政敏感", "歪曲历史", "损害国家形象", "其他"],
  广告营销: ["违规推广", "诱导交易", "联系方式导流", "其他"],
  涉企侵权: ["商誉诋毁", "虚假陈述", "泄露商业秘密", "其他涉企侵权"],
  "其他侵权（非涉企）": [
    "网络暴力",
    "抄袭洗稿",
    "侵犯个人隐私",
    "侵犯个人名誉",
    "其他侵权",
  ],
  造谣传谣: ["虚假信息", "来源不实", "误导性标题", "其他"],
  辱骂引战: ["人身攻击", "群体攻击", "挑衅引战", "其他"],
  财经类信息违规: ["虚假财经信息", "操纵市场信息", "未披露利益关系", "其他"],
  色情低俗: ["色情内容", "低俗暗示", "不雅内容", "其他"],
  恶意蹭流量: ["无关热点", "标题党", "批量重复", "其他"],
  低质不相关内容: ["内容重复", "与话题无关", "机器拼接", "其他"],
  其他违法违规: ["侵害未成年人权益", "历史虚无主义", "算法推荐违规", "其他"],
};

type ComposerIconName =
  "emoji" | "image" | "mention" | "topic" | "stock" | "notice";

const composerTools: readonly Readonly<{
  label: string;
  name: ComposerIconName;
}>[] = [
  { label: "表情", name: "emoji" },
  { label: "图片", name: "image" },
  { label: "提及用户", name: "mention" },
  { label: "话题", name: "topic" },
  { label: "股票", name: "stock" },
  { label: "风险提示", name: "notice" },
];

function ComposerIcon({ name }: Readonly<{ name: ComposerIconName }>) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
  } as const;
  if (name === "emoji") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 14.2c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01" />
      </svg>
    );
  }
  if (name === "image") {
    return (
      <svg {...common}>
        <rect height="16" rx="2" width="18" x="3" y="4" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m5.5 17 4-4 3 2.5 2.5-2 3.5 3.5" />
      </svg>
    );
  }
  if (name === "mention") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M15.5 9.5v4a2 2 0 0 0 4 0V12a7.5 7.5 0 1 0-2.2 5.3" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === "topic") {
    return (
      <svg {...common}>
        <path d="M9 3 7 21M17 3l-2 18M4 9h16M3 15h16" />
      </svg>
    );
  }
  if (name === "stock") {
    return (
      <svg {...common}>
        <path d="M13.5 3 8 21M18.5 3 13 21" />
        <path d="M5 8h11M4 16h11" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v6M12 16.5v.1" />
    </svg>
  );
}

function PostActionIcon({
  filled = false,
  name,
}: Readonly<{ filled?: boolean; name: PostActionIconName }>) {
  const common = {
    "aria-hidden": true,
    className: "home-post-action-icon",
    viewBox: "0 0 24 24",
  } as const;

  if (name === "share") {
    return (
      <svg {...common}>
        <path d="M9 6H6.8A2.8 2.8 0 0 0 4 8.8v8.4A2.8 2.8 0 0 0 6.8 20h8.4a2.8 2.8 0 0 0 2.8-2.8V15" />
        <path d="M12 4h8v8M20 4l-9 9" />
      </svg>
    );
  }
  if (name === "comment") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 10h7M8.5 14h4.5" />
      </svg>
    );
  }
  if (name === "like") {
    return (
      <svg {...common} className="home-post-action-icon home-post-like-icon">
        <path
          className={filled ? "is-filled" : undefined}
          d="M9.2 20H6.4A2.4 2.4 0 0 1 4 17.6v-6.2A2.4 2.4 0 0 1 6.4 9h2.8l2.1-4.8c.35-.8 1.12-1.32 2-1.32 1.28 0 2.25 1.1 2.08 2.36L14.9 9h3.34a2.7 2.7 0 0 1 2.64 3.26l-1.14 5.4A3 3 0 0 1 16.8 20H9.2Z"
        />
        <path d="M9.2 9v11" />
      </svg>
    );
  }
  if (name === "favorite") {
    return (
      <svg
        {...common}
        className="home-post-action-icon home-post-favorite-icon"
      >
        <path
          className={filled ? "is-filled" : undefined}
          d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3Z"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3.3 21 20H3L12 3.3Z" />
      <path d="M12 9v5M12 17.2v.2" />
    </svg>
  );
}

const postComments = [
  {
    author: "为霜",
    avatar: "霜",
    content:
      "公开讨论最有价值的地方，是把论据、价格与时间范围说清楚。短期波动并不能替代长期判断，仍要持续看后续兑现。",
    meta: "修改于 08:41 · 广东",
  },
  {
    author: "静水深流",
    avatar: "静",
    content: "同意把不同周期拆开看。信息变化时修正判断，比坚持一个结论更重要。",
    meta: "10 分钟前 · 上海",
  },
] as const;

const feedPosts: readonly HomePost[] = [
  {
    author: "陆家嘴幽灵",
    avatar: "陆",
    channel: "热门",
    commentCount: 84,
    content:
      "昨夜美股再现分化，宏观数据扰动下，大型科技股多数承压，但 AI 算力基础设施的底层需求仍在超预期爆发。海力士、闪迪分别上涨，光通信厂商也出现明显分化。短期价格扰动不改变长期需求，真正需要持续观察的是订单兑现、资本开支与供应链交付节奏。",
    id: "lumentum-notes",
    likeCount: 59,
    meta: "9 小时前 · 来自火球",
    shareCount: 9,
    title: "对 Lumentum 财报解读与光模块思考",
  },
  {
    author: "我怀念1998",
    avatar: "怀",
    channel: "热门",
    commentCount: 80,
    content:
      "COHR 电话会几个要点。\n1. CPO 需求强劲，没有延期。\n每一个大型战略客户都有 CPO 或 NPO 项目，有些客户同时拥有 CPO 和 NPO 项目，过去 3–6 个月相关合作需求提升明显。管理层没有对两者进行分别说明，整场会议基本都是将 CPO 和 NPO 混在一起说，这也表明管理层的视角更多是从自身订单出发。",
    id: "cohr-call",
    likeCount: 123,
    meta: "2 小时前 · 来自 Android",
    shareCount: 1,
    title: "光通信产业链跟踪笔记",
  },
  {
    author: "学知利行",
    avatar: "知",
    channel: "资讯",
    commentCount: 36,
    content:
      "从公开数据看，行业收入仍在中速增长，客户黏性保持稳定，管理层在分红和回购上的取舍值得继续观察。单个季度的数据容易被基数影响，更适合把现金流、利润率与用户结构放在连续几个季度里一起判断。",
    id: "tencent-public-data",
    likeCount: 88,
    meta: "52 分钟前 · 来自 Android",
    shareCount: 4,
    title: "腾讯控股四季度公开信息整理",
  },
  {
    author: "水库研究员",
    avatar: "水",
    channel: "基金",
    commentCount: 18,
    content:
      "市场风格转换期，需要把短期净值波动和长期能力圈分开观察，避免用单一阶段的排名替代完整判断。",
    id: "fund-style",
    likeCount: 42,
    meta: "1 小时前 · 来自火球",
    shareCount: 3,
    title: "主动基金经理的风格稳定性",
  },
  {
    author: "指数笔记",
    avatar: "指",
    channel: "ETF",
    commentCount: 22,
    content:
      "ETF 的核心仍是工具属性：低成本、高透明和易于再平衡。用户需要先确定配置目标，再比较跟踪误差与流动性。",
    id: "etf-basics",
    likeCount: 67,
    meta: "3 小时前 · 来自 Web",
    shareCount: 6,
    title: "如何用 ETF 完成基础仓配置",
  },
  {
    author: "一颗正经的流星",
    avatar: "流",
    channel: "达人",
    commentCount: 0,
    content:
      "朋友说：低仓位做，实现总仓位 30% 收益感觉很难吧。回答到：达不到也无所谓，超过也可以。对我而言，熊市和牛市用的交易方法不同，记录过程，不供任何人参考。",
    id: "expert-position-notes",
    likeCount: 128,
    meta: "08-10 14:01 · 来自火球",
    shareCount: 0,
    title: "低仓位与长期交易方法",
  },
  {
    author: "泡沫艺术家",
    avatar: "泡",
    channel: "达人",
    commentCount: 32,
    content:
      "支撑位是贪婪，击破支撑位是恐惧；阻力位是恐惧，击破阻力位是贪婪。技术分析研究的是市场心理博弈，K 线只是价格留下的痕迹。",
    id: "expert-support-resistance",
    likeCount: 127,
    meta: "08-09 16:50 · 来自火球",
    shareCount: 7,
    title: "专栏｜支撑位与阻力位，K 线背后的心理博弈",
  },
  {
    author: "7X24快讯",
    avatar: "讯",
    channel: "资讯",
    commentCount: 17,
    content:
      "我国加快推动新一代通信网建设，推动相关基础设施升级与前沿技术创新，持续完善空天地海一体化信息通信布局。公开资料显示，多项试点已进入验证阶段。",
    id: "news-network",
    likeCount: 42,
    meta: "昨天 20:22 · 来自火球",
    shareCount: 0,
    title: "新闻联播：我国加快推动新一代通信网建设",
  },
  {
    author: "泽元投资",
    avatar: "泽",
    channel: "私募",
    commentCount: 178,
    content:
      "过去三个月美国政府举债规模继续扩大，经济尚未正式步入衰退，但高额负债令人警惕。平均期限越短，每年需要续发置换的到期债务越多，需要持续观察利率和流动性。",
    id: "private-debt-note",
    likeCount: 207,
    meta: "08-09 11:55 · 来自火球",
    shareCount: 7,
    title: "美债期限结构与流动性观察",
  },
  {
    author: "behavioral",
    avatar: "行",
    channel: "ETF",
    commentCount: 7,
    content:
      "纳指科技 ETF 的调整更多体现工具本身的指数规则。配置前应看清底层持仓、跟踪误差与再平衡机制，而不是只依据短期情绪做判断。",
    id: "etf-index-rule",
    likeCount: 7,
    meta: "08-08 10:44 · 来自 iPhone",
    shareCount: 0,
    title: "纳指科技 ETF 调整与指数规则",
  },
];

const liveItems = [
  ["07:01", "秘鲁央行维持参考利率在4.25%不变。"],
  [
    "06:53",
    "新平台让 AI 芯片更紧凑、高速且节能，日本东京科学大学研究团队公布新型半导体集成平台。",
  ],
  [
    "06:52",
    "量子存储器间纠缠距离提升至420公里，城际尺度量子网络研究取得新进展。",
  ],
  ["06:15", "今年以来近百家公司完成定增，合计募资逾1690亿元。"],
] as const;

function LiveTimeline() {
  return (
    <section className="home-live-channel" aria-label="7x24快讯">
      <h2>今天</h2>
      <ol>
        {liveItems.map(([time, content], index) => (
          <li key={time}>
            <time>{time}</time>
            <i aria-hidden="true" />
            <p className={index === 1 ? "is-featured" : undefined}>{content}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WatchlistNews() {
  const homeView = useOptionalHomeView();
  const [filter, setFilter] = useState<"全部" | "公告" | "新闻">("全部");
  const selected =
    homeView?.addedOptionalEntries.filter((entry) => entry.type === "stock") ??
    [];
  const names = selected.length
    ? selected.slice(0, 3).map((entry) => [entry.name, entry.symbol] as const)
    : ([
        ["爱尔眼科", "SZ300015"],
        ["分众传媒", "SZ002027"],
        ["通策医疗", "SH600763"],
      ] as const);
  return (
    <section className="home-watchlist-news" aria-label="自选资讯">
      <div className="home-watchlist-news-filters">
        {(["全部", "公告", "新闻"] as const).map((item) => (
          <button
            aria-pressed={filter === item}
            key={item}
            onClick={() => setFilter(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      {names.map(([name, symbol], index) => (
        <article key={symbol}>
          <span>{symbol.replace(/\D/g, "").slice(-6)}</span>
          <div>
            <header>
              <strong>
                {name}({symbol})
              </strong>
              <small>
                昨天 {index ? "11:55" : "17:05"} · 来自
                {filter === "公告" ? "公告" : "新闻"}
              </small>
            </header>
            <Link href="/community/posts/post_syn_0001">
              <h2>
                {index === 0
                  ? "投资者提问：公司是否在人工智能领域开展创新"
                  : `${name}公开信息与经营进展整理`}
              </h2>
            </Link>
            <p>
              来源：公开资料。围绕主营业务、行业变化和最新公告进行整理，内容仅作信息展示…{" "}
              <Link href="/community/posts/post_syn_0001">🔗 网页链接</Link>
            </p>
            <footer>↱ 转发 ◉ 讨论 ♡ {index + 1} ☆ 收藏</footer>
          </div>
        </article>
      ))}
    </section>
  );
}

function VideoChannel() {
  return (
    <section className="home-video-channel" aria-label="视频信息流">
      {(
        [
          ["但斌", "转载：优秀的投资者需具备五大核心品质！", "五大核心品质"],
          ["宁五爷笔记", "京东方与华为旗舰", "产业访谈"],
        ] as const
      ).map(([author, title, badge], index) => (
        <article key={title}>
          <header>
            <span>{author.slice(0, 1)}</span>
            <strong>{author}</strong>
            <small>昨天 {index ? "22:27" : "11:17"} · 来自火球</small>
          </header>
          <h2>{title}</h2>
          <button
            className="home-video-poster"
            aria-label={`播放${title}`}
            type="button"
          >
            <b>{badge}</b>
            <i>▶</i>
            <small>00:0{index + 1}:43</small>
          </button>
          <footer>
            ↱ {index ? 4 : 11} ◉ {index ? 8 : 23} ♡ {index ? 19 : 67} ☆ 收藏 △
            投诉
          </footer>
        </article>
      ))}
    </section>
  );
}

export function HomeCommunityFeed({
  initialChannel = "热门",
}: Readonly<{ initialChannel?: HomeChannel }>) {
  const accountSession = useAccountSession();
  const [activeChannel, setActiveChannel] =
    useState<HomeChannel>(initialChannel);
  const [draft, setDraft] = useState("");
  const [expandedPosts, setExpandedPosts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [favoritedPosts, setFavoritedPosts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [likedPosts, setLikedPosts] = useState<ReadonlySet<string>>(new Set());
  const [commentOpenPosts, setCommentOpenPosts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [favoriteConfirmation, setFavoriteConfirmation] = useState<
    string | null
  >(null);
  const [actionToast, setActionToast] = useState("");
  const [notice, setNotice] = useState("");
  const [reportedPosts, setReportedPosts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason | "">("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportEvidenceName, setReportEvidenceName] = useState("");
  const [commentSort, setCommentSort] = useState<"最热" | "最新" | "最早">(
    "最热",
  );

  const serverPosts = useMemo<readonly HomePost[]>(
    () =>
      accountSession.posts.map((post) => ({
        author: post.authorName,
        avatar: [...post.authorName][0] ?? "火",
        channel: "关注",
        commentCount: 0,
        content: post.body,
        id: post.id,
        likeCount: post.likeCount ?? 0,
        meta: `${new Date(post.createdAt).toLocaleString("zh-CN", {
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          month: "2-digit",
        })} · 来自火球`,
        shareCount: 0,
        title: post.title,
      })),
    [accountSession.posts],
  );
  const serverPostIds = useMemo(
    () => new Set(serverPosts.map((post) => post.id)),
    [serverPosts],
  );

  const visiblePosts = useMemo(() => {
    const allPosts = [...serverPosts, ...feedPosts];
    if (activeChannel === "热门" || activeChannel === "关注") return allPosts;
    return allPosts.filter((post) => post.channel === activeChannel);
  }, [activeChannel, serverPosts]);

  const reportPost = useMemo(
    () =>
      [...serverPosts, ...feedPosts].find((post) => post.id === reportPostId),
    [reportPostId, serverPosts],
  );
  const reportDetailOptions = reportReason
    ? (reportDetails[reportReason] ?? [])
    : [];
  const reportNeedsDescription = reportReason === "非法荐股";
  const canSubmitReport = Boolean(
    reportReason &&
    (!reportNeedsDescription || reportDescription.trim()) &&
    (!reportDetailOptions.length || reportDetail),
  );

  useEffect(() => {
    if (!actionToast) return;
    const timer = window.setTimeout(() => setActionToast(""), 1700);
    return () => window.clearTimeout(timer);
  }, [actionToast]);

  useEffect(() => {
    if (!favoriteConfirmation && !reportPostId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFavoriteConfirmation(null);
      setReportPostId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [favoriteConfirmation, reportPostId]);

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      setNotice("请先写下你的观点。");
      return;
    }
    if (accountSession.account === null) {
      setNotice("公开内容可直接浏览，无需登录；登录后即可发布。");
      return;
    }
    const error = await accountSession.publish("我的最新观点", body);
    if (error !== null) {
      setNotice(error);
      return;
    }
    setDraft("");
    setActiveChannel("关注");
    setNotice("发布成功。");
  };

  const toggleExpanded = (postId: string) => {
    setExpandedPosts((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const toggleLiked = async (postId: string) => {
    if (serverPostIds.has(postId)) {
      const error = await accountSession.toggleLike(postId);
      setActionToast(error ?? "点赞状态已同步");
      return;
    }
    setLikedPosts((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const handleFavorite = async (postId: string) => {
    const serverFavorited = accountSession.bookmarkedPostIds.includes(postId);
    if (favoritedPosts.has(postId) || serverFavorited) {
      setFavoriteConfirmation(postId);
      return;
    }
    if (serverPostIds.has(postId)) {
      const error = await accountSession.toggleBookmark(postId);
      setActionToast(error ?? "收藏成功");
      return;
    }
    setFavoritedPosts((current) => new Set(current).add(postId));
    setActionToast("收藏成功");
  };

  const confirmFavoriteRemoval = async () => {
    if (!favoriteConfirmation) return;
    if (serverPostIds.has(favoriteConfirmation)) {
      const error = await accountSession.toggleBookmark(favoriteConfirmation);
      setFavoriteConfirmation(null);
      setActionToast(error ?? "已取消收藏");
      return;
    }
    setFavoritedPosts((current) => {
      const next = new Set(current);
      next.delete(favoriteConfirmation);
      return next;
    });
    setFavoriteConfirmation(null);
    setActionToast("已取消收藏");
  };

  const openComments = (postId: string) => {
    setCommentOpenPosts((current) => new Set(current).add(postId));
    window.setTimeout(() => {
      document
        .getElementById(`comments-${postId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const resetReportForm = () => {
    setReportReason("");
    setReportDetail("");
    setReportDescription("");
    setReportEvidenceName("");
  };

  const closeReport = () => {
    setReportPostId(null);
    resetReportForm();
  };

  const openReport = (postId: string) => {
    if (reportedPosts.has(postId)) {
      setActionToast("该内容已经提交投诉");
      return;
    }
    resetReportForm();
    setReportPostId(postId);
  };

  const submitReport = () => {
    if (!reportPostId || !canSubmitReport) return;
    setReportedPosts((current) => new Set(current).add(reportPostId));
    closeReport();
    setActionToast("投诉已提交，我们会尽快核实");
  };

  return (
    <section className="home-community" aria-label="首页社区信息流">
      <p className="visually-hidden">公开内容可直接浏览，无需登录</p>
      <form className="home-composer" method="post" onSubmit={publish}>
        <div className="home-composer-main">
          <span className="home-composer-avatar" aria-hidden="true">
            演
          </span>
          <textarea
            aria-label="发表观点"
            onChange={(event) => {
              setDraft(event.target.value);
              if (notice) setNotice("");
            }}
            placeholder="发表你的观点..."
            value={draft}
          />
        </div>
        <div className="home-composer-toolbar">
          <div aria-label="发布工具">
            {composerTools.map((tool) => (
              <button
                aria-label={tool.label}
                key={tool.name}
                onClick={() => setNotice("该工具暂不开放。")}
                type="button"
              >
                <ComposerIcon name={tool.name} />
              </button>
            ))}
            <Link href="/publish">
              <span aria-hidden="true">□</span>
              长文
            </Link>
          </div>
          <button
            className="home-composer-submit"
            disabled={!draft.trim()}
            type="submit"
          >
            发布
          </button>
        </div>
        <p aria-live="polite" className="home-composer-notice">
          {notice}
        </p>
      </form>

      <nav
        className="home-feed-tabs"
        aria-label="首页信息流频道"
        role="tablist"
      >
        {channels.map((channel) => (
          <button
            aria-selected={activeChannel === channel}
            key={channel}
            onClick={() => setActiveChannel(channel)}
            role="tab"
            type="button"
          >
            {channel}
          </button>
        ))}
      </nav>

      {activeChannel === "7x24" ? (
        <LiveTimeline />
      ) : activeChannel === "自选" ? (
        <WatchlistNews />
      ) : activeChannel === "视频" ? (
        <VideoChannel />
      ) : (
        <div className="home-post-list" role="tabpanel">
          {visiblePosts.length > 0 ? (
            visiblePosts.map((post) => {
              const expanded = expandedPosts.has(post.id);
              const favorited =
                favoritedPosts.has(post.id) ||
                accountSession.bookmarkedPostIds.includes(post.id);
              const liked =
                likedPosts.has(post.id) ||
                accountSession.likedPostIds.includes(post.id);
              const reported = reportedPosts.has(post.id);
              const expandable = post.content.length > 90;
              const sortedComments =
                commentSort === "最热"
                  ? postComments
                  : commentSort === "最新"
                    ? [...postComments].reverse()
                    : [...postComments].sort((left, right) =>
                        left.author.localeCompare(right.author, "zh-CN"),
                      );

              return (
                <article className="home-post" key={post.id}>
                  <span className="home-post-avatar" aria-hidden="true">
                    {post.avatar}
                  </span>
                  <div>
                    <header>
                      <strong>{post.author}</strong>
                      <span>{post.meta}</span>
                    </header>
                    <Link
                      href={
                        serverPostIds.has(post.id)
                          ? `/community/posts/${post.id}`
                          : "/community/posts/post_syn_0001"
                      }
                    >
                      <h2>{post.title}</h2>
                    </Link>
                    <div className="home-post-content-wrap">
                      <p
                        className={`home-post-content${expanded ? " is-expanded" : ""}`}
                      >
                        {post.content}
                      </p>
                      {expandable ? (
                        <button
                          aria-expanded={expanded}
                          className="home-post-expand"
                          onClick={() => toggleExpanded(post.id)}
                          type="button"
                        >
                          {expanded ? "收起⌃" : "展开⌄"}
                        </button>
                      ) : null}
                    </div>
                    <footer aria-label={`${post.author}的帖子操作`}>
                      <button
                        aria-label="转发"
                        onClick={() => setActionToast("已准备分享这条内容")}
                        type="button"
                      >
                        <PostActionIcon name="share" />
                        <span>{post.shareCount || "转发"}</span>
                      </button>
                      <button
                        aria-label="查看评论"
                        onClick={() => openComments(post.id)}
                        type="button"
                      >
                        <PostActionIcon name="comment" />
                        <span>{post.commentCount || "讨论"}</span>
                      </button>
                      <button
                        aria-pressed={liked}
                        className="home-post-like-action"
                        onClick={() => toggleLiked(post.id)}
                        type="button"
                      >
                        <PostActionIcon filled={liked} name="like" />
                        <span>
                          {post.likeCount +
                            (liked && !serverPostIds.has(post.id) ? 1 : 0)}
                        </span>
                      </button>
                      <button
                        aria-pressed={favorited}
                        className="home-post-favorite-action"
                        onClick={() => handleFavorite(post.id)}
                        type="button"
                      >
                        <PostActionIcon filled={favorited} name="favorite" />
                        <span>{favorited ? "取消收藏" : "收藏"}</span>
                      </button>
                      <button
                        aria-pressed={reported}
                        onClick={() => openReport(post.id)}
                        type="button"
                      >
                        <PostActionIcon name="report" />
                        <span>{reported ? "已投诉" : "投诉"}</span>
                      </button>
                    </footer>
                    {commentOpenPosts.has(post.id) ? (
                      <section
                        className="home-post-comments"
                        id={`comments-${post.id}`}
                      >
                        <div className="home-post-comment-composer">
                          <span aria-hidden="true">演</span>
                          <button type="button">回复 @{post.author}</button>
                        </div>
                        <header>
                          <h3>全部评论（{post.commentCount}）</h3>
                          <nav aria-label="评论排序">
                            {(["最热", "最新", "最早"] as const).map((sort) => (
                              <button
                                aria-pressed={commentSort === sort}
                                key={sort}
                                onClick={() => setCommentSort(sort)}
                                type="button"
                              >
                                {sort}
                              </button>
                            ))}
                          </nav>
                        </header>
                        {sortedComments.map((comment) => (
                          <article key={`${post.id}-${comment.author}`}>
                            <span aria-hidden="true">{comment.avatar}</span>
                            <div>
                              <header>
                                <strong>{comment.author}</strong>
                                <small>{comment.meta}</small>
                              </header>
                              <p>{comment.content}</p>
                            </div>
                          </article>
                        ))}
                      </section>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="home-feed-empty">这个频道暂无新内容。</p>
          )}
        </div>
      )}
      {actionToast ? (
        <div aria-live="polite" className="home-action-toast" role="status">
          <span aria-hidden="true">✓</span>
          {actionToast}
        </div>
      ) : null}
      {favoriteConfirmation ? (
        <div
          className="home-confirm-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setFavoriteConfirmation(null);
            }
          }}
          role="presentation"
        >
          <section
            aria-labelledby="favorite-confirm-title"
            aria-modal="true"
            className="home-confirm-dialog"
            role="dialog"
          >
            <header>
              <h2 id="favorite-confirm-title">确定取消收藏吗？</h2>
              <button
                aria-label="关闭"
                onClick={() => setFavoriteConfirmation(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <button onClick={confirmFavoriteRemoval} type="button">
              确定
            </button>
          </section>
        </div>
      ) : null}
      {reportPostId && reportPost ? (
        <div
          className="home-confirm-backdrop home-report-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeReport();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="report-dialog-title"
            aria-modal="true"
            className="home-report-dialog"
            role="dialog"
          >
            <header>
              <h2 id="report-dialog-title">投诉</h2>
              <button
                aria-label="关闭投诉窗口"
                onClick={closeReport}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="home-report-excerpt">{reportPost.content}</p>
            <fieldset>
              <legend>投诉原因</legend>
              <div className="home-report-options">
                {reportReasons.map((reason) => (
                  <button
                    aria-pressed={reportReason === reason}
                    key={reason}
                    onClick={() => {
                      setReportReason(reason);
                      setReportDetail("");
                      setReportDescription("");
                      setReportEvidenceName("");
                    }}
                    type="button"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </fieldset>
            {reportDetailOptions.length ? (
              <fieldset className="home-report-details">
                <legend>详细内容</legend>
                <div className="home-report-options">
                  {reportDetailOptions.map((detail) => (
                    <button
                      aria-pressed={reportDetail === detail}
                      key={detail}
                      onClick={() => setReportDetail(detail)}
                      type="button"
                    >
                      {detail}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {reportNeedsDescription ? (
              <section className="home-report-description">
                <h3>
                  投诉描述 <small>必填</small>
                </h3>
                <div>
                  <textarea
                    aria-label="投诉描述"
                    maxLength={300}
                    onChange={(event) =>
                      setReportDescription(event.target.value)
                    }
                    placeholder="如果该内容存在非法荐股行为，请描述或截图标记上传，可以帮助我们快速定位问题"
                    value={reportDescription}
                  />
                  <span>{reportDescription.length}/300</span>
                  <label>
                    <b aria-hidden="true">＋</b>
                    <span>{reportEvidenceName || "证明材料"}</span>
                    <input
                      accept="image/png,image/jpeg,application/pdf"
                      onChange={(event) =>
                        setReportEvidenceName(
                          event.target.files?.[0]?.name ?? "",
                        )
                      }
                      type="file"
                    />
                  </label>
                </div>
                <p>
                  (1)
                  如需发起涉企侵权类投诉，请至具体违规帖子或评论页面选择“投诉”-“涉企侵权”。
                  <br />
                  (2) 材料上传支持 PNG、JPG、JPEG、PDF，大小不超过 10M。
                </p>
              </section>
            ) : null}
            <footer>
              <button
                disabled={!canSubmitReport}
                onClick={submitReport}
                type="button"
              >
                提交
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
