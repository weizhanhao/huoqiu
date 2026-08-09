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

const expectedNativeDependencies = {
  "react-native-reanimated": "4.5.1",
  "react-native-worklets": "0.10.1",
} as const;

describe("Expo native dependency graph", () => {
  it("pins react-native-gesture-handler exactly within the Expo SDK 57 range", () => {
    expect(expoModules["react-native-gesture-handler"]).toBe("~2.32.0");
    expect(manifest.dependencies?.["react-native-gesture-handler"]).toBe(
      "2.32.0",
    );

    const installedManifest = readJson<PackageManifest>(
      require.resolve("react-native-gesture-handler/package.json"),
    );
    expect(installedManifest.version).toBe("2.32.0");
    expect(lockfile).toMatch(
      /react-native-gesture-handler:\n\s+specifier: 2\.32\.0\n\s+version: 2\.32\.0(?:\(|\n)/u,
    );
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
    "declares Expo SDK 57 mapping for %s",
    (dependency, expectedVersion) => {
      expect(expoModules[dependency]).toBe(expectedVersion);
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
