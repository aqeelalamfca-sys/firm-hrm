import { useState, useEffect } from "react";

interface RegulatoryUpdate {
  id: number;
  category: string;
  text: string;
  priority: string;
  source: string;
  createdAt: string;
  isActive?: boolean;
}

const CATEGORY_COLORS: Record<string, { dot: string; label: string }> = {
  FBR: { dot: "bg-rose-400", label: "bg-rose-500/20 text-rose-300 ring-rose-400/30" },
  SECP: { dot: "bg-blue-400", label: "bg-blue-500/20 text-blue-300 ring-blue-400/30" },
  PSX: { dot: "bg-emerald-400", label: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30" },
  SBP: { dot: "bg-violet-400", label: "bg-violet-500/20 text-violet-300 ring-violet-400/30" },
};

export default function RegulatoryLivePanel() {
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUpdates = async () => {
    try {
      const res = await fetch("/api/regulatory-updates");
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.updates || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
    const interval = setInterval(fetchUpdates, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl py-3.5 px-4 animate-pulse">
        <div className="h-5 bg-slate-700/50 rounded w-3/4" />
      </div>
    );
  }

  const activeUpdates = updates.filter(u => u.isActive !== false);
  if (activeUpdates.length === 0) return null;

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-1.5 cursor-default">
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-900 to-transparent z-10 rounded-l-xl" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-900 to-transparent z-10 rounded-r-xl" />

      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20">
        <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full ring-1 ring-emerald-400/30 uppercase tracking-wider">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      <div
        className="flex whitespace-nowrap pl-16"
        style={{ animation: "marquee 35s linear infinite" }}
      >
        {[...activeUpdates, ...activeUpdates, ...activeUpdates].map((u, idx) => {
          const colors = CATEGORY_COLORS[u.category] || { dot: "bg-slate-400", label: "bg-slate-500/20 text-slate-300 ring-slate-400/30" };
          return (
            <span key={`${u.id}-${idx}`} className="inline-flex items-center gap-2 mr-12 text-[12px]">
              <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide text-[8px] px-1.5 py-px rounded ring-1 shrink-0 ${colors.label}`}>
                <span className={`w-1 h-1 rounded-full ${colors.dot}`} />
                {u.category}
              </span>
              <span className="text-slate-300 font-medium">{u.text}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
