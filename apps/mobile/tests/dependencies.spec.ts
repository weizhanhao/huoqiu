import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageManifest = Readonly<{
  dependencies?: Readonly<Record<string, string>>;
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

const expectedNativeDependencies = {
  "react-native-gesture-handler": "~2.32.0",
  "react-native-reanimated": "4.5.1",
  "react-native-worklets": "0.10.1",
} as const;

describe("Expo native dependency graph", () => {
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
