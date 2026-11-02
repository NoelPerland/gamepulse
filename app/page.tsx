"use client";
import { useEffect, useState, useCallback } from "react";
type Day = { day: string; events: number; players: number; deaths: number };
type Summary = {
  metrics: {
    events: number;
    players: number;
    sessions: number;
    deaths: number;
  };
  series: Day[];
  levels: { level: string; starts: number; deaths: number; clears: number }[];
  retention: { eligible: number; returned: number };
  funnel: { started: number; entered: number; cleared: number };
  publicDemo: boolean;
};
type EventRow = {
  id: string;
  at: string;
  kind: string;
  player: string;
  session: string;
  level: string;
};
type Config = {
  version: number;
  value: { difficulty: string; bonusXp: number; eventBanner: string };
  updated: string;
};
const kinds = [
  "session_start",
  "level_start",
  "death",
  "level_complete",
  "session_end",
];
const fmt = (n: number) => n.toLocaleString();
const dateLabel = (v: string) =>
  new Date(v + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
function Chart({ series }: { series: Day[] }) {
  const [i, pick] = useState<number | null>(null),
    [metric, set] = useState<"events" | "players" | "deaths">("events");
  const max = Math.max(1, ...series.map((d) => d[metric])),
    x = (n: number) => 38 + (n * 624) / Math.max(series.length - 1, 1),
    y = (v: number) => 177 - (v * 137) / max;
  const points = series.map((d, n) => x(n) + "," + y(d[metric])).join(" "),
    idx = Math.min(i ?? series.length - 1, series.length - 1),
    data = series[idx];
  return (
    <section className="graph">
      <div className="sectiontop">
        <div>
          <small>01 / VOLUME</small>
          <h2>Activity over time</h2>
        </div>
        <select
          aria-label="Chart measure"
          value={metric}
          onChange={(e) => set(e.target.value as typeof metric)}
        >
          <option value="events">Events</option>
          <option value="players">Players</option>
          <option value="deaths">Deaths</option>
        </select>
      </div>
      <svg
        viewBox="0 0 690 215"
        role="img"
        aria-label={"Daily " + metric + " over the selected period"}
        onPointerMove={(e) => {
          const bounds = e.currentTarget.getBoundingClientRect();
          const point = ((e.clientX - bounds.left) * 690) / bounds.width;
          const day = Math.round(((point - 38) / 624) * (series.length - 1));
          pick(Math.max(0, Math.min(day, series.length - 1)));
        }}
      >
        {[0, 0.5, 1].map((n) => (
          <g key={n}>
            <line
              x1="38"
              x2="662"
              y1={y(max * n)}
              y2={y(max * n)}
              stroke="#343b40"
              strokeDasharray="3 5"
            />
            <text x="30" y={y(max * n) + 4} textAnchor="end">
              {Math.round(max * n)}
            </text>
          </g>
        ))}
        <polygon
          points={"38,177 " + points + " 662,177"}
          fill="#b7ceb5"
          opacity=".07"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#b9d4b4"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {data && (
          <>
            <line
              x1={x(idx)}
              x2={x(idx)}
              y1="30"
              y2="178"
              stroke="#69756b"
              strokeDasharray="2 5"
            />
            <circle cx={x(idx)} cy={y(data[metric])} r="5" fill="#cfe8c8" />
          </>
        )}
        <text x="38" y="204">
          {dateLabel(series[0].day)}
        </text>
        <text x="662" y="204" textAnchor="end">
          {dateLabel(series.at(-1)!.day)}
        </text>
      </svg>
      <label className="scrub">
        <span>
          {data && dateLabel(data.day)} ·{" "}
          <b>
            {fmt(data?.[metric] ?? 0)} {metric}
          </b>
        </span>
        <input
          type="range"
          aria-label="Inspect chart date"
          min="0"
          max={series.length - 1}
          value={idx}
          onChange={(e) => pick(+e.target.value)}
        />
      </label>
    </section>
  );
}
export default function Dashboard() {
  const [tab, setTab] = useState("Overview"),
    [days, setDays] = useState(7),
    [key, setKey] = useState(""),
    [typed, type] = useState("");
  const [stats, S] = useState<Summary | null>(null),
    [rows, R] = useState<EventRow[]>([]),
    [more, M] = useState(false),
    [page, P] = useState(0),
    [kind, K] = useState(""),
    [q, Q] = useState("");
  const [cfg, C] = useState<Config | null>(null),
    [note, N] = useState(""),
    [error, E] = useState(""),
    [rev, B] = useState(0),
    [live, L] = useState(false),
    [auth, A] = useState(false);
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const r = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
          ...init.headers,
        },
      });
      const b = await r.json();
      if (!r.ok) {
        if (r.status === 401) A(true);
        throw Error(b.error || "Request failed");
      }
      return b;
    },
    [key],
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const s = await request("/api/summary?days=" + days);
        if (active) {
          S(s);
          A(false);
          E("");
        }
      } catch (e) {
        if (active) E((e as Error).message);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [days, rev, request]);
  useEffect(() => {
    let active = true;
    if (tab === "Explorer")
      request(
        "/api/events?" +
          new URLSearchParams({
            days: String(days),
            kind,
            q,
            page: String(page),
          }),
      )
        .then((d) => {
          if (active) {
            R(d.rows);
            M(d.more);
          }
        })
        .catch((e) => active && E(e.message));
    return () => {
      active = false;
    };
  }, [days, kind, q, page, tab, rev, request]);
  const configLoad = useCallback(
    () =>
      request("/api/config")
        .then((d) => {
          C(d);
          N("");
        })
        .catch((e) => E(e.message)),
    [request],
  );
  useEffect(() => {
    if (tab === "Remote config") void configLoad();
  }, [tab, configLoad]);
  useEffect(() => {
    let stop = false,
      timer: ReturnType<typeof setTimeout>,
      refresh: ReturnType<typeof setTimeout> | undefined,
      socket: WebSocket;
    const connect = () => {
      socket = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/stream",
      );
      socket.onopen = () => socket.send(JSON.stringify({ key }));
      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "ready") {
          L(true);
          B((n) => n + 1);
        } else if (msg.type === "events") {
          if (!refresh)
            refresh = setTimeout(() => {
              B((n) => n + 1);
              refresh = undefined;
            }, 200);
        } else if (msg.type === "config")
          N("Configuration changed. Reload to inspect the latest version.");
      };
      socket.onclose = () => {
        L(false);
        if (!stop) timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      clearTimeout(refresh);
      socket.close();
    };
  }, [key]);
  const selectTab = (name: string) => {
    setTab(name);
    E("");
    N("");
  };
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ▥ <strong>GamePulse</strong>
        </a>
        <span className="separator">/</span>
        <span>Mission control</span>
        <span className={"signal " + (live ? "on" : "")}>
          {live ? "Live stream" : "Connecting"}
        </span>
      </header>
      <div className="shell">
        <aside>
          <p className="label">WORKSPACE</p>
          <strong>Flight Recorder</strong>
          <p className="label second">CONSOLE</p>
          <nav>
            {["Overview", "Explorer", "Remote config"].map((name, i) => (
              <button
                key={name}
                aria-current={name === tab ? "page" : undefined}
                onClick={() => selectTab(name)}
              >
                <span>0{i + 1}</span>
                {name}
              </button>
            ))}
          </nav>
          <div className="asidefoot">
            GP / TELEMETRY
            <br />
            UTC reporting
          </div>
        </aside>
        <article>
          <div className="crumb">
            CONSOLE <i>/</i> {tab.toUpperCase()}
          </div>
          <div className="title">
            <div>
              <h1>
                {tab === "Overview"
                  ? "Player telemetry"
                  : tab === "Explorer"
                    ? "Event explorer"
                    : "Remote configuration"}
              </h1>
              <p>
                {tab === "Overview"
                  ? "A live read on sessions, progression and friction."
                  : tab === "Explorer"
                    ? "Inspect the events behind each signal."
                    : "Publish game tuning values without a client release."}
              </p>
            </div>
            {tab !== "Remote config" && (
              <select
                aria-label="Reporting period"
                value={days}
                onChange={(e) => {
                  setDays(+e.target.value);
                  P(0);
                }}
              >
                {[7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    Last {n} days
                  </option>
                ))}
              </select>
            )}
          </div>
          {stats?.publicDemo && (
            <div className="badge">PUBLIC DEMO · Synthetic flight sessions</div>
          )}
          {(auth || tab === "Remote config") && (
            <form
              className="access"
              onSubmit={(e) => {
                e.preventDefault();
                setKey(typed);
                type("");
                N("Key set for this tab.");
              }}
            >
              <label>
                Operator key
                <input
                  type="password"
                  value={typed}
                  onChange={(e) => type(e.target.value)}
                  placeholder="Enter operator key"
                  required
                />
              </label>
              <button>Use key</button>
            </form>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {note && <p role="status">{note}</p>}
          {tab === "Overview" && stats && (
            <>
              <div className="metrics">
                {[
                  ["Active players", fmt(stats.metrics.players)],
                  ["Sessions started", fmt(stats.metrics.sessions)],
                  ["Deaths recorded", fmt(stats.metrics.deaths)],
                  [
                    "Day 1 retention",
                    stats.retention.eligible
                      ? Math.round(
                          (100 * stats.retention.returned) /
                            stats.retention.eligible,
                        ) + "%"
                      : "—",
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <label>{k}</label>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <Chart series={stats.series} />
              <section className="bottom">
                <div>
                  <small>02 / CONVERSION</small>
                  <h2>Session funnel</h2>
                  {Object.entries(stats.funnel).map(([k, v], i) => (
                    <div className="funnel" key={k}>
                      <span>
                        {["Session start", "Enter a level", "Clear a level"][i]}
                      </span>
                      <b>{fmt(v)}</b>
                      <div
                        style={{
                          width:
                            (100 * v) / Math.max(1, stats.funnel.started) + "%",
                        }}
                      />
                    </div>
                  ))}
                  <p className="footnote">
                    Ordered steps within one session and reporting window. Day 1
                    retention: {stats.retention.returned} of{" "}
                    {stats.retention.eligible} eligible new players returned the
                    next UTC day.
                  </p>
                </div>
                <div>
                  <small>03 / FRICTION</small>
                  <h2>Level performance</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>Starts</th>
                        <th>Deaths</th>
                        <th>Clears</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.levels.map((l) => (
                        <tr key={l.level}>
                          <td>{l.level}</td>
                          <td>{l.starts}</td>
                          <td>{l.deaths}</td>
                          <td>{l.clears}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!stats.levels.length && (
                    <p>No level events in this window.</p>
                  )}
                </div>
              </section>
            </>
          )}
          {tab === "Overview" && !stats && !error && (
            <p role="status">Loading telemetry…</p>
          )}
          {tab === "Explorer" && (
            <section>
              <div className="filters">
                <input
                  aria-label="Search events"
                  placeholder="Find player, session or level"
                  value={q}
                  onChange={(e) => {
                    Q(e.target.value);
                    P(0);
                  }}
                />
                <select
                  aria-label="Event kind"
                  value={kind}
                  onChange={(e) => {
                    K(e.target.value);
                    P(0);
                  }}
                >
                  <option value="">All event types</option>
                  {kinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Time (UTC)",
                        "Event",
                        "Player",
                        "Session",
                        "Level",
                      ].map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {new Date(r.at)
                            .toISOString()
                            .slice(5, 19)
                            .replace("T", " ")}
                        </td>
                        <td>{r.kind}</td>
                        <td>{r.player}</td>
                        <td>{r.session}</td>
                        <td>{r.level || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && <p>No matching events.</p>}
              <div className="pages">
                <button disabled={!page} onClick={() => P(page - 1)}>
                  Previous
                </button>
                <span>Page {page + 1}</span>
                <button disabled={!more} onClick={() => P(page + 1)}>
                  Next
                </button>
              </div>
            </section>
          )}
          {tab === "Remote config" && cfg && (
            <form
              className="config"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const d = await request("/api/config", {
                    method: "PUT",
                    body: JSON.stringify({
                      version: cfg.version,
                      value: cfg.value,
                    }),
                  });
                  C(d);
                  E("");
                  N("Published version " + d.version);
                } catch (err) {
                  E((err as Error).message);
                }
              }}
            >
              <small>LIVE VALUES / VERSION {cfg.version}</small>
              <label>
                Difficulty
                <select
                  value={cfg.value.difficulty}
                  onChange={(e) =>
                    C({
                      ...cfg,
                      value: { ...cfg.value, difficulty: e.target.value },
                    })
                  }
                >
                  {["easy", "normal", "hard"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                XP multiplier
                <input
                  type="number"
                  min="1"
                  max="5"
                  step=".1"
                  value={cfg.value.bonusXp}
                  onChange={(e) =>
                    C({
                      ...cfg,
                      value: { ...cfg.value, bonusXp: +e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Event banner
                <input
                  maxLength={120}
                  value={cfg.value.eventBanner}
                  onChange={(e) =>
                    C({
                      ...cfg,
                      value: { ...cfg.value, eventBanner: e.target.value },
                    })
                  }
                />
              </label>
              <div>
                <button disabled={!key}>Publish changes</button>{" "}
                <button type="button" onClick={() => void configLoad()}>
                  Reload current
                </button>
              </div>
              <p className="footnote">
                Publishing requires an operator key. A stale version is rejected
                to protect newer edits.
              </p>
            </form>
          )}
        </article>
      </div>
    </main>
  );
}
