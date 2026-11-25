import { hostedDemoStore } from "../../../server/hosted-demo.mjs";
import { summary } from "../../../server/analytics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get("days") || 7);
  if (![7, 14, 30].includes(days))
    return Response.json({ error: "Choose 7, 14 or 30 days." }, { status: 400 });
  try {
    const store = await hostedDemoStore();
    return Response.json(
      { ...(await summary(store, days)), publicDemo: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Demo data unavailable. Try again." }, { status: 503 });
  }
}
