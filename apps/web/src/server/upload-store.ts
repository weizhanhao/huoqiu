import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 帖子里的图片。
 *
 * 三件事必须做对，任何一件做错都不会在界面上表现出来：
 *
 * 1. 类型按**文件头**判，不按上传方给的 content-type 或文件名后缀判。
 *    对方说这是 image/png 而内容是一段 HTML，我们照单存下并按 png 发回，
 *    浏览器嗅探出 HTML 就执行了——一个能上传的人就能在站内任意页面执行脚本。
 *
 * 2. 文件名自己生成，不用上传方给的。用对方给的名字，`../../` 就能写到
 *    目录外面去。
 *
 * 3. 取的时候再校验一次文件名形状。这一层是给「以后有人换了调用方」准备的：
 *    路由参数直接拼进路径，是这类接口最常见的一种越权读文件。
 */

const uploadDirectory = (): string =>
  resolve(
    process.env.HUOQIU_SOCIAL_STORE_DIRECTORY ??
      resolve(process.cwd(), ".runtime/social"),
    "uploads",
  );

/*
 * 512 KB。
 *
 * 上限是从边界倒推的：图片走 JSON + base64，base64 会把体积撑到约 4/3，
 * 而边界给上传路径的请求体上限是 700 KB。512 KB 的图编码后约 683 KB，
 * 刚好留出 JSON 外壳的余量。
 */
export const maxUploadBytes = 512 * 1024;

type ImageType = Readonly<{ contentType: string; extension: string }>;

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, index) => bytes[index] === byte);

/**
 * 按文件头认类型。认不出来就是 null——不猜。
 *
 * SVG 不在列：它是一份可以带脚本的 XML，按图片发回去等于允许任何人在
 * 站内执行脚本。真要支持得先过一遍消毒，那是另一件事。
 */
export const sniffImageType = (bytes: Uint8Array): ImageType | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { contentType: "image/gif", extension: "gif" };
  }
  /* WebP 是 RIFF 容器：前四字节 RIFF，第 8-11 字节 WEBP。 */
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
};

/** 允许取回的文件名形状。自己生成的名字一定长这样。 */
const namePattern = /^[0-9a-f]{32}\.(?:gif|jpg|png|webp)$/u;

export const saveUpload = (
  bytes: Uint8Array,
): Readonly<{ error: string }> | Readonly<{ name: string }> => {
  if (bytes.byteLength === 0) return { error: "图片是空的。" };
  if (bytes.byteLength > maxUploadBytes) {
    return { error: "图片超过 512 KB，请压缩后再上传。" };
  }

  const type = sniffImageType(bytes);
  if (type === null) {
    /*
     * 说清楚是格式不认识，而不是含糊的「上传失败」——后者会让人反复重试
     * 同一个文件。
     */
    return { error: "只认 PNG、JPEG、GIF、WebP 四种图片。" };
  }

  const directory = uploadDirectory();
  mkdirSync(directory, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${type.extension}`;
  writeFileSync(resolve(directory, name), bytes);
  return { name };
};

export const readUpload = (
  name: string,
): Readonly<{ bytes: Buffer; contentType: string }> | null => {
  if (!namePattern.test(name)) return null;

  try {
    const bytes = readFileSync(resolve(uploadDirectory(), name));
    /*
     * 发回去的类型也按文件头判，不按扩展名判。存的时候校验过一次，
     * 但目录里的东西未必只由这段代码写入。
     */
    const type = sniffImageType(bytes);
    if (type === null) return null;
    return { bytes, contentType: type.contentType };
  } catch {
    return null;
  }
};
