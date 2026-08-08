import { apiErrorSchema, type ApiError } from "@huoqiu/contracts";

const defaultApiError: ApiError = {
  code: "VALIDATION_FAILED",
  message: "输入不合法",
  details: { field: "query" },
  trace_id: "trace_fixture_1",
};

export const createApiErrorFixture = (
  overrides: Partial<ApiError> = {},
): ApiError =>
  apiErrorSchema.parse({
    ...defaultApiError,
    ...overrides,
    details: overrides.details ?? defaultApiError.details,
  });
