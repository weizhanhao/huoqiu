export interface Decimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

declare const monetaryKind: unique symbol;

export type Money = Decimal & { readonly [monetaryKind]: "Money" };
export type Price = Decimal & { readonly [monetaryKind]: "Price" };
export type Quantity = Decimal & { readonly [monetaryKind]: "Quantity" };

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/u;

const normalizeDecimal = (coefficient: bigint, scale: number): Decimal => {
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new RangeError("Decimal scale must be a non-negative safe integer");
  }

  if (coefficient === 0n) {
    return { coefficient: 0n, scale: 0 };
  }

  let normalizedCoefficient = coefficient;
  let normalizedScale = scale;

  while (normalizedScale > 0 && normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedScale -= 1;
  }

  return {
    coefficient: normalizedCoefficient,
    scale: normalizedScale,
  };
};

export const parseDecimal = (value: string): Decimal => {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`Expected a decimal string, received ${String(value)}`);
  }

  const negative = value.startsWith("-");
  const unsigned =
    value.startsWith("-") || value.startsWith("+") ? value.slice(1) : value;
  const decimalIndex = unsigned.indexOf(".");
  const integerPart =
    decimalIndex === -1 ? unsigned : unsigned.slice(0, decimalIndex);
  const fractionPart =
    decimalIndex === -1 ? "" : unsigned.slice(decimalIndex + 1);
  const magnitude = BigInt(`${integerPart}${fractionPart}`);
  const coefficient = negative ? -magnitude : magnitude;

  return normalizeDecimal(coefficient, fractionPart.length);
};

export const formatDecimal = ({ coefficient, scale }: Decimal): string => {
  if (typeof coefficient !== "bigint") {
    throw new TypeError("Decimal coefficient must be a bigint");
  }
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new RangeError("Decimal scale must be a non-negative safe integer");
  }

  const normalized = normalizeDecimal(coefficient, scale);
  if (normalized.coefficient === 0n) {
    return "0";
  }

  const negative = normalized.coefficient < 0n;
  const magnitude = negative ? -normalized.coefficient : normalized.coefficient;
  const digits = magnitude.toString().padStart(normalized.scale + 1, "0");
  const unsigned =
    normalized.scale === 0
      ? digits
      : `${digits.slice(0, -normalized.scale)}.${digits.slice(-normalized.scale)}`;

  return negative ? `-${unsigned}` : unsigned;
};

const powerOfTen = (exponent: number): bigint => 10n ** BigInt(exponent);

const align = (value: Decimal, scale: number): bigint =>
  value.coefficient * powerOfTen(scale - value.scale);

const calculate = (
  leftValue: string,
  rightValue: string,
  operation: (left: bigint, right: bigint) => bigint,
): string => {
  const left = parseDecimal(leftValue);
  const right = parseDecimal(rightValue);
  const scale = Math.max(left.scale, right.scale);

  return formatDecimal(
    normalizeDecimal(operation(align(left, scale), align(right, scale)), scale),
  );
};

export const addDecimal = (left: string, right: string): string =>
  calculate(
    left,
    right,
    (leftCoefficient, rightCoefficient) => leftCoefficient + rightCoefficient,
  );

export const subtractDecimal = (left: string, right: string): string =>
  calculate(
    left,
    right,
    (leftCoefficient, rightCoefficient) => leftCoefficient - rightCoefficient,
  );

export const createMoney = (value: string): Money =>
  parseDecimal(value) as Money;

export const createPrice = (value: string): Price =>
  parseDecimal(value) as Price;

export const createQuantity = (value: string): Quantity =>
  parseDecimal(value) as Quantity;
