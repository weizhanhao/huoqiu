/*
 * 帖子正文里的记号，以及把它们认回来的解析器。
 *
 * 放在共享包里，是因为网页版和手机端必须用同一份。复制两份的话，两边对
 * 「什么算一支股票」「哪些图片地址可信」的判断迟早会分叉——而这里有一条
 * 安全规则：只认自家上传目录下的图片。放开成任意地址，等于让任何人往站内
 * 页面塞一个站外地址，把读者的访问记录送出去。那条规则只能有一个版本。
 *
 * 正文在库里是一个纯字符串（social-v1.json 的 posts[].body）。股票、话题、
 * @ 和图片全部以文本记号存在里面，渲染时再解析成链接和图片。
 *
 * 插入和解析必须严格配对，所以放在同一个文件里：改了记号的写法而忘了改
 * 解析，症状是发出去的帖子里躺着一串「$贵州茅台(SH600519)$」的字面量，
 * 点不开——按钮看着能用，其实是装样子的。
 */

export type PostSegment =
  | Readonly<{ href: string; kind: "cashtag"; text: string }>
  | Readonly<{ href: string; kind: "mention"; text: string }>
  | Readonly<{ href: string; kind: "topic"; text: string }>
  | Readonly<{ kind: "image"; src: string }>
  | Readonly<{ kind: "text"; text: string }>;

export type MentionAccount = Readonly<{ displayName: string; id: string }>;

/** 上传目录是固定前缀，解析时据此认出自家的图片。 */
export const uploadPrefix = "/api/social/uploads/";

export const cashtagToken = (name: string, symbol: string): string =>
  `$${name}(${symbol.toUpperCase()})$`;

export const topicToken = (tag: string): string => `#${tag}#`;

/*
 * 正文里写过哪些话题。
 *
 * 和 parsePostBody 里那一支不是一回事：那里要求话题已经在已知名单里才算数
 * （否则一句「#3 号线#」会被当成话题链接）。而名单本身要从真实帖子里长出来，
 * 这就成了循环——所以提取单独一支，只按写法认。
 */
export const extractTopics = (body: string): readonly string[] => {
  const found: string[] = [];
  for (const match of body.matchAll(/#(?<tag>[^#\n]{1,40})#/gu)) {
    const tag = match.groups?.tag?.trim();
    if (tag !== undefined && tag.length > 0) found.push(tag);
  }
  return found;
};

/* 末尾留一个空格：紧接着打字不会粘到名字后面，变成另一个人的名字。 */
export const mentionToken = (displayName: string): string => `@${displayName} `;

export const imageToken = (src: string): string => `![](${src})`;

/**
 * 在光标处插入。
 *
 * 一律追加到末尾的话，光标停在句中时插出来的东西会跑到最后，用户得自己剪切
 * 再粘回去。有选区就替换选区——这是所有输入框的既有行为。
 */
export const insertAtCursor = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): Readonly<{ caret: number; value: string }> => ({
  caret: selectionStart + insert.length,
  value: value.slice(0, selectionStart) + insert + value.slice(selectionEnd),
});

/*
 * 四种记号一次扫完。
 *
 * 分四遍扫的话，先替换出来的链接文本会被后一遍再扫一次——例如股票名字里
 * 恰好带了 # 。一遍扫描、按位置切段，才不会互相啃。
 *
 * 各分支的含义：
 *   ![](地址)          自家上传的图片
 *   $名称(SH600519)$   股票；代码限定形状，避免把「$100」当成股票
 *   #话题#             话题
 *   @昵称              提到某人
 */
const tokenPattern =
  /!\[\]\((?<image>[^)\s]+)\)|\$(?<stockName>[^$()\n]{1,40})\((?<symbol>[A-Za-z]{1,4}\d{4,6}|[A-Z][A-Z.]{0,9})\)\$|#(?<tag>[^#\n]{1,40})#|@(?<mention>[一-龥A-Za-z0-9_]{1,24})/gu;

/**
 * 摘要用的纯文本：把记号换成它们读起来的样子。
 *
 * 列表里的摘要不该出现 `$贵州茅台(SH600519)$`、`![](/api/social/uploads/x.jpg)`
 * 这种东西——那是存储格式，不是给人读的。可摘要又不适合渲染成可点的富文本：
 * 整行本来就是一个「打开详情」的按钮，里面再套一层链接会把点击抢走。
 *
 * 所以摘要走这一条：股票只留名字、话题只留标签、@ 原样保留（它读起来就是
 * 「@某人」）、图片整段去掉。想点的人进详情，那里每一处都是活的。
 */
export const plainPostText = (body: string): string => {
  const parts: string[] = [];
  /*
   * 话题要拿正文里出现过的那些当已知列表。
   *
   * 传空数组的话，解析器会把每个 #x# 当成普通文字放过去——摘要里于是原样留着
   * 井号。这里不关心这个话题站上有没有别人用过：#号本身是记号，摘要里就该去掉。
   */
  for (const segment of parsePostBody(body, {
    accounts: [],
    topics: extractTopics(body),
  })) {
    if (segment.kind === "image") continue;
    if (segment.kind === "cashtag") {
      /* $贵州茅台(SH600519)$ → 贵州茅台 */
      parts.push(segment.text.replace(/^\$|\([^()]*\)\$$/gu, ""));
      continue;
    }
    if (segment.kind === "topic") {
      /* #基金定投# → 基金定投 */
      parts.push(segment.text.replaceAll("#", ""));
      continue;
    }
    parts.push(segment.text);
  }
  /* 去掉记号后常留下连续空白与空行，摘要里那些只是空洞。 */
  return parts.join("").replace(/\s+/gu, " ").trim();
};

export const parsePostBody = (
  body: string,
  context: Readonly<{
    accounts: readonly MentionAccount[];
    topics: readonly string[];
  }>,
): readonly PostSegment[] => {
  const segments: PostSegment[] = [];
  let cursor = 0;

  const pushText = (text: string): void => {
    if (text.length === 0) return;
    const previous = segments[segments.length - 1];
    /* 相邻的纯文本合并，免得渲染出一串毫无意义的碎片节点。 */
    if (previous !== undefined && previous.kind === "text") {
      segments[segments.length - 1] = {
        kind: "text",
        text: previous.text + text,
      };
      return;
    }
    segments.push({ kind: "text", text });
  };

  for (const match of body.matchAll(tokenPattern)) {
    const groups = match.groups ?? {};
    const start = match.index;
    const whole = match[0];

    const segment = ((): PostSegment | null => {
      if (groups.image !== undefined) {
        /*
         * 只认自家上传目录下的图片。放开成任意地址，等于让任何人往站内
         * 页面里塞一个站外地址——那是把读者的访问记录送给别人。
         */
        return groups.image.startsWith(uploadPrefix)
          ? { kind: "image", src: groups.image }
          : null;
      }
      if (groups.symbol !== undefined && groups.stockName !== undefined) {
        return {
          href: `/instruments/${groups.symbol.toLowerCase()}`,
          kind: "cashtag",
          text: whole,
        };
      }
      if (groups.tag !== undefined) {
        /* 话题广场里没有的标签不给链接：链过去是一页空的。 */
        return context.topics.includes(groups.tag)
          ? {
              href: `/topics/${encodeURIComponent(groups.tag)}`,
              kind: "topic",
              text: whole,
            }
          : null;
      }
      if (groups.mention !== undefined) {
        const name = groups.mention;
        const owners = context.accounts.filter(
          (account) => account.displayName === name,
        );
        /*
         * 重名时不链接，而不是随便挑一个。挑错了是把读者送到另一个人的
         * 主页上，而链接看起来完全正常——这种错没人报得出来。
         */
        const owner = owners.length === 1 ? owners[0] : undefined;
        return owner === undefined
          ? null
          : { href: `/users/${owner.id}`, kind: "mention", text: whole };
      }
      return null;
    })();

    if (segment === null) continue;

    pushText(body.slice(cursor, start));
    segments.push(segment);
    cursor = start + whole.length;
  }

  pushText(body.slice(cursor));
  return segments;
};
