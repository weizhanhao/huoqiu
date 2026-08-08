export interface Decimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

declare const monetaryKind: unique symbol;

export type Money = Decimal & { readonly [monetaryKind]: "Money" };
export type Price = Decimal & { readonly [monetaryKind]: "Price" };
export type Quantity = Decimal & { readonly [monetaryKind]: "Quantity" };

export const MAX_PRECISION = 38;
export const MAX_SCALE = 18;
export const MAX_INTEGER_DIGITS = 20;
export const MAX_RAW_LENGTH = 40;

export const DECIMAL_LIMITS = {
  precision: MAX_PRECISION,
  scale: MAX_SCALE,
  integerDigits: MAX_INTEGER_DIGITS,
  rawLength: MAX_RAW_LENGTH,
} as const;

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/u;
const MAX_COEFFICIENT_MAGNITUDE = 10n ** BigInt(MAX_PRECISION) - 1n;

const decimalMagnitude = (coefficient: bigint): bigint =>
  coefficient < 0n ? -coefficient : coefficient;

const assertScale = (scale: number): void => {
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new RangeError("Decimal scale must be a non-negative safe integer");
  }
  if (scale > MAX_SCALE) {
    throw new RangeError(`Decimal scale exceeds MAX_SCALE (${MAX_SCALE})`);
  }
};

const assertCoefficient = (coefficient: bigint, scale: number): void => {
  if (typeof coefficient !== "bigint") {
    throw new TypeError("Decimal coefficient must be a bigint");
  }

  const magnitude = decimalMagnitude(coefficient);
  if (magnitude > MAX_COEFFICIENT_MAGNITUDE) {
    throw new RangeError(
      `Decimal precision exceeds MAX_PRECISION (${MAX_PRECISION})`,
    );
  }

  const coefficientDigits = magnitude === 0n ? 0 : magnitude.toString().length;
  const precision = Math.max(coefficientDigits, scale);
  const integerDigits = Math.max(coefficientDigits - scale, 0);

  if (precision > MAX_PRECISION) {
    throw new RangeError(
      `Decimal precision exceeds MAX_PRECISION (${MAX_PRECISION})`,
    );
  }
  if (integerDigits > MAX_INTEGER_DIGITS) {
    throw new RangeError(
      `Decimal integer digits exceed MAX_INTEGER_DIGITS (${MAX_INTEGER_DIGITS})`,
    );
  }
};

const normalizeDecimal = (coefficient: bigint, scale: number): Decimal => {
  assertScale(scale);
  assertCoefficient(coefficient, scale);

  if (coefficient === 0n) {
    return { coefficient: 0n, scale: 0 };
  }

  let normalizedCoefficient = coefficient;
  let normalizedScale = scale;

  while (normalizedScale > 0 && normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedScale -= 1;
  }

  const normalized = {
    coefficient: normalizedCoefficient,
    scale: normalizedScale,
  };

  assertCoefficient(normalized.coefficient, normalized.scale);
  return normalized;
};

export const parseDecimal = (value: string): Decimal => {
  if (typeof value !== "string") {
    throw new TypeError(`Expected a decimal string, received ${String(value)}`);
  }
  if (value.length > MAX_RAW_LENGTH) {
    throw new RangeError(
      `Decimal raw length exceeds MAX_RAW_LENGTH (${MAX_RAW_LENGTH})`,
    );
  }
  if (!DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`Expected a decimal string, received ${value}`);
  }

  const negative = value.startsWith("-");
  const unsigned =
    value.startsWith("-") || value.startsWith("+") ? value.slice(1) : value;
  const decimalIndex = unsigned.indexOf(".");
  const integerPart =
    decimalIndex === -1 ? unsigned : unsigned.slice(0, decimalIndex);
  const fractionPart =
    decimalIndex === -1 ? "" : unsigned.slice(decimalIndex + 1);
  const significantIntegerDigits = integerPart.replace(/^0+/u, "").length;
  const precision = significantIntegerDigits + fractionPart.length;

  if (precision > MAX_PRECISION) {
    throw new RangeError(
      `Decimal precision exceeds MAX_PRECISION (${MAX_PRECISION})`,
    );
  }
  if (significantIntegerDigits > MAX_INTEGER_DIGITS) {
    throw new RangeError(
      `Decimal integer digits exceed MAX_INTEGER_DIGITS (${MAX_INTEGER_DIGITS})`,
    );
  }
  if (fractionPart.length > MAX_SCALE) {
    throw new RangeError(`Decimal scale exceeds MAX_SCALE (${MAX_SCALE})`);
  }

  const magnitude = BigInt(`${integerPart}${fractionPart}`);
  const coefficient = negative ? -magnitude : magnitude;

  return normalizeDecimal(coefficient, fractionPart.length);
};

export const formatDecimal = ({ coefficient, scale }: Decimal): string => {
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
