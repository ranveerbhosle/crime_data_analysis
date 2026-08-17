import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadCsv, fetchJson } from "../api.js";
import Card from "../components/Card.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Loading from "../components/Loading.jsx";

export default function City() {
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [err, setErr] = useState("");

  const loadRegions = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const o = await fetchJson("/api/stats/overview");
      const list = (o.top_regions || []).map((r) => r.region).filter(Boolean);
      setRegions(list);
      setRegion((prev) => prev || list[0] || "");
    } catch (e) {
      setErr(e.message || "Failed to load regions");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!region) return;
    setLoadingDetail(true);
    setErr("");
    try {
      const d = await fetchJson(`/api/stats/city/${encodeURIComponent(region)}`);
      setDetail(d);
    } catch (e) {
      setErr(e.message || "Failed to load region");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [region]);

  useEffect(() => {
    loadRegions();
  }, []);

  useEffect(() => {
    if (region) loadDetail();
  }, [region, loadDetail]);

  const exportDetail = () => {
    if (!detail?.crime_distribution) return;
    downloadCsv(
      `crimelens-city-${detail.region}.csv`,
      detail.crime_distribution.map((r) => ({
        region: detail.region,
        crime_type: r.crime_type,
        count: r.count,
      }))
    );
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">City intelligence</h1>
        <p className="text-slate-400">Region-level distribution, trends, and victim mix</p>
      </div>
      <ErrorBanner message={err} onRetry={() => (region ? loadDetail() : loadRegions())} />

      {!regions.length && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          No region data yet. Ensure MongoDB is running, the backend has imported{" "}
          <code className="text-amber-100">data/india_crime.csv</code>, then refresh.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={!regions.length}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-50"
          >
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={exportDetail}
          disabled={!detail}
          className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          Export crime mix CSV
        </button>
      </div>

      {loadingDetail && <Loading label="Loading region…" />}
      {!loadingDetail && detail && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase text-slate-500">Total in region</p>
              <p className="mt-2 font-display text-3xl font-semibold text-white">{detail.total}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Crime distribution">
              <div className="h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detail.crime_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="crime_type" stroke="#94a3b8" fontSize={11} interval={0} angle={-20} height={70} />
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

            <Card title="Monthly trend">
              <div className="h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={detail.monthly_trend}>
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
                    <Line type="monotone" dataKey="count" stroke="#34d399" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card title="Weapon usage">
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.weapon_usage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#94a3b8" />
                  <YAxis type="category" dataKey="weapon" width={120} stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="#fbbf24" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Victim demographics (gender counts)">
            <ul className="grid gap-2 sm:grid-cols-3">
              {Object.entries(detail.victim_demographics?.by_gender || {}).map(([g, n]) => (
                <li
                  key={g}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-center"
                >
                  <p className="text-xs text-slate-500">{g}</p>
                  <p className="text-xl font-semibold text-sky-300">{n}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
