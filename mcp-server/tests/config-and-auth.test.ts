import { describe, expect, it } from "vitest";

import { AuthenticationError, extractBearerToken } from "../src/auth.js";
import { loadConfig } from "../src/config.js";

describe("configuration and bearer parsing", () => {
  it("loads and normalizes valid configuration", () => {
    const config = loadConfig({
      PORT: "4000",
      PUBLIC_BASE_URL: "https://mcp.benjaminbenz.com/",
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
      SUPABASE_AUTH_SERVER_URL: "https://example.supabase.co/auth/v1/",
      ADDITIONAL_ALLOWED_HOSTS: " preview.example.com,PREVIEW.example.com ",
    });

    expect(config.PORT).toBe(4000);
    expect(config.PUBLIC_BASE_URL).toBe("https://mcp.benjaminbenz.com");
    expect(config.SUPABASE_AUTH_SERVER_URL).toBe("https://example.supabase.co/auth/v1");
    expect(config.ADDITIONAL_ALLOWED_HOSTS).toEqual(["preview.example.com"]);
  });

  it("accepts a bearer token and rejects other authorization schemes", () => {
    expect(extractBearerToken("Bearer token-value")).toBe("token-value");
    expect(() => extractBearerToken("Basic abc")).toThrow(AuthenticationError);
    expect(() => extractBearerToken(undefined)).toThrow(AuthenticationError);
  });
});
