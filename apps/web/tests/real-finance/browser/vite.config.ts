import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));

export default {
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "next/link": fileURLToPath(
        new URL("../../community/browser/next-link.tsx", import.meta.url),
      ),
    },
  },
  root,
};
