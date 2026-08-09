import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const applicationDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workspaceDirectory = resolve(applicationDirectory, "../..");
const localPackageDirectory = resolve(
  applicationDirectory,
  "dist/node_modules/@huoqiu/contracts",
);

// tsx is a pinned direct development dependency and owns the matching esbuild
// runtime in pnpm's isolated graph. Resolving from tsx avoids adding a second
// compiler version solely for this build step.
const applicationRequire = createRequire(
  resolve(applicationDirectory, "package.json"),
);
const tsxRequire = createRequire(
  applicationRequire.resolve("tsx/package.json"),
);
const { build } = tsxRequire("esbuild");

await mkdir(localPackageDirectory, { recursive: true });
await build({
  bundle: true,
  entryPoints: [
    resolve(workspaceDirectory, "packages/contracts/src/m1/index.ts"),
  ],
  format: "esm",
  legalComments: "none",
  outfile: resolve(localPackageDirectory, "m1.js"),
  platform: "node",
  target: "node24",
});
await writeFile(
  resolve(localPackageDirectory, "package.json"),
  `${JSON.stringify(
    {
      exports: { "./m1": "./m1.js" },
      name: "@huoqiu/contracts",
      private: true,
      sideEffects: false,
      type: "module",
      version: "0.0.0-build",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
