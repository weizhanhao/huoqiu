import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const baseConfig = tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    /*
     * .mjs 脚本跑在 Node 里。
     *
     * 不声明这些全局名，no-undef 会把 fetch、AbortController、setTimeout
     * 一律报成未定义——脚本明明跑得好好的，报告里却是一片红，久了就没人看。
     * 这里只是把「本来就存在的东西」告诉 linter，没有放宽任何检查。
     */
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },
);

export default baseConfig;
