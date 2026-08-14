/**
 * 火球设计系统 · 令牌
 *
 * 方向：专业密集型财经界面。
 *
 * 三条硬规则，改动前先读：
 * 1. 蓝色是链接与强调色，不是填充色。大面积实心蓝会压过行情数字，
 *    而行情数字才是这个产品里最该抢眼的东西。
 * 2. 分层靠描边和背景差，不靠阴影。阴影只留给真正浮起来的东西
 *    （弹层、抽屉、吸顶）。每张卡都投影 = 没有层级。
 * 3. 红涨绿跌是 A 股语义，`up` 是红。`*Text` 变体才是可以放在
 *    浅底上的文字色，`up`/`down` 原色只用于图表填充与描边。
 *
 * 所有文字色都经过 WCAG AA（4.5:1）实测，覆盖 base / canvas /
 * sunken / subtle 四种承载面。改颜色必须重跑 test/tokens.spec.ts。
 */
export const tokens = {
  brand: {
    primary: "#0967C7",
    primaryHover: "#0756A6",
    primaryPressed: "#064584",
    secondary: "#B9DCFF",
    accent: "#2F88E9",
    focus: "#73AFFF",
    onPrimary: "#FFFFFF",
    subtle: "#EAF2FC",
  },
  surface: {
    /** 页面底色 */
    canvas: "#F5F6F8",
    /** 卡片与主内容面 */
    base: "#FFFFFF",
    /** 强调区块的浅蓝底 */
    subtle: "#F0F5FC",
    /** 浮层：弹窗、下拉、吸顶栏 */
    raised: "#FFFFFF",
    /** 凹陷区：输入框、代码块、进度槽 */
    sunken: "#EBEEF2",
    /** 模态层 */
    overlay: "#FFFFFF",
    /** 深色反相块 */
    inverse: "#0E1620",
    divider: "#E4E8ED",
    scrim: "rgba(14, 22, 32, 0.55)",
  },
  border: {
    /** 卡片内部的发丝线 */
    subtle: "#EDEFF3",
    /** 卡片、输入框的默认描边 */
    default: "#E1E5EB",
    /** 需要被看见的边界：表头、选中态 */
    strong: "#CAD2DB",
    focus: "#0967C7",
    inverse: "rgba(255, 255, 255, 0.14)",
  },
  text: {
    primary: "#0F1620",
    secondary: "#47525F",
    tertiary: "#5F6975",
    inverse: "#FFFFFF",
    inverseMuted: "#C7D1DC",
    link: "#0A5FB4",
    linkHover: "#074A8E",
    disabled: "#98A2B0",
  },
  market: {
    /** 图表填充与描边用原色 */
    up: "#E5484D",
    /** 浅底上的涨幅文字 */
    upText: "#C0272D",
    upSubtle: "#FDF0F0",
    upBorder: "#F5C2C4",
    down: "#17A673",
    downText: "#05714B",
    downSubtle: "#EDF9F4",
    downBorder: "#B4E3D0",
    flat: "#5F6975",
    warning: "#C2700A",
    warningText: "#8A5106",
    warningSubtle: "#FDF5E7",
  },
  spacing: {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
    20: "80px",
  },
  radius: {
    none: "0px",
    /** 按钮、输入框 */
    control: "6px",
    /** 卡片。金融界面要收敛，12px 太圆 */
    card: "8px",
    chip: "6px",
    sheet: "14px",
    pill: "999px",
  },
  shadow: {
    /** 几乎看不见。卡片靠描边分层，这层只防止纯白卡在纯白底上消失 */
    card: "0 1px 2px rgba(15, 22, 32, 0.04)",
    raised: "0 4px 12px rgba(15, 22, 32, 0.08)",
    floating: "0 12px 32px rgba(15, 22, 32, 0.16)",
    /*
     * 焦点环。必须是不透明的。
     *
     * 这里原本是 rgba(9,103,199,0.28)，叠在白底上合成出 rgb(175,201,228)，
     * 对白底只有 1.71:1、对按钮底 1.49:1——而 WCAG 2.4.11 要求 3:1。
     * 又因为 :focus-visible 里的 outline 是透明的（那是 forced-colors 下的
     * 正确写法），这道 box-shadow 是普通模式下唯一的焦点指示：看不清它，
     * 键盘用户就不知道自己在哪。
     */
    focus: "0 0 0 3px #0967C7",
  },
  type: {
    family: {
      sans: '"Inter", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif',
      mono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
    },
    size: {
      micro: "11px",
      caption: "12px",
      labelCompact: "13px",
      label: "14px",
      bodyCompact: "15px",
      body: "16px",
      title: "20px",
      headline: "28px",
      quote: "32px",
      display: "40px",
      /** 行情数字专用梯度，与正文字号解耦 */
      data: "15px",
      dataLarge: "20px",
      dataHero: "34px",
    },
    lineHeight: {
      flat: "1",
      compact: "1.25",
      snug: "1.4",
      body: "1.6",
      reading: "1.75",
    },
    weight: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    tracking: {
      tight: "-0.02em",
      normal: "0em",
      wide: "0.04em",
      caps: "0.08em",
    },
  },
  touch: {
    webMinimum: "44px",
    appMinimum: "48px",
  },
  motion: {
    durationInstant: "80ms",
    durationFast: "140ms",
    durationBase: "220ms",
    easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  layout: {
    sidebarWidth: "196px",
    railWidth: "300px",
    contentMax: "1360px",
    topbarHeight: "56px",
    mobileNavHeight: "56px",
  },
} as const;

/**
 * 暗色主题覆盖层。
 *
 * 只列会变的令牌；其余（间距、圆角、字号、动效、布局）跨主题共用。
 * 结构必须是 `tokens` 的子树，否则会生成亮色里不存在的变量。
 */
export const darkTokens = {
  brand: {
    primary: "#3C8FE0",
    primaryHover: "#57A2EC",
    primaryPressed: "#2F7AC4",
    secondary: "#9FCBF5",
    accent: "#6BB0F7",
    focus: "#7CBBFF",
    onPrimary: "#04121F",
    subtle: "#132639",
  },
  surface: {
    canvas: "#0C1116",
    base: "#141A21",
    subtle: "#16222F",
    raised: "#1B222B",
    sunken: "#080C10",
    overlay: "#1B222B",
    inverse: "#E6EDF3",
    divider: "#232B35",
    scrim: "rgba(4, 8, 12, 0.7)",
  },
  border: {
    subtle: "#1E252E",
    default: "#2A323C",
    strong: "#3A434F",
    focus: "#6BB0F7",
    inverse: "rgba(0, 0, 0, 0.24)",
  },
  text: {
    primary: "#E6EDF3",
    secondary: "#A6B2BF",
    tertiary: "#8996A4",
    inverse: "#0F1620",
    inverseMuted: "#47525F",
    link: "#6BB0F7",
    linkHover: "#8FC6FA",
    disabled: "#5A6673",
  },
  market: {
    up: "#F2555A",
    upText: "#FF8A85",
    upSubtle: "#2A1518",
    upBorder: "#4A2126",
    down: "#1FAE7C",
    downText: "#45D19A",
    downSubtle: "#0E241D",
    downBorder: "#1B3D31",
    flat: "#8996A4",
    warning: "#D99A2B",
    warningText: "#F0B429",
    warningSubtle: "#2A2010",
  },
  shadow: {
    card: "0 1px 2px rgba(0, 0, 0, 0.4)",
    raised: "0 4px 12px rgba(0, 0, 0, 0.5)",
    floating: "0 12px 32px rgba(0, 0, 0, 0.6)",
    /* 同理，深色主题下也要不透明。 */
    focus: "0 0 0 3px #6BB0F7",
  },
} as const;

export type DesignTokens = typeof tokens;
export type DarkDesignTokens = typeof darkTokens;
