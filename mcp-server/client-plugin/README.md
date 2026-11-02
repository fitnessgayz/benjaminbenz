# FWB Training Client ChatGPT plugin

This is a separate client app connection for the FWB Training Client iOS app, starting with completed workout logging. It shares the authenticated MCP service in the parent directory but exposes only two tools at `/client/mcp`: account verification and `log_my_workout`.

The logging tool writes to `client_workout_logs` with the `session_id`, `set_id`, completion time, and exercise order used by iOS workout history. It uses the signed-in client's Supabase OAuth token and the table's row-level security policies. The tool does not receive a client email, user ID, or service-role key from ChatGPT.

## Local check

From the parent `mcp-server` directory, run `npm run check` and `npm run build`. Configure the environment using `.env.example`, start the server, and inspect `/docs/client` and `/.well-known/oauth-protected-resource/client/mcp`. Use a synthetic client account to test OAuth and verify that a saved workout appears in iOS Logs.

## Connection

The plugin manifest points to `https://mcp.benjaminbenz.com/client/mcp`. This host must resolve over HTTPS, serve the parent MCP application, and have Supabase OAuth 2.1 enabled before a ChatGPT connection can be created. Keep this as a private test until authentication and iOS history are verified with synthetic data.
