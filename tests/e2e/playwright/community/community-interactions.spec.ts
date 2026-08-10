import { expect, test } from "@playwright/test";

test("switches channels through the rendered community controls", async ({
  page,
}) => {
  await page.goto("/?component=feed");

  await page.getByRole("button", { name: "热门" }).click();

  await expect(page.getByText("正在浏览热门频道")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "# 研究中的反证清单 #" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "一份关于长期观察节奏的合成笔记" }),
  ).toBeHidden();
});

test("updates post actions and supports comments and nested replies", async ({
  page,
}) => {
  await page.goto("/?component=post");

  const follow = page.getByRole("button", { name: "关注作者" });
  await follow.click();
  const followed = page.getByRole("button", { name: "已关注" });
  await expect(followed).toHaveAttribute("aria-pressed", "true");
  expect((await followed.boundingBox())?.height).toBeGreaterThanOrEqual(36);
  await followed.click();
  await expect(page.getByRole("button", { name: "关注作者" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "点赞 128" }).click();
  await expect(page.getByRole("button", { name: "已赞 129" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.getByRole("button", { name: "已收藏" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "发布评论" }).click();
  await expect(page.getByRole("alert")).toHaveText("请输入评论内容后再发布。");
  await page.getByLabel("添加评论").fill("我会继续观察量能变化。");
  await page.getByRole("button", { name: "发布评论" }).click();
  await expect(page.getByText("我会继续观察量能变化。")).toBeVisible();
  await expect(page.getByText("评论已添加到本次会话。")).toBeVisible();

  const firstComment = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "静观样本" }),
  });
  await firstComment.getByRole("button", { name: "回复" }).click();
  await expect(page.getByRole("alert")).toHaveText("请输入回复内容后再发布。");
  await firstComment.getByLabel("回复 静观样本").fill("同意，先看数据验证。");
  await firstComment.getByRole("button", { name: "回复" }).click();
  await expect(firstComment.getByText("同意，先看数据验证。")).toBeVisible();
  await expect(page.getByText("回复已添加到本次会话。")).toBeVisible();
});

test("previews and removes a local image while switching publisher modes", async ({
  page,
}) => {
  await page.goto("/?component=publisher");

  const discussionBody = page.getByLabel("讨论正文");
  expect((await discussionBody.boundingBox())?.height).toBeGreaterThanOrEqual(
    112,
  );
  await page.getByRole("button", { name: "写长文" }).click();
  await expect(page.getByLabel("长文标题")).toBeVisible();
  await expect(page.getByLabel("长文正文")).toBeVisible();
  await page.getByRole("button", { name: "发讨论" }).click();
  await expect(page.getByLabel("讨论正文")).toBeVisible();

  await page.getByLabel("选择本地图片").setInputFiles({
    name: "session-preview.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByRole("img", { name: "本地预览：session-preview.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "移除图片" }).click();
  await expect(
    page.getByRole("img", { name: "本地预览：session-preview.png" }),
  ).toBeHidden();
});

test("separates unavailable notices from a successful discussion publish", async ({
  page,
}) => {
  await page.goto("/?component=publisher");

  await page.getByRole("button", { name: "话题（暂未开放）" }).click();
  await expect(page.getByRole("status")).toHaveText("话题选择器暂未开放。");
  await expect(page.getByRole("link", { name: "返回社区" })).toBeHidden();

  await page.getByRole("button", { name: "发布到本次会话" }).click();
  await expect(page.getByRole("alert")).toHaveText("请输入讨论正文后再发布。");
  await page.getByLabel("讨论正文").fill("这是一次合成讨论草稿。");
  await page.getByRole("button", { name: "发布到本次会话" }).click();
  await expect(page.getByRole("status")).toContainText(
    "合成草稿已发布到本次会话。",
  );
  await expect(page.getByRole("link", { name: "返回社区" })).toHaveAttribute(
    "href",
    "/community",
  );
});

test("validates and publishes a long article through visible fields", async ({
  page,
}) => {
  await page.goto("/?component=publisher");

  await page.getByRole("button", { name: "写长文" }).click();
  await page.getByRole("button", { name: "发布到本次会话" }).click();
  await expect(page.getByRole("alert")).toHaveText("请输入长文标题后再发布。");
  await page.getByLabel("长文标题").fill("我的合成观察笔记");
  await page.getByLabel("长文正文").fill("这里是本次会话中的合成长文正文。");
  await page.getByRole("button", { name: "发布到本次会话" }).click();
  await expect(page.getByRole("status")).toContainText(
    "合成草稿已发布到本次会话。",
  );
  await expect(page.getByRole("link", { name: "返回社区" })).toBeVisible();
});
