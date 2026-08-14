"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * 可横向滚动的表格容器。
 *
 * 宽表在窄屏上要能滚，而只能用鼠标拖的滚动容器对键盘用户等于滚不动——
 * 所以容器本身要可聚焦、要有名字。
 *
 * 两处按无障碍审查改过：
 *   1. role 从 group 改成 region。group 不是地标，读屏只念一句「分组」，
 *      也没法用地标快捷键跳过去；region + aria-label 才是可滚动区域的常规做法。
 *   2. tabIndex 按「是不是真的溢出」来给。桌面宽屏下表格根本不溢出时，
 *      这个 div 仍然白占一个 Tab 停靠点，读屏念出「XX 区域」而用户按方向键
 *      什么也滚不动。不溢出时给 -1：仍然可以被读屏查阅到，但不再拦 Tab。
 */
export function ScrollableTable({
  children,
  className,
  label,
}: Readonly<{
  children: ReactNode;
  className?: string | undefined;
  label: string;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;

    const measure = (): void => {
      setOverflowing(element.scrollWidth > element.clientWidth);
    };
    measure();

    // 表格内容和窗口宽度都会变，两者都要跟。
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [children]);

  return (
    <div
      aria-label={label}
      className={className ?? "watchlist-table-wrap"}
      ref={ref}
      role="region"
      tabIndex={overflowing ? 0 : -1}
    >
      {children}
    </div>
  );
}
