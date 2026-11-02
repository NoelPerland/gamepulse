import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/store.mjs";
test("disk restart retains seeded rows, config and seed marker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gamepulse-test-"));
  let db = await openStore({ directory: dir, seed: true });
  try {
    const count = async () =>
      (await db.query("SELECT count(*)::int n FROM gamepulse.events")).rows[0]
        .n;
    const n = await count();
    assert(n > 500);
    await db.query("UPDATE gamepulse.config SET version=7 WHERE id=1");
    await db.close();
    db = await openStore({ directory: dir, seed: true });
    assert.equal(await count(), n);
    assert.equal(
      (await db.query("SELECT version FROM gamepulse.config")).rows[0].version,
      7,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
