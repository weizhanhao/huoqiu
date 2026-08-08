import { tokens } from "@huoqiu/design-tokens";

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

export const tokensToCssVariables = (tree: TokenTree): string => {
  const variables = collectVariables(tree);
  const names = variables.map(([name]) => name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    const duplicate = names.find(
      (name, index) => names.indexOf(name) !== index,
    );
    throw new DesignTokenCssError(`Duplicate CSS variable ${duplicate}`);
  }

  const declarations = variables
    .toSorted(([left], [right]) => compareCodePoints(left, right))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `:root {\n${declarations}\n}\n`;
};

export const cssVariables = tokensToCssVariables(tokens);
