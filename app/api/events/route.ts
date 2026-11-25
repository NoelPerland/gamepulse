import { hostedDemoStore } from "../../../server/hosted-demo.mjs";
import { kinds } from "../../../server/domain.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || 7);
  const kind = url.searchParams.get("kind") || "";
  const term = url.searchParams.get("q") || "";
  const page = Number(url.searchParams.get("page") || 0);
  if (![7, 14, 30].includes(days) || (kind && !kinds.includes(kind)) || term.length > 80 || !Number.isInteger(page) || page < 0 || page > 10000)
    return Response.json({ error: "Invalid explorer filter." }, { status: 400 });
  try {
    const store = await hostedDemoStore();
    const rows = (await store.query(
      `SELECT id,kind,player,session,level,at FROM gamepulse.events WHERE at>=((now() at time zone 'UTC')::date-($1::int-1))::timestamp at time zone 'UTC' AND ($2='' OR kind=$2) AND ($3='' OR strpos(lower(player||' '||session||' '||level),lower($3))>0) ORDER BY at DESC,id DESC LIMIT 26 OFFSET $4`,
      [days, kind, term, page * 25],
    )).rows;
    return Response.json({ rows: rows.slice(0, 25), more: rows.length > 25 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Demo data unavailable. Try again." }, { status: 503 });
  }
}
