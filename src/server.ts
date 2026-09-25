import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

const config = loadConfig();
const app = createApp(config);

serve({ fetch: app.fetch, port: config.port });
log("info", "server_started", { port: config.port, version: "0.3.0" });
