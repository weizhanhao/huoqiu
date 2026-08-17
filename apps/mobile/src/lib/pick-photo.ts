import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { decodedBytes } from "./base64-size";

/*
 * 从相册选一张图，压到能上传的大小。
 *
 * 服务端卡 512 KB（apps/web/src/server/upload-store.ts）。手机拍的原图动辄
 * 三五兆，直接送上去必然被退——而用户看到的是「选完图、等了半天、失败」。
 * 所以压缩放在这一侧：先把长边缩到 1600，再按质量逐档压，直到进得去为止。
 *
 * 逐档压而不是一次压到最狠：大部分照片第一档就过了，没必要人人都拿到一张糊图。
 */

const MAX_BYTES = 512 * 1024;
const MAX_EDGE = 1600;
/* 从清晰往下试。到 0.3 还进不去的，多半是超大分辨率的截图或长图。 */
const QUALITY_STEPS = [0.7, 0.5, 0.3] as const;

export type PickPhotoResult =
  | Readonly<{ base64: string; kind: "picked" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "failed"; message: string }>;

export const pickPhoto = async (): Promise<PickPhotoResult> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    /*
     * 说清楚去哪儿开。只说「没有权限」的话，用户会反复点这个按钮——而系统
     * 那个弹窗被拒过一次之后就不会再出现了。
     */
    return {
      kind: "failed",
      message: "没有相册权限。去「设置 - 火球 - 照片」里打开后再试。",
    };
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  if (picked.canceled) return { kind: "cancelled" };

  const asset = picked.assets[0];
  if (asset === undefined) return { kind: "cancelled" };

  for (const compress of QUALITY_STEPS) {
    const image = await ImageManipulator.manipulate(asset.uri)
      /* 只给宽度，高度按原比例算——两个都给会把竖图压扁。 */
      .resize({ width: Math.min(asset.width, MAX_EDGE) })
      .renderAsync();
    const saved = await image.saveAsync({
      base64: true,
      compress,
      format: SaveFormat.JPEG,
    });
    const { base64 } = saved;
    if (base64 === undefined) {
      return { kind: "failed", message: "这张图读不出来，换一张试试。" };
    }
    if (decodedBytes(base64) <= MAX_BYTES) {
      return { base64, kind: "picked" };
    }
  }

  return {
    kind: "failed",
    message: "这张图压到最小还是超过 512 KB，先裁一下再传。",
  };
};
