import { ApiError, event, kinds, config } from "./domain.mjs";
import { same } from "./credentials.mjs";
import { summary } from "./analytics.mjs";
async function read(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ApiError(415, "Use application/json.");
  const chunks = [];
  let n = 0;
  for await (const chunk of req) {
    n += chunk.length;
    if (n > 65536) throw new ApiError(413, "Maximum payload is 64 KiB.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ApiError(400, "Malformed JSON.");
  }
}
export function api(store, keys, broadcast, publicDemo) {
  return async (req, res) => {
    const method = req.method;
    const send = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
    try {
      let url;
      try {
        url = new URL(req.url, "http://localhost");
      } catch {
        throw new ApiError(400, "Malformed request URL.");
      }
      const p = url.pathname;
      if (p === "/api/events" && method === "POST") {
        if (!same(bearer, keys.write))
          throw new ApiError(401, "Ingestion key required.");
        const body = await read(req),
          batch = Array.isArray(body) ? body : [body];
        if (!batch.length || batch.length > 100)
          throw new ApiError(400, "Send 1–100 events per request.");
        const parsed = batch.map((e) => event(e));
        const accepted = await store.insert(parsed);
        if (accepted)
          broadcast({ type: "events", accepted, at: new Date().toISOString() });
        return send(accepted ? 201 : 200, {
          accepted,
          duplicates: batch.length - accepted,
        });
      }
      if (p === "/api/config" && method === "GET")
        return send(
          200,
          (
            await store.query(
              "SELECT version,value,updated FROM gamepulse.config WHERE id=1",
            )
          ).rows[0],
        );
      if (p === "/api/config" && method === "PUT") {
        if (!same(bearer, keys.admin))
          throw new ApiError(403, "Operator key required.");
        const input = await read(req),
          value = config(input);
        const row = (
          await store.query(
            "UPDATE gamepulse.config SET version=version+1,value=$1::jsonb,updated=now() WHERE id=1 AND version=$2 RETURNING version,value,updated",
            [JSON.stringify(value), input.version],
          )
        ).rows[0];
        if (!row)
          throw new ApiError(
            409,
            "Configuration changed. Reload it before publishing.",
          );
        broadcast({ type: "config", version: row.version });
        return send(200, row);
      }
      if (!publicDemo && !same(bearer, keys.admin))
        throw new ApiError(401, "Operator key required.");
      const days = Number(url.searchParams.get("days") || 7);
      if (![7, 14, 30].includes(days))
        throw new ApiError(400, "Choose 7, 14 or 30 days.");
      if (p === "/api/summary" && method === "GET")
        return send(200, { ...(await summary(store, days)), publicDemo });
      if (p === "/api/events" && method === "GET") {
        const kind = url.searchParams.get("kind") || "",
          term = url.searchParams.get("q") || "";
        const page = Number(url.searchParams.get("page") || 0);
        if (
          (kind && !kinds.includes(kind)) ||
          term.length > 80 ||
          !Number.isInteger(page) ||
          page < 0 ||
          page > 10000
        )
          throw new ApiError(400, "Invalid explorer filter.");
        const rows = (
          await store.query(
            `SELECT id,kind,player,session,level,at FROM gamepulse.events WHERE at>=((now() at time zone 'UTC')::date-($1::int-1))::timestamp at time zone 'UTC' AND ($2='' OR kind=$2) AND ($3='' OR strpos(lower(player||' '||session||' '||level),lower($3))>0) ORDER BY at DESC,id DESC LIMIT 26 OFFSET $4`,
            [days, kind, term, page * 25],
          )
        ).rows;
        return send(200, { rows: rows.slice(0, 25), more: rows.length > 25 });
      }
      throw new ApiError(404, "Route not found.");
    } catch (e) {
      send(e instanceof ApiError ? e.status : 500, {
        error: e instanceof ApiError ? e.message : "Database request failed.",
      });
    }
  };
}
