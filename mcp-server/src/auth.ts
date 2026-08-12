import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import type { AppConfig } from "./config.js";

export class AuthenticationError extends Error {
  constructor(message = "A valid Benjaminbenz.com login is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export type AuthenticatedContext = {
  accessToken: string;
  clientEmail: string;
  user: User;
  client: SupabaseClient;
};

export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new AuthenticationError();
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match?.[1]) {
    throw new AuthenticationError("The authorization header must contain a Bearer token.");
  }
  return match[1];
}

export function createAuthenticator(config: AppConfig) {
  const verifier = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return async (authorizationHeader: string | undefined): Promise<AuthenticatedContext> => {
    const accessToken = extractBearerToken(authorizationHeader);
    const { data, error } = await verifier.auth.getUser(accessToken);

    if (error || !data.user?.email) {
      throw new AuthenticationError();
    }

    const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    return { accessToken, clientEmail: data.user.email.toLowerCase(), user: data.user, client };
  };
}
