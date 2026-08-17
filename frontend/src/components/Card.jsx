import { motion } from "framer-motion";

export default function Card({ title, subtitle, children, className = "" }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-xl shadow-black/20 backdrop-blur ${className}`}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h2 className="font-display text-lg font-semibold text-white">{title}</h2>}
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </motion.section>
  );
}
