/*
 * 给本地图片加作者水印。
 *
 * 站内的图片从不上传服务器——发帖那一栏写明了「仅本地预览，不上传网络」。
 * 所以水印也在浏览器里做：读原图，画到 canvas 上，右下角写一行作者名，
 * 导出成新的预览图。整个过程图片没有离开这台机器。
 *
 * 这不是装饰性的实现：开关打开后预览图上确实会出现水印，用户看得见。
 * 与其做一个「打开了但什么也没发生」的开关，不如做一件真的事。
 */

/** 水印字号占图片短边的比例，保证在大图小图上都读得清。 */
const FONT_RATIO = 0.04;
const MIN_FONT_PX = 12;
const MAX_FONT_PX = 42;
/** 离边距，同样按短边比例，避免大图上贴边、小图上挤出画面。 */
const PADDING_RATIO = 0.025;

export const watermarkFontSize = (width: number, height: number): number => {
  const shortEdge = Math.min(width, height);
  return Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, shortEdge * FONT_RATIO));
};

export const watermarkPadding = (width: number, height: number): number =>
  Math.min(width, height) * PADDING_RATIO;

/**
 * 把水印画到 canvas 上。
 *
 * 先描一层半透明深色再写白字：纯白字压在浅色照片上会看不见，
 * 而看不见的水印等于没加。
 */
export const drawWatermark = (
  context: CanvasRenderingContext2D,
  options: Readonly<{ height: number; text: string; width: number }>,
): void => {
  const { height, text, width } = options;
  if (text.length === 0) return;

  const fontSize = watermarkFontSize(width, height);
  const padding = watermarkPadding(width, height);

  context.font = `${fontSize.toFixed(0)}px sans-serif`;
  context.textAlign = "right";
  context.textBaseline = "bottom";

  // 描边在下、填充在上：浅色照片上白字也读得出来。
  context.lineWidth = Math.max(2, fontSize / 8);
  context.strokeStyle = "rgba(0, 0, 0, 0.55)";
  context.strokeText(text, width - padding, height - padding);

  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.fillText(text, width - padding, height - padding);
};

/**
 * 读一张本地图片，加水印，返回新的 data URL。
 *
 * 失败时返回 null，由调用方沿用原图——水印加不上不该让整张图消失。
 */
export const applyWatermark = async (
  source: string,
  text: string,
): Promise<string | null> => {
  try {
    const image = new Image();
    image.src = source;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (context === null) return null;

    context.drawImage(image, 0, 0);
    drawWatermark(context, {
      height: canvas.height,
      text,
      width: canvas.width,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
};
