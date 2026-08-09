import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainModule, runCli } from "./cli.mts";
import { QualityGateError } from "./gate-core.mts";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

export const patchedImageSizeAdvisories = [
  "GHSA-w3rx-r6r6-pgpr",
  "GHSA-5p2g-fcmc-qvqq",
] as const;

const parserFixtures = ["icns-zero-entry", "jxl-zero-box"] as const;

const parserProbeSource = String.raw`
const { imageSize } = require(process.argv[1]);
const fixture = process.argv[2];
let input;
if (fixture === "icns-zero-entry") {
  input = Buffer.alloc(16);
  input.write("icns", 0, "ascii");
  input.writeUInt32BE(16, 4);
  input.write("ic10", 8, "ascii");
  input.writeUInt32BE(0, 12);
} else if (fixture === "jxl-zero-box") {
  input = Buffer.alloc(40);
  input.writeUInt32BE(12, 0);
  input.write("JXL ", 4, "ascii");
  input.writeUInt32BE(20, 12);
  input.write("ftyp", 16, "ascii");
  input.write("jxl ", 20, "ascii");
  input.writeUInt32BE(0, 32);
  input.write("jxlp", 36, "ascii");
} else {
  process.stderr.write("IMAGE_SIZE_PATCH_UNKNOWN_FIXTURE\n");
  process.exit(3);
}
try {
  imageSize(input);
  process.stderr.write("IMAGE_SIZE_PATCH_ACCEPTED_MALFORMED_INPUT\n");
  process.exit(2);
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stdout.write("IMAGE_SIZE_PATCH_REJECTED:" + fixture + ":" + name + "\n");
}
`;

const resolveMetroImageSize = (): string => {
  let packageRequire = createRequire(
    resolve(repositoryRoot, "apps/mobile/package.json"),
  );
  const expoManifest = packageRequire.resolve("expo/package.json");
  packageRequire = createRequire(expoManifest);
  const expoCliManifest = packageRequire.resolve("@expo/cli/package.json");
  packageRequire = createRequire(expoCliManifest);
  const metroManifest = packageRequire.resolve("metro/package.json");
  packageRequire = createRequire(metroManifest);
  return packageRequire.resolve("image-size");
};

export const verifyImageSizePatch = async (
  timeoutMilliseconds = 1_500,
): Promise<void> => {
  const imageSizeModule = resolveMetroImageSize();
  for (const fixture of parserFixtures) {
    let stdout: string;
    try {
      const result = await execFile(
        process.execPath,
        ["-e", parserProbeSource, imageSizeModule, fixture],
        {
          cwd: repositoryRoot,
          timeout: timeoutMilliseconds,
          killSignal: "SIGKILL",
          maxBuffer: 64 * 1024,
        },
      );
      stdout = result.stdout;
    } catch (error) {
      const failure = error as Error & {
        killed?: boolean;
        signal?: string;
        stderr?: string;
      };
      const code =
        failure.killed === true || failure.signal === "SIGKILL"
          ? "IMAGE_SIZE_PATCH_NON_TERMINATING"
          : "IMAGE_SIZE_PATCH_PROBE_FAILED";
      throw new QualityGateError(
        code,
        `${fixture}: ${(failure.stderr || failure.message).trim()}`,
      );
    }
    if (!stdout.includes(`IMAGE_SIZE_PATCH_REJECTED:${fixture}:`)) {
      throw new QualityGateError(
        "IMAGE_SIZE_PATCH_PROBE_INVALID",
        `${fixture}: ${stdout.trim()}`,
      );
    }
  }
};

export const dependencyAuditArguments = (): readonly string[] => [
  "audit",
  "--registry=https://registry.npmjs.org",
  "--audit-level",
  "high",
  ...patchedImageSizeAdvisories.flatMap((advisory) => ["--ignore", advisory]),
];

const verifyRemainingDependencyAudit = async (): Promise<void> => {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath === undefined ? "pnpm" : process.execPath;
  const prefix = npmExecPath === undefined ? [] : [npmExecPath];
  try {
    await execFile(command, [...prefix, ...dependencyAuditArguments()], {
      cwd: repositoryRoot,
      env: { ...process.env, CI: "true" },
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as Error & { stderr?: string; stdout?: string };
    throw new QualityGateError(
      "DEPENDENCY_AUDIT_HIGH_OR_CRITICAL",
      (failure.stderr || failure.stdout || failure.message)
        .trim()
        .slice(0, 4_000),
    );
  }
};

export const main = async (): Promise<void> => {
  await verifyImageSizePatch();
  await verifyRemainingDependencyAudit();
  process.stdout.write(
    `DEPENDENCY_PATCH VERIFIED image-size=1.2.1 advisories=${patchedImageSizeAdvisories.join(",")} audit=passed\n`,
  );
};

if (isMainModule(import.meta.url)) await runCli(main);
