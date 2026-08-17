import { useState } from "react";
import { motion } from "framer-motion";
import { fetchJson } from "../api.js";
import Card from "../components/Card.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";

const initial = {
  region: "",
  month: "6",
  hour: "14",
  day_of_week: "3",
  weapon: "None",
  gender: "M",
  crime_domain: "Property",
};

export default function Predict() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      const body = {
        region: form.region,
        month: form.month,
        hour: form.hour,
        day_of_week: form.day_of_week,
        weapon: form.weapon,
        gender: form.gender,
        crime_domain: form.crime_domain,
      };
      const data = await fetchJson("/api/predict", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data.error && !data.predicted_crime) {
        throw new Error(data.error || data.detail || "Prediction failed");
      }
      setResult(data);
    } catch (e) {
      setErr(e.message || "ML service may be offline. Start the Flask service on its port.");
      setResult({
        predicted_crime: null,
        confidence: null,
        top3: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const rec =
    result?.predicted_crime &&
    `Focus patrol and community outreach on ${result.predicted_crime.toLowerCase()}-related risk factors in ${form.region || "the selected region"} during month ${form.month}, especially around hour ${form.hour}.`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Crime type prediction</h1>
        <p className="text-slate-400">
          Random Forest model trained on India data only. Backend proxies to the ML service.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Inputs">
          <form onSubmit={onSubmit} className="space-y-4">
            {[
              ["region", "Region", "text", "e.g. Mumbai"],
              ["month", "Month (1–12)", "number", "6"],
              ["hour", "Hour (0–23)", "number", "14"],
              ["day_of_week", "Day of week (0–6)", "number", "3"],
              ["weapon", "Weapon used", "text", "None"],
              ["gender", "Victim gender (M/F)", "text", "M"],
              ["crime_domain", "Crime domain", "text", "Property"],
            ].map(([name, label, type, ph]) => (
              <label key={name} className="block text-sm">
                <span className="text-slate-400">{label}</span>
                <input
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={onChange}
                  placeholder={ph}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-100 placeholder:text-slate-600"
                />
              </label>
            ))}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-sky-600 py-3 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {loading ? "Predicting…" : "Predict"}
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <ErrorBanner message={err} />
          <Card title="Prediction">
            {!result && !err && (
              <p className="text-slate-500">Submit the form to see predicted crime type and probabilities.</p>
            )}
            {result && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div>
                  <p className="text-xs uppercase text-slate-500">Predicted crime</p>
                  <p className="font-display text-2xl font-semibold text-sky-300">
                    {result.predicted_crime ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Confidence</p>
                  <p className="text-xl text-white">
                    {result.confidence != null ? `${(result.confidence * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase text-slate-500">Top 3 probabilities</p>
                  <ul className="space-y-2">
                    {(result.top3 || []).map((t, i) => (
                      <li
                        key={i}
                        className="flex justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm"
                      >
                        <span>{t.crime}</span>
                        <span className="text-sky-300">
                          {t.probability != null ? `${(t.probability * 100).toFixed(1)}%` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </Card>

          <Card title="Recommendation" subtitle="Heuristic guidance (not legal advice)">
            <p className="text-slate-300">
              {rec || "A prediction will appear here with operational-style suggestions."}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
