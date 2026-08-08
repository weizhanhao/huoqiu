import { tokens } from "./tokens.js";

type TokenTree = Readonly<{
  [key: string]: string | TokenTree;
}>;

const kebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();

const collectVariables = (
  tree: TokenTree,
  path: readonly string[] = [],
): readonly (readonly [name: string, value: string])[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const nextPath = [...path, kebabCase(key)];

    return typeof value === "string"
      ? [[`--hq-${nextPath.join("-")}`, value] as const]
      : collectVariables(value, nextPath);
  });

export const tokensToCssVariables = (tree: TokenTree): string => {
  const declarations = collectVariables(tree)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `:root {\n${declarations}\n}\n`;
};

export const cssVariables = tokensToCssVariables(tokens);
