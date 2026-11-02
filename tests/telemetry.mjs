import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, get } from "node:http";
import { once } from "node:events";
import { openStore } from "../server/store.mjs";
import { api } from "../server/api.mjs";
import { summary } from "../server/analytics.mjs";

test("ingest, retry, cohorts, sequence funnel, config conflict and access control", async () => {
  const db = await openStore({ directory: "memory://" }),
    notices = [];
  const keys = { write: "test-write", admin: "test-operator" };
  const server = createServer(
    api(db, keys, (body) => notices.push(body), false),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (path, method = "GET", body, key) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (key || ""),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const malformedStatus = await new Promise((resolve, reject) => {
      get(base + "/", { path: "//[" }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      }).on("error", reject);
    });
    assert.equal(malformedStatus, 400);
    const day =
      Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z") -
      86400000;
    const make = (kind, player, session, offset, level = "") => ({
      id: randomUUID(),
      kind,
      player,
      session,
      level,
      at: new Date(day + offset).toISOString(),
    });
    const items = [
      make("session_start", "a", "first", 0),
      make("level_start", "a", "first", 1000, "Dock"),
      make("death", "a", "first", 2000, "Dock"),
      make("level_complete", "a", "first", 3000, "Dock"),
      make("session_start", "b", "second", 5000),
      make("level_complete", "b", "second", 6000, "Dock"),
      make("session_start", "a", "return", 86400000),
    ];
    assert.equal((await call("/api/events", "POST", items, "bad")).status, 401);
    assert.equal(
      (
        await call(
          "/api/events",
          "POST",
          [items[0], { ...items[1], kind: "unknown" }],
          keys.write,
        )
      ).status,
      400,
    );
    assert.equal((await summary(db, 7)).metrics.events, 0);
    const requests = await Promise.all([
      call("/api/events", "POST", items, keys.write),
      call("/api/events", "POST", items, keys.write),
    ]);
    assert.deepEqual(requests.map((r) => r.status).sort(), [200, 201]);
    assert.equal(notices.length, 1);
    assert.equal((await call("/api/summary")).status, 401);
    const snap = (await call("/api/summary", "GET", undefined, keys.admin))
      .data;
    assert.deepEqual(snap.metrics, {
      events: 7,
      players: 2,
      sessions: 3,
      deaths: 1,
    });
    assert.deepEqual(snap.funnel, { started: 3, entered: 1, cleared: 1 });
    assert.deepEqual(snap.retention, { eligible: 2, returned: 1 });
    assert.equal(snap.series.length, 7);
    const filtered = await call(
      "/api/events?kind=death&q=dock",
      "GET",
      undefined,
      keys.admin,
    );
    assert.equal(filtered.data.rows.length, 1);
    assert.equal(filtered.data.rows[0].id, items[2].id);
    const next = {
      version: 1,
      value: { difficulty: "hard", bonusXp: 2, eventBanner: "Double XP" },
    };
    assert.equal(
      (await call("/api/config", "PUT", next, keys.write)).status,
      403,
    );
    const result = await Promise.all([
      call("/api/config", "PUT", next, keys.admin),
      call("/api/config", "PUT", next, keys.admin),
    ]);
    assert.deepEqual(result.map((x) => x.status).sort(), [200, 409]);
    assert.deepEqual((await call("/api/config")).data.value, next.value);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
