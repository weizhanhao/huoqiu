/*
 * 创作者中心的分区。
 *
 * 单独一份而不是散在各页里：导航住在 layout 中，各页只管自己的正文，
 * 两边靠这份清单对齐。少一处同步，导航上就会出现点不开的项，或者有页面
 * 却进不去。
 *
 * status 记的是「这一块背后有没有真东西」：
 *   ready    —— 数据是真的，功能可用
 *   preview  —— 界面做出来了，但背后的能力站内没有（比如打赏要真实支付、
 *               实名认证要真实 KYC）。这类必须在页面上说清楚，不能让人
 *               点了半天才发现是空的。
 */
export type StudioStatus = "preview" | "ready";

export type StudioSection = Readonly<{
  label: string;
  slug: string;
  status: StudioStatus;
}>;

export type StudioGroup = Readonly<{
  label: string;
  sections: readonly StudioSection[];
}>;

export const studioGroups: readonly StudioGroup[] = [
  {
    label: "创作",
    sections: [
      { label: "发布长文", slug: "publish", status: "ready" },
      { label: "讨论草稿", slug: "drafts/discussion", status: "ready" },
      { label: "长文草稿", slug: "drafts/article", status: "ready" },
    ],
  },
  {
    label: "内容与数据",
    sections: [
      { label: "我的作品", slug: "content", status: "ready" },
      { label: "数据总览", slug: "data", status: "ready" },
      { label: "作品详情", slug: "data/posts", status: "ready" },
      { label: "粉丝数据", slug: "data/followers", status: "ready" },
    ],
  },
  {
    label: "账号与权益",
    sections: [
      { label: "权益与申请", slug: "benefits", status: "preview" },
      { label: "认证入口", slug: "verification", status: "preview" },
    ],
  },
];

export const studioSections: readonly StudioSection[] = studioGroups.flatMap(
  (group) => group.sections,
);

export const findStudioSection = (slug: string): StudioSection | null =>
  studioSections.find((section) => section.slug === slug) ?? null;
