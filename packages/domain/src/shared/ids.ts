export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type UserId = Brand<string, "UserId">;
export type ListingId = Brand<string, "ListingId">;
export type PostId = Brand<string, "PostId">;
export type PortfolioId = Brand<string, "PortfolioId">;

const createId = <Name extends string>(
  value: string,
  name: Name,
): Brand<string, Name> => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value.trim() as Brand<string, Name>;
};

export const createUserId = (value: string): UserId =>
  createId(value, "UserId");

export const createListingId = (value: string): ListingId =>
  createId(value, "ListingId");

export const createPostId = (value: string): PostId =>
  createId(value, "PostId");

export const createPortfolioId = (value: string): PortfolioId =>
  createId(value, "PortfolioId");
