import reactHooks from "eslint-plugin-react-hooks";

import baseConfig from "./base.mjs";

const reactConfig = [
  ...baseConfig,
  {
    files: ["**/*.{jsx,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    ...reactHooks.configs.flat["recommended-latest"],
  },
];

export default reactConfig;
