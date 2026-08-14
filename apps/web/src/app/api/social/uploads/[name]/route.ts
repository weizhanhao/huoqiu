import { readUpload } from "../../../../../server/upload-store";

/*
 * 取回帖子配图。
 *
 * 不鉴权：图片嵌在公开帖子里，要求登录会让未登录读者看到一片裂图。文件名是
 * 128 位随机数，猜不出来；真正的把关是 readUpload 里的名字形状校验与
 * 二次类型嗅探。
 *
 * nosniff 是必须的：万一哪天类型判错，它能挡住浏览器自作主张把内容当
 * HTML 执行。
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: Readonly<{ params: Promise<{ name: string }> }>,
): Promise<Response> {
  const { name } = await context.params;
  const file = readUpload(name);
  if (file === null) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      /* 内容按名字不可变，可以长缓存。 */
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": file.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
