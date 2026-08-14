"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./auth-shell.module.css";

/*
 * 登录页左栏的热股榜。
 *
 * 左边那句「行情取自公开接口」说完就该能当场看到。指数条只有三个数，
 * 下面还空着一大片；雪球的登录页那一块放的正是热榜。
 *
 * 数据是真的当日涨幅榜，不是配图。取不到就整块不渲染——登录页不该因为
 * 行情接口出问题而卡住或摆一句报错。
 */

const ROWS = 6;

type HotRow = Readonly<{
  changePercent: number | null;
  code: string;
  href: string | null;
  name: string;
}>;

export function AuthHotBoard() {
  const [rows, setRows] = useState<readonly HotRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/market/hot?market=cn&direction=gainers&rows=${String(ROWS)}`,
          { signal: controller.signal },
        );
        if (!response.ok || controller.signal.aborted) return;
        const data = (await response.json()) as { rows?: readonly HotRow[] };
        if (!controller.signal.aborted) setRows(data.rows ?? []);
      } catch {
        // 取不到就不显示这一块，登录本身照常可用。
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="auth-hot-heading" className={styles.hotBoard}>
      <div className={styles.hotHeading}>
        <h3 id="auth-hot-heading">今日涨幅榜</h3>
        <span>沪深 · 实时</span>
      </div>
      <ol className={styles.hotList}>
        {rows.map((row, index) => (
          <li key={row.code}>
            <span className={styles.hotRank}>{index + 1}</span>
            {/* 站内渲染不出来的代码不给链接：给了就是点进去一张空页。 */}
            {row.href === null ? (
              <span className={styles.hotName}>
                {row.name}
                <small>{row.code}</small>
              </span>
            ) : (
              <Link className={styles.hotName} href={row.href}>
                {row.name}
                <small>{row.code}</small>
              </Link>
            )}
            <strong className="watchlist-up">
              {row.changePercent === null
                ? "—"
                : `+${row.changePercent.toFixed(2)}%`}
            </strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
