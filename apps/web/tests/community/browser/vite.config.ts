import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));

export default {
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: "next/link",
        replacement: fileURLToPath(new URL("./next-link.tsx", import.meta.url)),
      },
      {
        find: "../features/real-finance/finance-snapshot.server",
        replacement: fileURLToPath(
          new URL("./finance-snapshot.server.ts", import.meta.url),
        ),
      },
    ],
  },
  root,
};
