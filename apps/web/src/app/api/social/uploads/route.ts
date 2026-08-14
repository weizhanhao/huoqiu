import { NextResponse } from "next/server";

import { currentAccountId } from "../../../../server/session";
import { maxUploadBytes, saveUpload } from "../../../../server/upload-store";

/*
 * 帖子配图上传。
 *
 * 图片以 base64 装在 JSON 里传，不用 multipart。这不是偏好问题：站内的
 * Web 边界会把每个请求体完整读出来、按 UTF-8 解码、再扫一遍凭证，
 * 二进制的 multipart 既解不出来也过不了那道关。为传图去放宽边界能收的
 * 类型，等于在一道刻意设的控制上凿洞——所以是这一侧迁就它，不是反过来。
 *
 * 要登录。不要求的话，这就是一个任何人都能往服务器硬盘上写东西的接口。
 *
 * 类型与文件名的把关都在 upload-store 里：按文件头判类型、名字自己生成。
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const encoded = (payload as Record<string, unknown>).data;
  if (typeof encoded !== "string" || encoded.length === 0) {
    return NextResponse.json({ error: "没有收到图片。" }, { status: 400 });
  }

  /*
   * 先按编码长度挡一次，再解码。
   *
   * 反过来的话，一段超长的 base64 会先在内存里展开成完整的字节数组，
   * 然后才被拒绝——拒绝本身就成了消耗资源的手段。
   */
  if (encoded.length > Math.ceil((maxUploadBytes * 4) / 3) + 16) {
    return NextResponse.json(
      { error: "图片超过 512 KB，请压缩后再上传。" },
      { status: 413 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  } catch {
    return NextResponse.json({ error: "图片数据不完整。" }, { status: 400 });
  }

  const saved = saveUpload(bytes);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  return NextResponse.json(
    { url: `/api/social/uploads/${saved.name}` },
    { status: 201 },
  );
}
