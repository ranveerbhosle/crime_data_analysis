import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadCsv, fetchJson } from "../api.js";
import Card from "../components/Card.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Loading from "../components/Loading.jsx";

const COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#94a3b8"];

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [yearly, setYearly] = useState([]);
  const [domains, setDomains] = useState([]);
  const [globalRows, setGlobalRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [o, y, d, g] = await Promise.all([
        fetchJson("/api/stats/overview"),
        fetchJson("/api/stats/yearly-trend"),
        fetchJson("/api/stats/crime-domains"),
        fetchJson("/api/global/crimes").catch(() => ({ data: [] })),
      ]);
      setOverview(o);
      setYearly(y.data || []);
      setDomains(d.data || []);
      setGlobalRows(g.data || []);
    } catch (e) {
      setErr(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const crimeBarData =
    overview?.top_crime_types?.map((c) => ({
      name: c.crime_type,
      count: c.count,
    })) || [];

  const pieData =
    domains?.map((x) => ({
      name: x.domain || "Unknown",
      value: x.count,
    })) || [];

  const exportOverview = () => {
    if (!overview) return;
    const rows = [
      { metric: "total_crimes", value: overview.total_crimes },
      ...(overview.top_regions || []).map((r, i) => ({
        metric: `top_region_${i + 1}`,
        region: r.region,
        count: r.count,
      })),
    ];
    downloadCsv("crimelens-overview.csv", rows);
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400">India dataset KPIs and high-level trends</p>
        </div>
        <button
          type="button"
          onClick={exportOverview}
          className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Export summary CSV
        </button>
      </div>

      <ErrorBanner message={err} onRetry={load} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Total crimes (India)",
            value: overview?.total_crimes ?? "—",
          },
          {
            label: "Top region",
            value: overview?.top_regions?.[0]?.region ?? "—",
            sub: overview?.top_regions?.[0]
              ? `${overview.top_regions[0].count} cases`
              : "",
          },
          {
            label: "Top crime type",
            value: overview?.top_crime_types?.[0]?.crime_type ?? "—",
            sub: overview?.top_crime_types?.[0]
              ? `${overview.top_crime_types[0].count} cases`
              : "",
          },
          {
            label: "Global records (comparison)",
            value: globalRows.length,
          },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-white">{k.value}</p>
            {k.sub && <p className="mt-1 text-xs text-slate-400">{k.sub}</p>}
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Yearly trend (India)" subtitle="Crimes by year from Date field">
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="year" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Crime types" subtitle="Top categories in India data">
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={crimeBarData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis type="category" dataKey="name" width={100} stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Crime domain mix" subtitle="Distribution by Crime Domain">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col justify-center text-sm text-slate-300">
            <p className="mb-2 text-slate-400">Global snapshot (sample rows)</p>
            <ul className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              {globalRows.slice(0, 5).map((r, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-slate-800/80 pb-2 last:border-0">
                  <span className="text-slate-400">{r.Region}</span>
                  <span className="text-slate-100">{r.Crime_Type}</span>
                </li>
              ))}
              {!globalRows.length && <li className="text-slate-500">No global data loaded</li>}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
