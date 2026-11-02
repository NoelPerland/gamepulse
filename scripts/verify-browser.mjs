import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { WebSocket } from "ws";
const root = await mkdtemp(join(tmpdir(), "gamepulse-browser-"));
const net = createServer();
net.listen(0, "127.0.0.1");
await once(net, "listening");
const port = net.address().port;
await new Promise((r) => net.close(r));
const base = "http://127.0.0.1:" + port,
  write = randomUUID(),
  admin = randomUUID();
const proc = spawn(process.execPath, ["server/index.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    DATABASE_URL: "",
    GAMEPULSE_DATA_DIR: join(root, "db"),
    GAMEPULSE_ADMIN_KEY: admin,
    GAMEPULSE_WRITE_KEY: write,
    PUBLIC_DEMO: "1",
    SEED_DEMO: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
proc.stdout.on("data", (d) => {
  log += d.toString();
});
proc.stderr.on("data", (d) => {
  log += d.toString();
});
let browser, ws;
try {
  let ready = false;
  for (let n = 0; n < 150; n++) {
    if (proc.exitCode !== null) throw Error(log);
    try {
      ready = (await fetch(base + "/api/config")).ok;
    } catch {}
    if (ready) break;
    await delay(300);
  }
  assert(ready, log);
  const malformed = new WebSocket(base.replace("http", "ws") + "/stream");
  await once(malformed, "open");
  const rejected = once(malformed, "close");
  malformed.send("null");
  assert.equal((await rejected)[0], 1008);
  assert((await fetch(base + "/api/config")).ok);
  browser = await chromium.launch({
    channel: process.env.CHROME_PATH ? undefined : "chrome",
    executablePath: process.env.CHROME_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByText("Live stream", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Activity over time" }).waitFor();
  const chartData = await (await fetch(base + "/api/summary?days=7")).json();
  await page.getByLabel("Chart measure").selectOption("deaths");
  assert.equal(
    await page.locator(".chart-reading strong").innerText(),
    chartData.series.at(-1).deaths.toLocaleString(),
  );
  await page.getByLabel("Inspect chart date").focus();
  await page.keyboard.press("Home");
  assert.equal(
    await page.locator(".chart-reading strong").innerText(),
    chartData.series[0].deaths.toLocaleString(),
  );
  await page.getByLabel("Chart measure").selectOption("events");
  const start = await page.locator(".metrics strong").nth(1).innerText();
  if (process.env.QA_OUTPUT) {
    await mkdir(process.env.QA_OUTPUT, { recursive: true });
    await page.screenshot({
      path: join(process.env.QA_OUTPUT, "gamepulse-desktop.png"),
      fullPage: true,
    });
  }
  const connect = async () => {
    const socket = new WebSocket(base.replace("http", "ws") + "/stream");
    await once(socket, "open");
    socket.send("{}");
    const [ready] = await once(socket, "message");
    assert.equal(JSON.parse(ready).type, "ready");
    return socket;
  };
  ws = await connect();
  const incoming = once(ws, "message");
  const entry = {
    id: randomUUID(),
    kind: "session_start",
    player: "browser-test",
    session: "round-ui",
    at: new Date().toISOString(),
  };
  const ingest = async (e) =>
    (
      await fetch(base + "/api/events", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + write,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(e),
      })
    ).status;
  assert.equal(await ingest(entry), 201);
  assert.equal(JSON.parse((await incoming)[0]).accepted, 1);
  await page.waitForFunction(
    (v) => document.querySelectorAll(".metrics strong")[1]?.textContent !== v,
    start,
  );
  await page.getByRole("button", { name: "Explorer" }).click();
  await page.getByLabel("Search events").fill("browser-test");
  await page.getByRole("cell", { name: "round-ui", exact: true }).waitFor();
  ws.close();
  await once(ws, "close");
  ws = await connect();
  const second = once(ws, "message");
  assert.equal(
    await ingest({
      ...entry,
      id: randomUUID(),
      kind: "death",
      level: "Relay Tower",
    }),
    201,
  );
  assert.equal(JSON.parse((await second)[0]).accepted, 1);
  await page.getByRole("cell", { name: "death", exact: true }).waitFor();
  await page.getByRole("button", { name: "Remote config" }).click();
  await page.getByLabel("Operator key").fill(admin);
  await page.getByRole("button", { name: "Use key" }).click();
  await page.getByLabel("Event banner").fill("QA live test");
  await page.getByRole("button", { name: "Publish changes" }).click();
  let saved = false;
  for (let n = 0; n < 20; n++) {
    if (
      (await (await fetch(base + "/api/config")).json()).value.eventBanner ===
      "QA live test"
    ) {
      saved = true;
      break;
    }
    await delay(150);
  }
  assert(saved);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview" }).click();
  await page.getByRole("heading", { name: "Activity over time" }).waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  if (process.env.QA_OUTPUT)
    await page.screenshot({
      path: join(process.env.QA_OUTPUT, "gamepulse-phone.png"),
      fullPage: true,
    });
  assert.deepEqual(errors, []);
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
    [360, 640],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".funnel > div")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  console.log(
    "PASS production browser, live ingestion, WebSocket reconnect, event explorer, operator config publish, phone layout.",
  );
} finally {
  ws?.terminate();
  await browser?.close();
  if (proc.exitCode === null) {
    const exited = once(proc, "exit");
    proc.kill();
    await exited;
  }
  await rm(root, { recursive: true, force: true });
}
