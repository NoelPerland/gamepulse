export async function summary(store, days) {
  const rows = async (sql, params = [days]) =>
    (await store.query(sql, params)).rows;
  const window =
    "at >= ((now() at time zone 'UTC')::date - ($1::int-1))::timestamp at time zone 'UTC'";
  const [metrics, series, levels, retention, funnel] = await Promise.all([
    rows(`SELECT count(*)::int events, count(distinct player)::int players,
      count(distinct (player,session)) FILTER(WHERE kind='session_start')::int sessions,
      count(*) FILTER(WHERE kind='death')::int deaths FROM gamepulse.events WHERE ${window}`),
    rows(`WITH days AS (SELECT generate_series((now() at time zone 'UTC')::date-($1::int-1),(now() at time zone 'UTC')::date,'1 day')::date AS day)
      SELECT d.day::text AS day,count(e.id)::int events,count(distinct e.player)::int players,count(e.id) FILTER(WHERE kind='death')::int deaths
      FROM days d LEFT JOIN gamepulse.events e ON (e.at at time zone 'UTC')::date=d.day GROUP BY d.day ORDER BY d.day`),
    rows(
      `SELECT level,count(*) FILTER(WHERE kind='level_start')::int starts,count(*) FILTER(WHERE kind='death')::int deaths,count(*) FILTER(WHERE kind='level_complete')::int clears FROM gamepulse.events WHERE ${window} AND level<>'' GROUP BY level ORDER BY deaths DESC,starts DESC,level LIMIT 25`,
    ),
    rows(`WITH dates AS (SELECT DISTINCT player,(at at time zone 'UTC')::date AS day FROM gamepulse.events),
      cohorts AS (SELECT player,min(day) joined FROM dates GROUP BY player),
      eligible AS (SELECT * FROM cohorts WHERE joined >= (now() at time zone 'UTC')::date-($1::int-1) AND joined < (now() at time zone 'UTC')::date)
      SELECT count(*)::int eligible,count(d.player)::int returned FROM eligible e LEFT JOIN dates d ON d.player=e.player AND d.day=e.joined+1`),
    rows(`WITH e AS (SELECT * FROM gamepulse.events WHERE ${window}), starts AS (SELECT player,session,min(at) t FROM e WHERE kind='session_start' GROUP BY player,session),
      steps AS (SELECT s.*, (SELECT min(at) FROM e WHERE player=s.player AND session=s.session AND kind='level_start' AND at>=s.t) entered FROM starts s)
      SELECT count(*)::int started,count(entered)::int entered,count(*) FILTER(WHERE EXISTS (SELECT 1 FROM e WHERE player=steps.player AND session=steps.session AND kind='level_complete' AND at>=steps.entered))::int cleared FROM steps`),
  ]);
  return {
    metrics: metrics[0],
    series,
    levels,
    retention: retention[0],
    funnel: funnel[0],
  };
}
