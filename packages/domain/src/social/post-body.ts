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

/* 末尾留一个空格：紧接着打字不会粘到名字后面，变成另一个人的名字。 */
export const mentionToken = (displayName: string): string => `@${displayName} `;

export const imageToken = (src: string): string => `![](${src})`;

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
