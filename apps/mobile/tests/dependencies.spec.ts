import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageManifest = Readonly<{
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  version?: string;
}>;

const readJson = <Value>(path: string): Value =>
  JSON.parse(readFileSync(path, "utf8")) as Value;

const require = createRequire(import.meta.url);
const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = readJson<PackageManifest>(join(mobileRoot, "package.json"));
const expoRoot = dirname(require.resolve("expo/package.json"));
const expoModules = readJson<Readonly<Record<string, string>>>(
  join(expoRoot, "bundledNativeModules.json"),
);
const lockfile = readFileSync(join(mobileRoot, "../../pnpm-lock.yaml"), "utf8");

/*
 * 这三个包的版本必须和 Expo 自己那份 bundledNativeModules.json 完全一致。
 *
 * 原生模块的版本一旦和 Expo Go 内置的对不上，App 会在启动时崩，报的是
 * 原生层的符号找不到——看不出和 package.json 有任何关系。所以这里不写
 * 「大概兼容」的范围，写死到具体版本，并且和 Expo 的清单对账。
 *
 * 版本档位跟着 SDK 走：SDK 54 是 2.28.0 / 4.1.1 / 0.5.1。升 SDK 时这三个
 * 数字要一起改，改错了这条用例会拦住。
 */
const expectedNativeDependencies = {
  "react-native-gesture-handler": "2.28.0",
  "react-native-reanimated": "4.1.1",
  /*
   * 图表是用 SVG 画的，所以这个版本也得钉死。
   *
   * Expo Go 里内置的是 15.12.1；装成别的版本，App 会在挂载第一个 <Svg> 时崩，
   * 报的是原生层符号找不到——和 package.json 看不出任何关系。
   */
  "react-native-svg": "15.12.1",
  "react-native-worklets": "0.5.1",
} as const;

/*
 * Expo 自己不在 bundledNativeModules.json 里——它就是那份清单的出处。除它以外，
 * 凡是没写 workspace:* 的依赖都该能在清单里查到；查不到意味着 Expo Go 里没有
 * 这个原生模块，装了也跑不起来。
 */
const notNativeModules = new Set(["expo"]);

/** ~17.0.11 与 17.0.11 算同一档；只比到次版本，补丁号可以自由些。 */
const majorMinor = (version: string): string =>
  version
    .replace(/^[~^]/u, "")
    .split(".")
    .slice(0, 2)
    .join(".");

describe("Expo native dependency graph", () => {
  it("keeps every native dependency on the version this SDK's Expo Go ships", () => {
    /*
     * 装错档位是真会发生的：在这个 SDK 54 的工程里执行 pnpm add
     * expo-image-picker，装来的是 57.0.10——npm 上的 latest 跟着最新 SDK 走。
     * 装上之后本地什么都不报，手机上一开就崩，报的是原生层符号找不到，
     * 看不出和 package.json 有任何关系。
     *
     * 三个 react-native-* 由下面那条钉到确切版本，这条管其余所有的。
     */
    for (const [dependency, declared] of Object.entries(
      manifest.dependencies ?? {},
    )) {
      if (declared === "workspace:*" || notNativeModules.has(dependency)) {
        continue;
      }
      const bundled = expoModules[dependency];
      expect(
        bundled,
        `${dependency} 不在 Expo Go 的原生模块清单里`,
      ).toBeDefined();
      expect(
        majorMinor(declared),
        `${dependency} 的版本档位和 Expo Go 对不上`,
      ).toBe(majorMinor(bundled ?? ""));
    }
  });

  it("locks every declared mobile workspace dependency for frozen installs", () => {
    const mobileImporter = lockfile
      .split("  apps/mobile:\n", 2)[1]
      ?.split("\n  apps/web:\n", 1)[0];

    expect(mobileImporter).toBeDefined();
    const workspaceDependencies = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter(([, version]) => version === "workspace:*");

    expect(workspaceDependencies.length).toBeGreaterThan(0);
    for (const [dependency] of workspaceDependencies) {
      const packageDirectory = dependency.replace(/^@huoqiu\//u, "");
      const escapedDependency = dependency.replace(
        /[.*+?^${}()|[\]\\]/gu,
        "\\$&",
      );
      expect(mobileImporter).toMatch(
        new RegExp(
          `["']?${escapedDependency}["']?:\\n\\s+specifier: workspace:\\*\\n\\s+version: link:\\.\\./\\.\\./packages/${packageDirectory}(?:\\n|$)`,
          "u",
        ),
      );
    }
  });

  it.each(Object.entries(expectedNativeDependencies))(
    "matches the Expo SDK bundled native module pin for %s",
    (dependency, expectedVersion) => {
      /* Expo 的清单写的是 ~x.y.z，package.json 要钉到确切版本。 */
      expect(expoModules[dependency]?.replace("~", "")).toBe(expectedVersion);
      expect(manifest.dependencies?.[dependency]).toBe(expectedVersion);

      const installedManifest = readJson<PackageManifest>(
        require.resolve(`${dependency}/package.json`),
      );
      expect(installedManifest.version).toMatch(
        new RegExp(
          `^${expectedVersion.replaceAll(".", "\\.").replace("~", "")}$`,
          "u",
        ),
      );
    },
  );
});
