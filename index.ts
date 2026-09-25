import { createApp } from "./src/app.js";
import { loadConfig } from "./src/config.js";

const app = createApp(loadConfig());

export default app;
