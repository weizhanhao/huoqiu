import { describe, expect, it } from "vitest";

import {
  drawWatermark,
  watermarkFontSize,
  watermarkPadding,
} from "../../src/lib/watermark";

/*
 * 图片水印。
 *
 * 站内的图片从不上传服务器（发帖栏写明「仅本地预览，不上传网络」），
 * 所以水印在浏览器里做。这一份守的是「水印真的看得见」：
 * 看不见的水印等于没加，而开关还是打开的——那就是一个骗人的开关。
 */

/** 只记录调用顺序的假上下文，不碰真实 canvas。 */
const fakeContext = () => {
  const calls: string[] = [];
  const state: Record<string, unknown> = {};
  return {
    calls,
    context: {
      set fillStyle(value: unknown) {
        state.fillStyle = value;
        calls.push("set:fillStyle");
      },
      fillText: (text: string) => calls.push(`fillText:${text}`),
      set font(value: unknown) {
        state.font = value;
      },
      set lineWidth(value: unknown) {
        state.lineWidth = value;
      },
      set strokeStyle(value: unknown) {
        state.strokeStyle = value;
        calls.push("set:strokeStyle");
      },
      strokeText: (text: string) => calls.push(`strokeText:${text}`),
      set textAlign(value: unknown) {
        state.textAlign = value;
      },
      set textBaseline(value: unknown) {
        state.textBaseline = value;
      },
    } as unknown as CanvasRenderingContext2D,
    state,
  };
};

describe("watermark geometry", () => {
  it("scales with the short edge so it reads on any size", () => {
    // 大图上按比例放大，但有上限，免得糊住半张照片。
    expect(watermarkFontSize(4000, 3000)).toBe(42);
    // 小图上有下限，否则缩成看不清的一撇。
    expect(watermarkFontSize(200, 120)).toBe(12);
    // 中间尺寸按短边比例走：800 × 0.04 = 32。
    expect(watermarkFontSize(1000, 800)).toBeCloseTo(32, 5);
  });

  it("keeps the inset proportional so it never touches the edge", () => {
    expect(watermarkPadding(1000, 800)).toBeCloseTo(20, 5);
    expect(watermarkPadding(400, 400)).toBeCloseTo(10, 5);
  });
});

describe("drawing the watermark", () => {
  it("strokes a dark outline before filling white so it stays legible", () => {
    const { calls, context } = fakeContext();

    drawWatermark(context, { height: 800, text: "张远", width: 1000 });

    /*
     * 顺序要紧：先描深色边、再填白字。反过来白字会被描边盖住，
     * 而只填白字的话，压在浅色照片上就看不见了——
     * 看不见的水印等于没加。
     */
    expect(calls).toEqual([
      "set:strokeStyle",
      "strokeText:张远",
      "set:fillStyle",
      "fillText:张远",
    ]);
  });

  it("draws nothing when there is no name to stamp", () => {
    const { calls, context } = fakeContext();

    drawWatermark(context, { height: 800, text: "", width: 1000 });

    // 没有作者名时不画——空水印只会在角落留下一块说不清的痕迹。
    expect(calls).toEqual([]);
  });
});
