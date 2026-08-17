import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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

export default function TimeAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const t = await fetchJson("/api/stats/time");
      setData(t);
    } catch (e) {
      setErr(e.message || "Failed to load time stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { heatMatrix, hours, days } = useMemo(() => {
    const heat = data?.heatmap || [];
    const hours = [...new Set(heat.map((h) => h.hour))].sort();
    const days = [...new Set(heat.map((h) => h.day_of_week))].sort();
    const map = new Map();
    for (const row of heat) {
      map.set(`${row.hour}||${row.day_of_week}`, row.count);
    }
    return { heatMatrix: map, hours, days };
  }, [data]);

  const maxHeat = useMemo(() => {
    let m = 1;
    heatMatrix.forEach((v) => {
      if (v > m) m = v;
    });
    return m;
  }, [heatMatrix]);

  const exportHeat = () => {
    const rows = [];
    for (const h of hours) {
      for (const d of days) {
        rows.push({
          hour: h,
          day_of_week: d,
          count: heatMatrix.get(`${h}||${d}`) || 0,
        });
      }
    }
    downloadCsv("crimelens-time-heatmap.csv", rows);
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Time analysis</h1>
        <p className="text-slate-400">Hour-of-day and weekday patterns (India)</p>
      </div>
      <ErrorBanner message={err} onRetry={load} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Hourly trend">
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.hourly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Weekly trend">
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.by_weekday || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill="#a78bfa" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Hour × weekday heatmap" subtitle="Darker = higher count">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={exportHeat}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-2 text-left">Hour \ Day</th>
                {days.map((d) => (
                  <th key={d} className="px-1 py-2 font-normal">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h} className="border-b border-slate-800/80">
                  <td className="py-1.5 pr-2 font-medium text-slate-300">{h}</td>
                  {days.map((d) => {
                    const v = heatMatrix.get(`${h}||${d}`) || 0;
                    const intensity = v / maxHeat;
                    return (
                      <td key={d} className="px-0.5 py-1 text-center text-slate-900">
                        <div
                          className="rounded px-1 py-1"
                          style={{
                            background: `rgba(56, 189, 248, ${0.2 + intensity * 0.75})`,
                          }}
                        >
                          {v}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
