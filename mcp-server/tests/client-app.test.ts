import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

describe("FWB Training Client HTTP connection", () => {
  let httpServer: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = createApp(loadConfig({
      PUBLIC_BASE_URL: "https://mcp.benjaminbenz.com",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
      SUPABASE_AUTH_SERVER_URL: "https://example.supabase.co/auth/v1",
    }));
    httpServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => httpServer.once("listening", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => error ? reject(error) : resolve()),
    );
  });

  it("publishes separate protected resource metadata for the client plugin", async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/client/mcp`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resource: "https://mcp.benjaminbenz.com/client/mcp",
      authorization_servers: ["https://example.supabase.co/auth/v1"],
    });
  });

  it("challenges unsigned workout writes with the client resource metadata URL", async () => {
    const response = await fetch(`${baseUrl}/client/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "https://mcp.benjaminbenz.com/.well-known/oauth-protected-resource/client/mcp",
    );
  });
});
