import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadCsv, fetchJson } from "../api.js";
import Card from "../components/Card.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Loading from "../components/Loading.jsx";

const SEASON_ORDER = ["Winter", "Spring", "Monsoon", "Post-Monsoon"];

export default function Seasonal() {
  const [monthly, setMonthly] = useState([]);
  const [seasonal, setSeasonal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [m, s] = await Promise.all([
        fetchJson("/api/stats/monthly-totals"),
        fetchJson("/api/stats/seasonal"),
      ]);
      setMonthly(m.data || []);
      setSeasonal(s.data || []);
    } catch (e) {
      setErr(e.message || "Failed to load seasonal stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const seasonTotals = useMemo(() => {
    const map = {};
    for (const s of SEASON_ORDER) map[s] = 0;
    for (const row of seasonal) {
      const key = row.season || "Unknown";
      map[key] = (map[key] || 0) + row.count;
    }
    return SEASON_ORDER.map((name) => ({ name, count: map[name] || 0 }));
  }, [seasonal]);

  const heatmapRows = useMemo(() => {
    const crimes = [...new Set(seasonal.map((r) => r.crime_type).filter(Boolean))].slice(0, 8);
    return SEASON_ORDER.map((season) => {
      const row = { season };
      for (const c of crimes) {
        const found = seasonal.find((x) => x.season === season && x.crime_type === c);
        row[c] = found ? found.count : 0;
      }
      return row;
    });
  }, [seasonal]);

  const crimesForHeat = useMemo(() => {
    return [...new Set(seasonal.map((r) => r.crime_type).filter(Boolean))].slice(0, 8);
  }, [seasonal]);

  const insight =
    seasonTotals.length > 0
      ? `Highest seasonal volume: ${
          [...seasonTotals].sort((a, b) => b.count - a.count)[0]?.name || "N/A"
        }. Review monthly curve for spikes that align with festivals or weather.`
      : "Load India data to generate insights.";

  const exportHeat = () => {
    const flat = [];
    for (const row of heatmapRows) {
      for (const c of crimesForHeat) {
        flat.push({ season: row.season, crime_type: c, count: row[c] || 0 });
      }
    }
    downloadCsv("crimelens-seasonal-heatmap.csv", flat);
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Seasonal analysis</h1>
        <p className="text-slate-400">Monthly volume and season × crime patterns (India)</p>
      </div>
      <ErrorBanner message={err} onRetry={load} />

      <Card title="Monthly crimes" subtitle="Area trend across months">
        <div className="mb-4 h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="mcolor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#38bdf8"
                fillOpacity={1}
                fill="url(#mcolor)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {seasonTotals.map((s) => (
          <div
            key={s.name}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">{s.name}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-sky-300">{s.count}</p>
            <p className="text-xs text-slate-500">cases (aggregated)</p>
          </div>
        ))}
      </div>

      <Card
        title="Season × crime heatmap"
        subtitle="Counts by Season and Crime_Type"
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={exportHeat}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            Export table CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="py-2 pr-2">Season</th>
                {crimesForHeat.map((c) => (
                  <th key={c} className="px-1 py-2 font-normal">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapRows.map((row) => (
                <tr key={row.season} className="border-b border-slate-800/80">
                  <td className="py-2 pr-2 font-medium text-slate-200">{row.season}</td>
                  {crimesForHeat.map((c) => {
                    const v = row[c] || 0;
                    const intensity = Math.min(1, v / (Math.max(...crimesForHeat.map((x) => row[x] || 0)) || 1));
                    return (
                      <td
                        key={c}
                        className="px-1 py-2 text-center text-slate-100"
                        style={{
                          background: `rgba(56, 189, 248, ${0.15 + intensity * 0.35})`,
                        }}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Insight" subtitle="Automated narrative">
        <p className="text-slate-300">{insight}</p>
      </Card>
    </div>
  );
}
