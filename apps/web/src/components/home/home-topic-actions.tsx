"use client";

import { useState } from "react";

export function HomeTopicActions() {
  const [favorited, setFavorited] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <div className="home-topic-action-wrap">
      <div className="home-topic-hero-actions" aria-label="热点操作">
        <button
          aria-pressed={favorited}
          onClick={() => {
            setFavorited((current) => !current);
            setMessage(favorited ? "已取消收藏" : "已收藏热点");
          }}
          type="button"
        >
          {favorited ? "★ 已收藏" : "☆ 收藏"}
        </button>
        <button onClick={() => setMessage("分享入口已打开")} type="button">
          ↗ 分享
        </button>
      </div>
      <span aria-live="polite" className="home-topic-action-feedback">
        {message}
      </span>
    </div>
  );
}
