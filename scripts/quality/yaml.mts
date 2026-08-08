import { parseDocument } from "yaml";

import { QualityGateError } from "./gate-core.mts";

export const parseYaml12 = (
  content: string,
  code: string,
  label: string,
): unknown => {
  const document = parseDocument(content, {
    merge: false,
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });
  const error = document.errors[0];
  if (error !== undefined) {
    throw new QualityGateError(code, `${label}: ${error.message}`);
  }
  try {
    return document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid YAML";
    throw new QualityGateError(code, `${label}: ${detail}`);
  }
};
