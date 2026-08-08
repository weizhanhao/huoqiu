export type D0PageState = "normal" | "loading" | "empty" | "error";

export const D0_FIXTURE_STATE_PARAMETER = "fixture_state";

export const normalizeD0FixtureState = (
  value: string | readonly string[] | undefined,
): D0PageState => {
  const candidate = typeof value === "string" ? value : value?.[0];
  return candidate === "loading" ||
    candidate === "empty" ||
    candidate === "error" ||
    candidate === "normal"
    ? candidate
    : "normal";
};

type RetryLocation = Readonly<{
  href: string;
  assign: (url: string) => void;
  reload: () => void;
}>;

export const retryD0FixtureState = (
  locationValue: RetryLocation | undefined = globalThis.location,
): void => {
  if (locationValue === undefined) {
    return;
  }

  const target = new URL(locationValue.href);
  if (target.searchParams.has(D0_FIXTURE_STATE_PARAMETER)) {
    target.searchParams.delete(D0_FIXTURE_STATE_PARAMETER);
    locationValue.assign(target.toString());
    return;
  }

  locationValue.reload();
};
