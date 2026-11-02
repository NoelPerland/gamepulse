import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function openStore({
  url,
  directory = ".data/postgres",
  seed = false,
} = {}) {
  if (!url && directory !== "memory://")
    await mkdir(directory, { recursive: true });
  const db = url
    ? new pg.Pool({ connectionString: url })
    : new PGlite(directory);
  const query = (s, p = []) => db.query(s, p);
  await query("CREATE SCHEMA IF NOT EXISTS gamepulse");
  await query(`CREATE TABLE IF NOT EXISTS gamepulse.events (
    id uuid PRIMARY KEY, kind text NOT NULL, player text NOT NULL, session text NOT NULL,
    level text NOT NULL DEFAULT '', at timestamptz NOT NULL, received timestamptz NOT NULL DEFAULT now()
  )`);
  await query("CREATE INDEX IF NOT EXISTS pulse_time ON gamepulse.events(at)");
  await query(
    "CREATE INDEX IF NOT EXISTS pulse_player ON gamepulse.events(player,at)",
  );
  await query(
    "CREATE TABLE IF NOT EXISTS gamepulse.config (id int PRIMARY KEY, version int NOT NULL, value jsonb NOT NULL, updated timestamptz NOT NULL DEFAULT now())",
  );
  await query(
    `INSERT INTO gamepulse.config(id,version,value) VALUES(1,1,'{"difficulty":"normal","bonusXp":1,"eventBanner":""}') ON CONFLICT DO NOTHING`,
  );
  const insert = async (events, execute = query) => {
    const values = events.flatMap((e) => [
      e.id,
      e.kind,
      e.player,
      e.session,
      e.level,
      e.at,
    ]);
    const tuples = events.map(
      (_, i) =>
        "(" +
        Array.from({ length: 6 }, (_, j) => "$" + (i * 6 + j + 1)).join(",") +
        ")",
    );
    return (
      await execute(
        "INSERT INTO gamepulse.events(id,kind,player,session,level,at) VALUES " +
          tuples.join(",") +
          " ON CONFLICT(id) DO NOTHING RETURNING id",
        values,
      )
    ).rows.length;
  };
  await query(
    "CREATE TABLE IF NOT EXISTS gamepulse.seeds (name text PRIMARY KEY)",
  );
  if (seed) {
    const seedOnce = async (client) => {
      const claimed = await client.query(
        "INSERT INTO gamepulse.seeds VALUES('first-flight') ON CONFLICT DO NOTHING RETURNING name",
      );
      if (!claimed.rows.length) return;
      const rows = demoEvents();
      for (let index = 0; index < rows.length; index += 250) {
        await insert(rows.slice(index, index + 250), (sql, params) =>
          client.query(sql, params),
        );
      }
    };
    if (url) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await seedOnce(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } else {
      await db.transaction(seedOnce);
    }
  }
  return { query, insert, close: () => (url ? db.end() : db.close()) };
}

export function demoEvents() {
  const result = [];
  const names = ["Dockyard", "Relay Tower", "Glass Canyon"];
  const now = Date.now();
  const today = Date.parse(
    new Date(now).toISOString().slice(0, 10) + "T00:00:00Z",
  );
  for (let i = 0; i < 68; i++) {
    const joined = i % 9;
    for (let visit = 0; visit < 4; visit++) {
      if (visit > 0 && i % (visit + 2) === 0) break;
      const daysAgo = joined - visit;
      if (daysAgo < 0) break;
      const time = Math.min(
        now - 600000,
        today - daysAgo * 86400000 + ((i * 31 + visit * 67) % 1380) * 60000,
      );
      const player = "pilot-" + String(i + 1).padStart(3, "0"),
        session = player + "-" + visit;
      let tick = 0;
      const emit = (kind, level = "") =>
        result.push({
          id: randomUUID(),
          player,
          session,
          kind,
          level,
          at: new Date(time + tick++ * 23000).toISOString(),
        });
      emit("session_start");
      for (let l = 0; l < 1 + ((i + visit) % 3); l++) {
        emit("level_start", names[l]);
        if ((i + l + visit) % 3 === 0) emit("death", names[l]);
        if ((i + visit + l) % 8 === 0) break;
        emit("level_complete", names[l]);
      }
      emit("session_end");
    }
  }
  return result;
}
