import { fileURLToPath, URL } from "node:url";

export default {
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: [
      {
        find: /^next\/link$/u,
        replacement: fileURLToPath(
          new URL("./playwright/community/harness/link.tsx", import.meta.url),
        ),
      },
      {
        find: /^react-dom\/client$/u,
        replacement: fileURLToPath(
          new URL(
            "../../apps/web/node_modules/react-dom/client.js",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^react\/jsx-dev-runtime$/u,
        replacement: fileURLToPath(
          new URL(
            "../../apps/web/node_modules/react/jsx-dev-runtime.js",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^react\/jsx-runtime$/u,
        replacement: fileURLToPath(
          new URL(
            "../../apps/web/node_modules/react/jsx-runtime.js",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^react$/u,
        replacement: fileURLToPath(
          new URL(
            "../../apps/web/node_modules/react/index.js",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  root: fileURLToPath(
    new URL("./playwright/community/harness", import.meta.url),
  ),
};
