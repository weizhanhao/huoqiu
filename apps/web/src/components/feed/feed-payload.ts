export const readPayloadString = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string,
): string => {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
};

export const readPayloadStringArray = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] => {
  const value = payload[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
};
