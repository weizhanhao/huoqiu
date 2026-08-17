#!/usr/bin/env node
/*
 * 给站上灌一批真实内容。
 *
 * 起因：预览环境上只有几条自动化测试留下的「这条是从 mobile 接口层发出去的」，
 * 关注、基金、ETF、私募四个频道整屏空白。空白不是「这个功能没做」，可看起来
 * 一模一样——用户打开就是四页白。
 *
 * 这个脚本做两件事，都走站内公开接口，不碰存储：
 *   1. 用 /api/social/register 建几个真账号（不是夹具，是真写进库的账号）
 *   2. 让他们发帖、互相关注、评论、点赞
 *
 * 帖子里的数字全部现取自本站的行情与净值接口，不是编的：涨跌幅、净值、净值
 * 日期、私募在管数量都来自上游当时的真实数据，并且在正文里标出日期——不标
 * 日期的行情数字过两天就变成一句假话。
 *
 * 观点是观点，数字是数字：正文里的判断是这些账号的看法，不构成任何建议；
 * 数字则必须能回到原始接口对上。
 *
 * 用法：
 *   HUOQIU_SEED_PASSWORD=<至少12位> node scripts/seed-community.mjs
 *   HUOQIU_BASE_URL 默认 http://172.29.98.11，可覆盖。
 *
 * 可以重复跑：账号已存在时改走登录，已发过的标题会跳过。
 */

const BASE = process.env.HUOQIU_BASE_URL ?? "http://172.29.98.11";

/*
 * 口令从环境变量来，不写死在文件里。
 *
 * 这批是能真正登录的账号。把口令提交进仓库，等于给任何读得到代码的人一把钥匙。
 */
const PASSWORD = process.env.HUOQIU_SEED_PASSWORD ?? "";
if (PASSWORD.length < 12) {
  console.error(
    "需要 HUOQIU_SEED_PASSWORD（至少 12 位）。这些是能登录的真账号，口令不写进代码。",
  );
  process.exit(1);
}

const api = async (path, { body, method = "GET", token = null } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      /*
       * 用 x-huoqiu-session，不用 Authorization: Bearer。
       *
       * 服务端两种都认，但部署在前面的反向代理会把 Authorization 头吃掉——
       * 直接打 Next.js 时 Bearer 好用，打预览域名就一路 401「请先登录。」，
       * 而这个错看起来像口令不对。手机端走的就是这个自定义头。
       */
      ...(token === null ? {} : { "x-huoqiu-session": token }),
    },
    method,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text.length === 0 ? null : JSON.parse(text);
  } catch {
    payload = { error: text.slice(0, 200) };
  }
  return { ok: response.ok, payload, status: response.status };
};

/* 两位小数，带正负号。取不到就说取不到，不写 0。 */
const pct = (value) =>
  typeof value === "number"
    ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
    : "—";

const yi = (value) =>
  typeof value === "number" ? `${(value / 1e8).toFixed(1)} 亿` : "—";

/* ------------------------------------------------------------ 取真实数据 */

const loadFacts = async () => {
  const [hot, etfs, funds, managers, overview] = await Promise.all([
    api("/api/market/hot?market=cn&direction=gainers"),
    api("/api/market/etfs?sort=amount&page=1"),
    api("/api/funds/list?category=index&sort=day"),
    api("/api/private-funds"),
    api("/api/market/overview"),
  ]);

  const facts = {
    etfs: etfs.payload?.rows ?? [],
    funds: funds.payload?.rows ?? [],
    hot: hot.payload?.rows ?? [],
    indexes: overview.payload?.indexes ?? [],
    managers: managers.payload?.managers ?? [],
  };

  /*
   * 一样都取不到就不要发。
   *
   * 数据缺了还照发，正文里会出现一串「—」，读起来像是我们不知道自己在写什么
   * ——而事实是上游没给。宁可这一轮不发。
   */
  for (const [name, rows] of Object.entries(facts)) {
    if (rows.length === 0) {
      throw new Error(`${name} 一条都没取到，先看接口，不要发半截内容。`);
    }
  }
  return facts;
};

/* -------------------------------------------------------------- 帖子内容 */

/** 站内引用记号：$名称(SH600519)$，发帖器与频道分类认的就是这个形状。 */
const cashtag = (name, href) => {
  const symbol = (href ?? "").split("/").pop() ?? "";
  return `$${name}(${symbol.toUpperCase()})$`;
};

const today = () => new Date().toISOString().slice(0, 10);

/*
 * 六个人，六种看法。
 *
 * 不是六个「测试账号1..6」——一个社区里所有人说话都一个调子，比空着更假。
 * 每个人盯的那一块不同，发的内容也就落进不同频道。
 */
const personas = (facts) => {
  const topEtf =
    facts.etfs.find((row) => row.changePercent !== 0) ?? facts.etfs[0];
  const cashEtf = facts.etfs[0];
  const topFund = facts.funds[0];
  const secondFund =
    facts.funds.find((row) => row.code !== topFund.code) ?? topFund;
  const bigManager = [...facts.managers].sort(
    (left, right) => right.fundCount - left.fundCount,
  )[0];
  const oldManager = [...facts.managers].sort((left, right) =>
    left.establishedOn.localeCompare(right.establishedOn),
  )[0];
  const gainers = facts.hot.slice(0, 4);
  const day = today();

  return [
    {
      displayName: "林岸",
      handle: "linan",
      posts: [
        {
          body: `${day} 收盘，${cashtag(topEtf.name, topEtf.href)} 报 ${topEtf.last}，${pct(topEtf.changePercent)}，全天成交 ${yi(topEtf.amount)}。\n\n场内这一块我一直只用 ETF 表达观点：持仓每天公布，涨跌来自指数本身，不用去猜基金经理换没换手。今天成交额排在全市场前列，说明进来的是真钱，不是几笔挂单撑出来的价。\n\n仓位没动。#指数投资#`,
          title: `${topEtf.name} 今天的成交额说明了什么`,
        },
        {
          body: `聊一只没什么人提的：${cashtag(cashEtf.name, cashEtf.href)}，今天 ${pct(cashEtf.changePercent)}，成交 ${yi(cashEtf.amount)}。\n\n这类货币型 ETF 的净值几乎不动，看涨跌幅没有意义，它存在的意义是场内闲钱的停车位——T+0、免申赎费。等回调的时候钱放这儿，比放着不动强一点点，仅此而已。\n\n把它当收益来源的人要清楚：它不是。#场内工具#`,
          title: "场内闲钱的去处",
        },
      ],
    },
    {
      displayName: "沈晚舟",
      handle: "shenwanzhou",
      posts: [
        {
          body: `今天涨幅榜前面这几只：${gainers
            .map(
              (row) => `${cashtag(row.name, row.href)} ${pct(row.changePercent)}`,
            )
            .join("、")}。\n\n${day} 的榜单，看行业分布比看单只有用。连续几天榜首都集中在同一个方向的时候，往往已经是这一波的后半程了——先涨的那批半个月前就启动了，榜单上出现的是最后跟上来的。\n\n我不打算追。#涨幅榜#`,
          title: `${day} 涨幅榜读后`,
        },
      ],
    },
    {
      displayName: "周砚",
      handle: "zhouyan",
      posts: [
        {
          body: `${topFund.name}（${topFund.code}），${topFund.navDate} 的净值 ${topFund.nav}，当日 ${pct(topFund.dayPct)}，近一年 ${pct(topFund.oneYearPct)}。\n\n场外基金的净值永远是滞后的——你今天看到的是上一个交易日收盘算出来的那个数，今天申购按今天收盘的净值成交。定投的人不用管这个滞后，一次性买的人得管：净值涨了 5% 那天冲进去，成交价就是那个涨完的价。\n\n近一年这个数字好看，但它是过去一年的事。#基金定投#`,
          title: `${topFund.name} 的净值该怎么读`,
        },
        {
          body: `再放一只对照的：${secondFund.name}（${secondFund.code}），${secondFund.navDate} 净值 ${secondFund.nav}，当日 ${pct(secondFund.dayPct)}。\n\nA 类和 C 类的区别只在费用结构：A 类收申购费、C 类收销售服务费。持有一年以上，A 类通常更划算；一年以内来回做，C 类省钱。同一只基金的两个份额，长期收益差出来的就是这笔费用。\n\n先算持有期，再选份额。#基金常识#`,
          title: "A 类和 C 类到底差在哪",
        },
      ],
    },
    {
      displayName: "何知远",
      handle: "hezhiyuan",
      posts: [
        {
          body: `翻中基协的备案信息，${bigManager.name} 名下在管 ${bigManager.fundCount} 只产品，${bigManager.establishedOn} 登记，类型是${bigManager.investType}，法定代表人${bigManager.legalPerson}。\n\n看私募先看这几栏，不是先看业绩曲线：成立年限说明它经历过几轮完整的周期，在管数量说明组织能力跟不跟得上规模。业绩可以只展示活下来的那几只，备案信息不能。\n\n原始出处在这里，可以自己核：${bigManager.disclosureUrl}\n\n#私募#`,
          title: `${bigManager.name}：先看备案，再看业绩`,
        },
        {
          body: `另一家：${oldManager.name}，${oldManager.establishedOn} 就登记了，在管 ${oldManager.fundCount} 只。\n\n成立得早不等于做得好，但一家十几年前就在的私募，至少完整经历过 2008、2015、2018 这几次。见过大回撤的管理人和没见过的，在回撤真来的时候做的动作不一样。\n\n备案页：${oldManager.disclosureUrl}\n\n私募有合格投资者门槛，这里只是读公开信息，不涉及任何推荐。#私募#`,
          title: "成立年限这一栏的信息量",
        },
      ],
    },
    {
      displayName: "苏挽",
      handle: "suwan",
      posts: [
        {
          body: `${gainers[0] === undefined ? "" : cashtag(gainers[0].name, gainers[0].href)} 今天 ${pct(gainers[0]?.changePercent)}。\n\n盯涨停的人看的不是这只票本身，是它后面跟了几只。一只孤零零封住的板，第二天大概率高开低走；带出一串同方向的，才叫有资金在做这个方向。\n\n我今天没参与，记一笔观察。#情绪面#`,
          title: "一只板和一串板的区别",
        },
      ],
    },
    {
      displayName: "郑棠",
      handle: "zhengtang",
      posts: [
        {
          body: `${facts.indexes
            .slice(0, 3)
            .map((row) => `${row.name} ${pct(row.changePercent)}`)
            .join("、")}——${day} 的三大指数。\n\n指数涨跌和自己账户的涨跌对不上是常态：指数是市值加权的，几只大权重就能把它抬起来，而多数人手里拿的不是那几只。拿指数当业绩基准可以，拿它解释自己今天为什么亏，通常解释不通。\n\n#大盘#`,
          title: `${day} 三大指数`,
        },
      ],
    },
  ];
};

/* ------------------------------------------------------------------ 执行 */

const ensureAccount = async (persona) => {
  const email = `${persona.handle}@seed.huoqiu.local`;
  const created = await api("/api/social/register", {
    body: { display_name: persona.displayName, email, password: PASSWORD },
    method: "POST",
  });
  if (created.ok) {
    console.log(`  建号 ${persona.displayName}`);
    return { id: created.payload.account.id, token: created.payload.token };
  }

  /* 已经建过就登录——这个脚本要能重复跑，不能第二次就报错停住。 */
  const signedIn = await api("/api/social/login", {
    body: { email, password: PASSWORD },
    method: "POST",
  });
  if (!signedIn.ok) {
    throw new Error(
      `${persona.displayName} 既建不了也登不上：${JSON.stringify(created.payload)} / ${JSON.stringify(signedIn.payload)}`,
    );
  }
  console.log(`  已有 ${persona.displayName}`);
  return { id: signedIn.payload.account.id, token: signedIn.payload.token };
};

const run = async () => {
  console.log(`站点 ${BASE}`);
  console.log("取真实行情与名单……");
  const facts = await loadFacts();
  const roster = personas(facts);

  console.log("建号 / 登录……");
  const people = [];
  for (const persona of roster) {
    people.push({ ...persona, ...(await ensureAccount(persona)) });
  }

  /*
   * 已经发过的不再发一遍。
   *
   * 重复跑会把同一篇内容灌成好几份，那比空着还难看。标题在这批内容里是唯一的，
   * 拿它比对够用。
   */
  const existing = await api("/api/social/posts");
  const titles = new Set(
    (existing.payload?.posts ?? []).map((post) => post.title),
  );

  console.log("发帖……");
  const published = [];
  for (const person of people) {
    for (const post of person.posts) {
      if (titles.has(post.title)) {
        console.log(`  跳过（已有）${post.title}`);
        continue;
      }
      const result = await api("/api/social/posts", {
        body: { body: post.body, title: post.title },
        method: "POST",
        token: person.token,
      });
      if (!result.ok) {
        console.error(`  发帖失败 ${post.title}`, result.payload);
        continue;
      }
      published.push({ authorId: person.id, id: result.payload.post.id });
      console.log(`  ${person.displayName}：${post.title}`);
    }
  }

  /*
   * 互相关注。
   *
   * 每个人关注其余所有人。六个人的社区里，谁关注谁的挑选本身没有信息量，
   * 而「关注」页签要有内容，前提是关注关系真的存在。
   */
  console.log("互相关注……");
  for (const person of people) {
    for (const other of people) {
      if (other.id === person.id) continue;
      await api("/api/social/follow", {
        body: { following: true, target: other.id },
        method: "POST",
        token: person.token,
      });
    }
  }

  /* 评论与点赞：让帖子下面不是一片空白。 */
  console.log("评论与点赞……");
  const replies = [
    "同意后半段。前面那个数我自己也去接口上核了一遍，对得上。",
    "净值日期这一点很多人不看，吃过一次亏就记住了。",
    "这条我保留意见——成交额大也可能是两边对倒出来的，还得看持仓变化。",
    "备案信息确实比业绩曲线诚实，至少它不能只展示活下来的那几只。",
  ];
  let cursor = 0;
  for (const post of published) {
    for (const person of people) {
      if (person.id === post.authorId) continue;
      await api("/api/social/likes", {
        body: { liked: true, post: post.id },
        method: "POST",
        token: person.token,
      });
    }
    /* 每篇挑两个不是作者的人来回一句，不要每篇下面都是同一句。 */
    const commenters = people.filter((person) => person.id !== post.authorId);
    for (let index = 0; index < 2; index += 1) {
      const person = commenters[(cursor + index) % commenters.length];
      await api("/api/social/comments", {
        body: {
          body: replies[(cursor + index) % replies.length],
          post: post.id,
        },
        method: "POST",
        token: person.token,
      });
    }
    cursor += 1;
  }

  console.log(`完成：${people.length} 个账号，新发 ${published.length} 篇。`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
