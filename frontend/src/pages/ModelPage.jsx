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
import { fetchJson } from "../api.js";
import Card from "../components/Card.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Loading from "../components/Loading.jsx";

export default function ModelPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await fetchJson("/api/ml/model-stats");
      setStats(s);
    } catch (e) {
      setErr(e.message || "ML stats unavailable");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fiData = useMemo(() => {
    const imp = stats?.feature_importances || {};
    return Object.entries(imp).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const cm = stats?.confusion_matrix;
  const classes = stats?.classes || [];
  const cmMax = useMemo(() => {
    if (!cm?.length) return 1;
    return Math.max(1, ...cm.flat());
  }, [cm]);

  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Model performance</h1>
        <p className="text-slate-400">Accuracy, feature importance, confusion matrix, classification report</p>
      </div>
      <ErrorBanner message={err} onRetry={load} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-xs uppercase text-slate-500">Hold-out accuracy</p>
          <p className="mt-2 font-display text-4xl font-semibold text-emerald-400">
            {stats?.accuracy != null ? `${(stats.accuracy * 100).toFixed(2)}%` : "—"}
          </p>
        </div>
      </div>

      <Card title="Feature importance (Random Forest)">
        <div className="h-80 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fiData} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" fontSize={12} />
              <YAxis type="category" dataKey="name" width={120} stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="value" fill="#34d399" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Confusion matrix" subtitle="Rows = true, columns = predicted (test split)">
        {cm && classes.length ? (
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="p-2" />
                  {classes.map((c) => (
                    <th key={c} className="px-2 py-1 text-xs font-normal">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cm.map((row, i) => (
                  <tr key={i}>
                    <td className="pr-2 text-xs text-slate-400">{classes[i]}</td>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className="border border-slate-800 px-2 py-1 text-center text-slate-100"
                        style={{
                          background: `rgba(56, 189, 248, ${0.15 + (cell / cmMax) * 0.5})`,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500">No matrix returned.</p>
        )}
      </Card>

      <Card title="Classification report" subtitle="Per-class metrics on test split">
        {stats?.classification_report ? (
          <div className="overflow-x-auto text-xs">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  <th className="py-2 pr-2">Label</th>
                  <th className="pr-2">precision</th>
                  <th className="pr-2">recall</th>
                  <th className="pr-2">f1</th>
                  <th className="pr-2">support</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.classification_report)
                  .filter(([k]) => !["accuracy", "macro avg", "weighted avg"].includes(k))
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-800/80">
                      <td className="py-2 pr-2 text-slate-200">{k}</td>
                      <td className="text-slate-300">{v.precision?.toFixed?.(3)}</td>
                      <td className="text-slate-300">{v.recall?.toFixed?.(3)}</td>
                      <td className="text-slate-300">{v["f1-score"]?.toFixed?.(3)}</td>
                      <td className="text-slate-400">{v.support}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500">No report available.</p>
        )}
      </Card>
    </div>
  );
}
