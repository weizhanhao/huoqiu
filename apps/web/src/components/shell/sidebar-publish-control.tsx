"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAccountSession } from "../../features/account/account-session";

export function SidebarPublishControl() {
  const { account, publish } = useAccountSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRootRef.current
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!composerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComposerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [composerOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <div
        className="sidebar-publish-wrap"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setMenuOpen(false);
          }
        }}
        ref={menuRootRef}
      >
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="sidebar-publish"
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          <span>发帖</span>
        </button>
        {menuOpen ? (
          <div className="sidebar-publish-menu" role="menu">
            <button
              onClick={() => {
                setMenuOpen(false);
                setComposerOpen(true);
              }}
              role="menuitem"
              type="button"
            >
              发讨论
            </button>
            <Link href="/publish" role="menuitem" target="_blank">
              发长文
            </Link>
          </div>
        ) : null}
      </div>
      {composerOpen ? (
        <div
          className="discussion-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setComposerOpen(false);
          }}
          role="presentation"
        >
          <section
            aria-labelledby="discussion-modal-title"
            aria-modal="true"
            className="discussion-modal"
            role="dialog"
          >
            <header>
              <h2 id="discussion-modal-title">有什么消息告诉大家</h2>
              <button
                aria-label="关闭"
                onClick={() => setComposerOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="discussion-composer">
              <textarea
                aria-label="讨论内容"
                onChange={(event) => setContent(event.target.value)}
                placeholder="发表你的观点..."
                value={content}
              />
              <footer>
                <span aria-label="编辑工具">☺ ▧ @ # $ ⓘ ｜ ▣ 长文</span>
                <button
                  disabled={!content.trim()}
                  onClick={async () => {
                    if (account === null) {
                      setNotice("公开内容无需登录；登录后即可发布");
                      return;
                    }
                    const error = await publish("我的最新观点", content.trim());
                    if (error !== null) {
                      setNotice(error);
                      return;
                    }
                    setContent("");
                    setComposerOpen(false);
                    setNotice("讨论已发布");
                  }}
                  type="button"
                >
                  发布
                </button>
              </footer>
            </div>
          </section>
        </div>
      ) : null}
      {notice ? (
        <div
          aria-live="polite"
          className="sidebar-publish-notice"
          role="status"
        >
          ✓ {notice}
        </div>
      ) : null}
    </>
  );
}
