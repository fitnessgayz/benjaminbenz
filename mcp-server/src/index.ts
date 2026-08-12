import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

const httpServer = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Benjamin AI Coach MCP server listening on port ${config.PORT}`);
});

httpServer.on("error", (error) => {
  console.error("Could not start Benjamin AI Coach MCP server", error);
  process.exit(1);
});
