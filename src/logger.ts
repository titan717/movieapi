export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }) + "\n");
}
