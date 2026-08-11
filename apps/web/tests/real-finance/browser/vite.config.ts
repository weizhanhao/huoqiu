import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));

export default {
  esbuild: { jsx: "automatic" },
  root,
};
