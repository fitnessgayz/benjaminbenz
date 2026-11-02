import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Express, Request, Response } from "express";

import { AuthenticationError, createAuthenticator } from "./auth.js";
import { createClientWorkoutMcpServer } from "./client-workout-mcp-server.js";
import type { AppConfig } from "./config.js";
import { createBenjaminMcpServer } from "./mcp-server.js";
import { SupabaseCoachingRepository } from "./repository.js";

function jsonRpcError(response: Response, status: number, message: string) {
  response.status(status).json({
    jsonrpc: "2.0",
    error: { code: status === 401 ? -32001 : -32603, message },
    id: null,
  });
}

export function createApp(config: AppConfig): Express {
  const publicUrl = new URL(config.PUBLIC_BASE_URL);
  const allowedHosts = [
    publicUrl.hostname,
    ...config.ADDITIONAL_ALLOWED_HOSTS,
    "localhost",
    "127.0.0.1",
  ];
  const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts });
  app.disable("x-powered-by");
  const authenticate = createAuthenticator(config);

  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "fwb-coach", version: "0.3.0" });
  });

  app.get("/.well-known/openai-apps-challenge", (_request, response) => {
    response.type("text/plain").send(config.OPENAI_APPS_CHALLENGE_TOKEN);
  });

  for (const [metadataPath, resourcePath, docsPath] of [
    ["/.well-known/oauth-protected-resource", "/mcp", "/docs"],
    ["/.well-known/oauth-protected-resource/client/mcp", "/client/mcp", "/docs/client"],
  ] as const) {
    app.get(metadataPath, (_request, response) => {
      response.json({
        resource: `${config.PUBLIC_BASE_URL}${resourcePath}`,
        authorization_servers: [config.SUPABASE_AUTH_SERVER_URL],
        scopes_supported: ["openid", "email", "profile"],
        bearer_methods_supported: ["header"],
        resource_documentation: `${config.PUBLIC_BASE_URL}${docsPath}`,
      });
    });
  }

  app.get("/docs", (_request, response) => {
    response.json({
      name: "FWB Training Assistant",
      purpose: "Private progress coaching for authenticated Fitness with Benjamin clients.",
      mcp_endpoint: `${config.PUBLIC_BASE_URL}/mcp`,
      privacy: "The server does not store full ChatGPT conversations. Writes require explicit client intent.",
      emergency_notice: "This service is not medical care or an emergency channel.",
    });
  });

  app.get("/docs/client", (_request, response) => {
    response.json({
      name: "FWB Training Client",
      purpose: "Save explicitly requested completed workouts to the signed-in client's iOS and web workout history.",
      mcp_endpoint: `${config.PUBLIC_BASE_URL}/client/mcp`,
      privacy: "Only workout details provided for a save request are written. Full ChatGPT conversations are not stored.",
    });
  });

  const methodNotAllowed = (_request: Request, response: Response) => {
    response.setHeader("Allow", "POST");
    jsonRpcError(response, 405, "Method not allowed. Use POST for MCP requests.");
  };

  function registerMcpEndpoint(
    path: string,
    protectedResourcePath: string,
    createServer: (repository: SupabaseCoachingRepository) => McpServer,
  ) {
    app.post(path, async (request: Request, response: Response) => {
      let server: McpServer | undefined;
      let transport: StreamableHTTPServerTransport | undefined;
      try {
        const context = await authenticate(request.header("authorization"));
        const repository = new SupabaseCoachingRepository(context.client, context.clientEmail);
        server = createServer(repository);
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

        let cleanedUp = false;
        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          void transport?.close();
          void server?.close();
        };
        response.once("close", cleanup);

        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      } catch (error) {
        if (error instanceof AuthenticationError) {
          response.setHeader(
            "WWW-Authenticate",
            `Bearer resource_metadata="${config.PUBLIC_BASE_URL}${protectedResourcePath}", scope="openid email profile"`,
          );
          jsonRpcError(response, 401, error.message);
          return;
        }

        console.error("MCP request failed", error);
        if (!response.headersSent) jsonRpcError(response, 500, "Internal server error");
      }
    });
    app.get(path, methodNotAllowed);
    app.delete(path, methodNotAllowed);
  }

  registerMcpEndpoint("/mcp", "/.well-known/oauth-protected-resource", createBenjaminMcpServer);
  registerMcpEndpoint(
    "/client/mcp",
    "/.well-known/oauth-protected-resource/client/mcp",
    createClientWorkoutMcpServer,
  );

  return app;
}
