import { useState, useEffect, useRef } from "react";

interface RegulatoryUpdate {
  id: number;
  category: string;
  text: string;
  priority: string;
  source: string;
  createdAt: string;
  isActive?: boolean;
}

const CATEGORY_STYLE: Record<string, { dot: string; badge: string; separator: string }> = {
  FBR: {
    dot: "bg-rose-400",
    badge: "bg-rose-500/20 text-rose-300 ring-rose-500/30",
    separator: "bg-rose-500/40",
  },
  SECP: {
    dot: "bg-sky-400",
    badge: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
    separator: "bg-sky-500/40",
  },
  PSX: {
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
    separator: "bg-emerald-500/40",
  },
  SBP: {
    dot: "bg-amber-400",
    badge: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
    separator: "bg-amber-500/40",
  },
};

function TickerItems({ updates }: { updates: RegulatoryUpdate[] }) {
  return (
    <>
      {updates.map((u, idx) => {
        const style = CATEGORY_STYLE[u.category] || {
          dot: "bg-slate-400",
          badge: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
          separator: "bg-slate-500/40",
        };
        return (
          <span key={`${u.id}-${idx}`} className="inline-flex items-center shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ring-1 shrink-0 ${style.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ticker-pulse`} />
              {u.category}
            </span>
            <span className="text-slate-200/90 font-medium text-[11.5px] ml-2.5 mr-8">{u.text}</span>
            <span className={`w-1 h-1 rounded-full ${style.separator} mr-8 shrink-0`} />
          </span>
        );
      })}
    </>
  );
}

export default function RegulatoryLivePanel() {
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(30);

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

  useEffect(() => {
    if (trackRef.current) {
      const w = trackRef.current.scrollWidth;
      const speed = 30;
      setDuration(Math.max(40, w / speed));
    }
  }, [updates]);

  if (loading) {
    return (
      <div className="relative overflow-hidden bg-slate-900 py-2.5 px-4">
        <div className="h-4 bg-slate-700/40 rounded w-2/3 animate-pulse" />
      </div>
    );
  }

  const activeUpdates = updates.filter(u => u.isActive !== false);
  if (activeUpdates.length === 0) return null;

  const repeatCount = Math.max(3, Math.ceil(2000 / (activeUpdates.length * 200)));
  const repeatedUpdates = Array.from({ length: repeatCount }, () => activeUpdates).flat();

  return (
    <div
      className="relative overflow-hidden bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f172a] py-2 group/ticker"
      role="region"
      aria-label="Live regulatory updates"
    >
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#0f172a] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#0f172a] to-transparent z-10" />

      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md ring-1 ring-emerald-500/25 uppercase tracking-[0.12em]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="ticker-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          Live
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {activeUpdates.map(u => `${u.category}: ${u.text}`).join(". ")}
      </div>

      <div className="flex overflow-hidden ml-14" aria-hidden="true">
        <div
          ref={trackRef}
          className="flex shrink-0 items-center whitespace-nowrap ticker-track"
          style={{ animationDuration: `${duration}s` }}
        >
          <TickerItems updates={repeatedUpdates} />
        </div>
        <div
          className="flex shrink-0 items-center whitespace-nowrap ticker-track"
          style={{ animationDuration: `${duration}s` }}
        >
          <TickerItems updates={repeatedUpdates} />
        </div>
      </div>

      <style>{`
        @keyframes ticker-move {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .ticker-track {
          animation: ticker-move 30s linear infinite;
          will-change: transform;
        }
        .ticker-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .ticker-ping {
          animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .group\\/ticker:hover .ticker-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track {
            animation: none;
          }
          .ticker-pulse,
          .ticker-ping {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
