import { motion } from "framer-motion";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/seasonal", label: "Seasonal" },
  { to: "/city", label: "City Intelligence" },
  { to: "/time", label: "Time Analysis" },
  { to: "/predict", label: "Prediction" },
  { to: "/model", label: "Model" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 ring-1 ring-sky-400/40">
              <span className="font-display text-lg font-bold text-sky-300">CL</span>
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-white">
                CrimeLens
              </h1>
              <p className="text-xs text-slate-400">Crime data analysis & prediction</p>
            </div>
          </motion.div>
          <nav className="flex flex-wrap gap-1.5 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  [
                    "rounded-lg px-3 py-1.5 transition-colors",
                    isActive
                      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                      : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100",
                  ].join(" ")
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
