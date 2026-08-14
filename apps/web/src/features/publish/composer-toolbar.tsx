"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  EmojiPicker,
  MentionPicker,
  StockPicker,
  TopicPicker,
} from "./composer-pickers";
import { ComposerIcon, type ComposerIconName } from "./composer-icons";
import styles from "./composer-toolbar.module.css";
import {
  cashtagToken,
  imageToken,
  mentionToken,
  topicToken,
} from "./composer-tokens";
import { useAccountSession } from "../account/account-session";

/*
 * 发帖框底下那一排小按钮。
 *
 * 每一个都真的做事：表情插字符、图片真上传、@ 从真实账号里选、# 从真实
 * 话题里选、$ 走站内的证券代码搜索、最后一个挂创作声明。
 *
 * 摆一排点不动的图标是最省事的做法，也是最坏的做法——用户会一个个点过去，
 * 每一次都以为是自己没点对。
 */

type Panel = "disclosure" | "emoji" | "image" | "mention" | "stock" | "topic";

/** 与服务端 maxUploadBytes 一致；两处不一致时以服务端为准，这里只是提前告知。 */
const MAX_IMAGE_BYTES = 512 * 1024;

/*
 * 读成 base64。
 *
 * 用 FileReader 而不是自己拿 btoa 拼：btoa 只吃 latin1，对二进制要先逐字节
 * 转成字符串，几百 KB 的图那样转会把主线程卡住。
 */
const toBase64 = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("read failed"));
    };
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      /* data:image/png;base64,XXXX —— 只要逗号后面那一段。 */
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });

/** 目前只有一种声明，所以用一个可空值而不是一组开关。 */
export type Disclosure = "ai" | null;

const BUTTONS: readonly Readonly<{
  icon: ComposerIconName;
  label: string;
  panel: Panel;
}>[] = [
  { icon: "emoji", label: "表情", panel: "emoji" },
  { icon: "image", label: "图片", panel: "image" },
  { icon: "mention", label: "提到某人", panel: "mention" },
  { icon: "topic", label: "话题", panel: "topic" },
  { icon: "stock", label: "股票", panel: "stock" },
  { icon: "disclosure", label: "创作声明", panel: "disclosure" },
];

export function ComposerToolbar({
  disclosure,
  onDisclosureChange,
  onInsert,
}: Readonly<{
  disclosure: Disclosure;
  onDisclosureChange: (next: Disclosure) => void;
  onInsert: (text: string) => void;
}>) {
  const { authorizedFetch } = useAccountSession();
  const [open, setOpen] = useState<Panel | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* 点到别处、按 Esc 都要收起来——一个关不掉的浮层比没有浮层更糟。 */
  useEffect(() => {
    if (open === null) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const insertAndClose = (text: string): void => {
    onInsert(text);
    setOpen(null);
  };

  const upload = async (file: File): Promise<void> => {
    /*
     * 本地先挡一次超大图。发出去再被拒，用户等一趟往返只为看一句报错，
     * 而这件事在选中文件的那一刻就已经知道了。
     */
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("图片超过 512 KB，请压缩后再上传。");
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      /*
       * 图片以 base64 装进 JSON，不用 multipart：站内的 Web 边界会把每个
       * 请求体完整读出来按 UTF-8 解码再扫一遍凭证，二进制过不了那道关。
       */
      const encoded = await toBase64(file);
      const response = await authorizedFetch("/api/social/uploads", {
        body: JSON.stringify({ data: encoded }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || data.url === undefined) {
        /* 说清楚为什么不行，否则用户会拿同一张图反复重试。 */
        setUploadError(data.error ?? "图片上传失败，请稍后再试。");
        return;
      }
      onInsert(imageToken(data.url));
    } catch {
      setUploadError("网络不通，图片没有上传。");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {disclosure === "ai" ? (
        <p className={styles.disclosureChip}>
          <span aria-hidden="true" className={styles.disclosureDot}>
            !
          </span>
          本文包含AI生成内容
          <button
            className={styles.disclosureClear}
            onClick={() => {
              onDisclosureChange(null);
            }}
            type="button"
          >
            撤销
          </button>
        </p>
      ) : null}

      {uploadError === null ? null : (
        <p aria-live="polite" className={styles.uploadError}>
          {uploadError}
        </p>
      )}

      <div className={styles.bar}>
        <div aria-label="发帖工具" className={styles.icons} role="group">
          {BUTTONS.map((button) => (
            <button
              aria-expanded={open === button.panel}
              aria-label={button.label}
              className={styles.icon}
              disabled={button.panel === "image" && uploading}
              key={button.panel}
              onClick={() => {
                /*
                 * 图片没有面板：直接开系统的文件选择框。为它造一个自定义
                 * 面板，只会在真正的选择框前面多挡一层。
                 */
                if (button.panel === "image") {
                  fileRef.current?.click();
                  return;
                }
                setOpen(open === button.panel ? null : button.panel);
              }}
              type="button"
            >
              <ComposerIcon name={button.icon} />
            </button>
          ))}
        </div>

        <span aria-hidden="true" className={styles.divider} />

        {/* 长文另开一页：标题、封面、分享范围塞进这个小框里，写和读都别扭。 */}
        <Link className={styles.longform} href="/studio/publish">
          <ComposerIcon name="longform" />
          长文
        </Link>
      </div>

      <input
        accept="image/png,image/jpeg,image/gif,image/webp"
        className={styles.file}
        onChange={(event) => {
          const file = event.target.files?.[0];
          /* 清空 value：同一张图连传两次，第二次 change 不会触发。 */
          event.target.value = "";
          if (file !== undefined) void upload(file);
        }}
        ref={fileRef}
        tabIndex={-1}
        type="file"
      />

      {open === null || open === "image" ? null : (
        <div className={styles.panel}>
          {open === "emoji" ? <EmojiPicker onPick={insertAndClose} /> : null}
          {open === "mention" ? (
            <MentionPicker
              onPick={(name) => {
                insertAndClose(mentionToken(name));
              }}
            />
          ) : null}
          {open === "topic" ? (
            <TopicPicker
              onPick={(tag) => {
                insertAndClose(topicToken(tag));
              }}
            />
          ) : null}
          {open === "stock" ? (
            <StockPicker
              onPick={(name, symbol) => {
                insertAndClose(cashtagToken(name, symbol));
              }}
            />
          ) : null}
          {open === "disclosure" ? (
            <ul className={styles.panelList}>
              <li>
                <button
                  className={styles.panelRow}
                  onClick={() => {
                    onDisclosureChange("ai");
                    setOpen(null);
                  }}
                  type="button"
                >
                  <span>本文包含AI生成内容</span>
                  {disclosure === "ai" ? (
                    <small aria-hidden="true">✓</small>
                  ) : null}
                </button>
              </li>
              <li>
                <button
                  className={styles.panelRow}
                  onClick={() => {
                    onDisclosureChange(null);
                    setOpen(null);
                  }}
                  type="button"
                >
                  <span>不添加创作声明</span>
                  {disclosure === null ? (
                    <small aria-hidden="true">✓</small>
                  ) : null}
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
