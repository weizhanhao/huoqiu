/**
 * Keycloak is the single documented fallback, not a second runtime provider.
 * This probe remains deliberately non-runnable after Better Auth acceptance.
 */
export const runKeycloakProbe = async (): Promise<never> => {
  throw new Error("AUTH_PROVIDER_NOT_SELECTED:keycloak");
};
