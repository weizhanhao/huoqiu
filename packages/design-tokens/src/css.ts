import { darkTokens, tokens } from "@huoqiu/design-tokens";

type TokenTree = Readonly<{
  [key: string]: string | TokenTree;
}>;

export class DesignTokenCssError extends Error {
  override readonly name = "DesignTokenCssError";
}

const SAFE_VARIABLE_NAME = /^--hq-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UNSAFE_VARIABLE_VALUE =
  /[\n\r;{}<>\\]|\/\*|\*\/|(?:url|expression)\s*\(/iu;

const kebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();

const collectVariables = (
  tree: TokenTree,
  path: readonly string[] = [],
): readonly (readonly [name: string, value: string])[] => {
  const entries = Object.entries(tree);
  if (entries.length === 0) {
    throw new DesignTokenCssError(
      "Token tree must contain at least one CSS token",
    );
  }

  return entries.flatMap(([key, value]) => {
    const nextPath = [...path, kebabCase(key)];

    if (typeof value !== "string") {
      return collectVariables(value, nextPath);
    }

    const variableName = `--hq-${nextPath.join("-")}`;
    if (!SAFE_VARIABLE_NAME.test(variableName)) {
      throw new DesignTokenCssError(
        `Expected a safe CSS token name, received ${variableName}`,
      );
    }
    if (value.trim().length === 0 || UNSAFE_VARIABLE_VALUE.test(value)) {
      throw new DesignTokenCssError(
        `Expected a safe CSS token value for ${variableName}`,
      );
    }

    return [[variableName, value] as const];
  });
};

const compareCodePoints = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const uniqueVariables = (
  tree: TokenTree,
): readonly (readonly [name: string, value: string])[] => {
  const variables = collectVariables(tree);
  const names = variables.map(([name]) => name);
  if (new Set(names).size !== names.length) {
    const duplicate = names.find(
      (name, index) => names.indexOf(name) !== index,
    );
    throw new DesignTokenCssError(`Duplicate CSS variable ${duplicate}`);
  }

  return variables.toSorted(([left], [right]) =>
    compareCodePoints(left, right),
  );
};

const declarationBlock = (
  variables: readonly (readonly [name: string, value: string])[],
  indent: string,
): string =>
  variables.map(([name, value]) => `${indent}${name}: ${value};`).join("\n");

export const tokensToCssVariables = (tree: TokenTree): string =>
  `:root {\n${declarationBlock(uniqueVariables(tree), "  ")}\n}\n`;

/**
 * 生成亮 + 暗两套变量。
 *
 * 主题解析优先级，与三种用户状态一一对应：
 * 1. `:root` —— 亮色基线，也是"跟随系统"在浅色下的结果。
 * 2. `@media (prefers-color-scheme: dark)` 内的 `:root:not([data-theme="light"])`
 *    —— 跟随系统且系统为深色。`:not()` 让显式选亮色的用户不被媒体查询翻掉。
 * 3. `:root[data-theme="dark"]` —— 用户显式选暗色，权重最高，
 *    在浅色系统下也生效。
 *
 * `dark` 必须是 `light` 的严格子集：只有亮色里已经存在的变量才允许覆盖。
 * 否则暗色会凭空引入一个亮色下未定义的变量，导致跟随系统的浅色用户拿到空值。
 */
export const tokensToThemedCssVariables = (
  light: TokenTree,
  dark: TokenTree,
): string => {
  const lightVariables = uniqueVariables(light);
  const darkVariables = uniqueVariables(dark);

  const lightNames = new Set(lightVariables.map(([name]) => name));
  const orphan = darkVariables.find(([name]) => !lightNames.has(name));
  if (orphan !== undefined) {
    throw new DesignTokenCssError(
      `Dark theme overrides unknown CSS variable ${orphan[0]}`,
    );
  }

  const darkBlock = declarationBlock(darkVariables, "    ");

  return [
    ":root {",
    "  color-scheme: light;",
    declarationBlock(lightVariables, "  "),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    "    color-scheme: dark;",
    darkBlock,
    "  }",
    "}",
    "",
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    darkBlock,
    "}",
    "",
  ].join("\n");
};

/** 注入到 `<head>` 的完整主题变量表。 */
export const cssVariables = tokensToThemedCssVariables(tokens, darkTokens);

/** 仅亮色，供只需要单主题的消费方使用。 */
export const lightCssVariables = tokensToCssVariables(tokens);
