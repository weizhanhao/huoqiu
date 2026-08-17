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
  "react-native-worklets": "0.5.1",
} as const;

describe("Expo native dependency graph", () => {
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
