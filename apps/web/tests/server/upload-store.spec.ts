import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  maxUploadBytes,
  readUpload,
  saveUpload,
  sniffImageType,
} from "../../src/server/upload-store";

/*
 * 帖子配图的存取。
 *
 * 这一层的错法全都是安静的：存下一份伪装成 png 的 HTML，界面上只是
 * 「图裂了」；而实际后果是任何一个能发帖的人都能在站内页面里执行脚本。
 * 所以这里守的是类型判定的依据、文件名的来源，以及取回时的二次校验。
 */

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
const HTML = new TextEncoder().encode("<script>alert(1)</script>");

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-upload-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

describe("what counts as an image", () => {
  it("reads the file header, not the caller's word for it", () => {
    expect(sniffImageType(PNG)?.contentType).toBe("image/png");
    expect(sniffImageType(GIF)?.contentType).toBe("image/gif");
    /*
     * 一段 HTML 不管对方声称自己是什么类型，都不是图片。存下来并按图片
     * 发回去，浏览器嗅探出 HTML 就执行了。
     */
    expect(sniffImageType(HTML)).toBeNull();
  });

  it("refuses SVG even though it is a picture format", () => {
    /*
     * SVG 是一份可以带脚本的 XML。按图片发回去等于允许任何人在站内执行
     * 脚本——它是这一类接口最经典的一个口子。
     */
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(sniffImageType(svg)).toBeNull();
  });
});

describe("saving", () => {
  it("stores a real image and names it itself", () => {
    const saved = saveUpload(PNG);
    if ("error" in saved) throw new Error(saved.error);

    // 名字自己生成：用上传方给的名字，`../../` 就能写到目录外面去。
    expect(saved.name).toMatch(/^[0-9a-f]{32}\.png$/u);
    expect(readdirSync(resolve(directory, "uploads"))).toEqual([saved.name]);
  });

  it("rejects a non-image instead of storing it", () => {
    const saved = saveUpload(HTML);
    expect(saved).toHaveProperty("error");
    // 而且不能落盘——存下来再拒绝，目录里就多了一份可执行的东西。
    expect(readdirSync(directory)).toEqual([]);
  });

  it("rejects an oversized file", () => {
    const huge = new Uint8Array(maxUploadBytes + 1);
    huge.set(PNG);
    expect(saveUpload(huge)).toHaveProperty("error");
  });

  it("gives two identical uploads two different names", () => {
    /*
     * 按内容哈希命名的话，两个人传同一张图会共用一份文件——删掉其中一个人
     * 的帖子，另一个人的图跟着消失。
     */
    const first = saveUpload(PNG);
    const second = saveUpload(PNG);
    if ("error" in first || "error" in second) throw new Error("save failed");
    expect(first.name).not.toBe(second.name);
  });
});

describe("reading back", () => {
  it("serves the stored bytes with the type the header says", () => {
    const saved = saveUpload(GIF);
    if ("error" in saved) throw new Error(saved.error);

    const loaded = readUpload(saved.name);
    expect(loaded?.contentType).toBe("image/gif");
    expect(loaded?.bytes.byteLength).toBe(GIF.byteLength);
  });

  it("refuses a name that tries to walk out of the directory", () => {
    /*
     * 路由参数直接拼进路径是这类接口最常见的越权读文件。这里显式验一次：
     * 目录外确实有一个可读的文件，而它必须取不到。
     */
    writeFileSync(resolve(directory, "secret.json"), '{"token":"REDACTED"}');
    expect(readUpload("../secret.json")).toBeNull();
    expect(readUpload("/etc/hosts")).toBeNull();
  });

  it("returns null for a name that was never stored", () => {
    expect(readUpload(`${"0".repeat(32)}.png`)).toBeNull();
  });

  it("refuses to serve a file whose content stopped being an image", () => {
    /*
     * 目录里的东西未必只由这段代码写入。扩展名对、内容不是图片时，
     * 按扩展名发回去就是把一份 HTML 当图片送出去。
     */
    saveUpload(PNG);
    const name = `${"a".repeat(32)}.png`;
    writeFileSync(resolve(directory, "uploads", name), HTML);
    expect(readUpload(name)).toBeNull();
  });
});
