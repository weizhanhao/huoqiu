/*
 * 在独立 distDir 中构建可切换的 Web 候选产物。
 *
 * Next 会在构建时重写受版本控制的 next-env.d.ts，让它指向当前 distDir。
 * 候选构建不应把源码工作树留脏，因此无论构建成功还是失败，都原样恢复文件。
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const nextBinary = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const nextEnvironmentPath = fileURLToPath(
  new URL("../next-env.d.ts", import.meta.url),
);

let originalNextEnvironment;
try {
  originalNextEnvironment = await readFile(nextEnvironmentPath);
} catch {
  process.stderr.write("WEB_RELEASE_BUILD_PREFLIGHT_FAILED\n");
  process.exit(1);
}

let exitCode = 1;
try {
  const child = spawn(process.execPath, [nextBinary, "build", "--webpack"], {
    env: {
      ...process.env,
      HUOQIU_NEXT_DIST_DIR: ".next-release",
    },
    stdio: "inherit",
  });
  exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} catch {
  process.stderr.write("WEB_RELEASE_BUILD_FAILED\n");
} finally {
  await writeFile(nextEnvironmentPath, originalNextEnvironment);
}

process.exitCode = exitCode;
