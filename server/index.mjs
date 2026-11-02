import next from "next";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { openStore } from "./store.mjs";
import { api } from "./api.mjs";
import { credentials, same } from "./credentials.mjs";
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 3043),
  dev = process.argv.includes("--dev");
const demo =
  process.env.PUBLIC_DEMO === "1" ||
  (!process.env.DATABASE_URL &&
    process.env.PUBLIC_DEMO !== "0" &&
    ["localhost", "127.0.0.1"].includes(host));
const keys = await credentials();
const store = await openStore({
  url: process.env.DATABASE_URL,
  directory: process.env.GAMEPULSE_DATA_DIR || ".data/postgres",
  seed:
    process.env.SEED_DEMO === "1" ||
    (demo && !process.env.DATABASE_URL && process.env.SEED_DEMO !== "0"),
});
const app = next({ dev, hostname: host, port });
await app.prepare();
const handle = app.getRequestHandler();
const ws = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const route = api(
  store,
  keys,
  (body) => {
    for (const peer of ws.clients)
      if (peer.readyState === WebSocket.OPEN && peer.authed)
        peer.send(JSON.stringify(body));
  },
  demo,
);
const server = createServer((req, res) =>
  req.url.startsWith("/api/") ? route(req, res) : handle(req, res),
);
server.on("upgrade", (req, socket, head) => {
  if (req.url.split("?")[0] === "/stream") {
    ws.handleUpgrade(req, socket, head, (peer) => {
      const timeout = setTimeout(() => peer.close(1008), 5000);
      peer.once("close", () => clearTimeout(timeout));
      peer.once("message", (raw) => {
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          return peer.close(1008);
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return peer.close(1008);
        }
        if (!demo && !same(data.key, keys.admin)) return peer.close(1008);
        clearTimeout(timeout);
        peer.authed = true;
        peer.send(JSON.stringify({ type: "ready" }));
      });
    });
  } else if (dev) {
    app.getUpgradeHandler()(req, socket, head);
  } else socket.destroy();
});
server.listen(port, host, () =>
  console.log("GamePulse listening on http://" + host + ":" + port),
);
async function stop() {
  for (const client of ws.clients) client.terminate();
  server.close();
  await app.close();
  await store.close();
  process.exit(0);
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
