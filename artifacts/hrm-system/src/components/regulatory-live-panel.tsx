import { useState, useEffect } from "react";
import { Zap, TrendingUp, Building2, Landmark, BarChart3, AlertCircle } from "lucide-react";

interface RegulatoryUpdate {
  id: number;
  category: string;
  text: string;
  priority: string;
  source: string;
  createdAt: string;
  isActive?: boolean;
}

const CATEGORY_CONFIG: Record<string, {
  icon: typeof Zap;
  label: string;
  iconBg: string;
  tickerBg: string;
  tickerFade: string;
  textColor: string;
  dotColor: string;
  labelBg: string;
  speed: string;
}> = {
  FBR: {
    icon: Landmark,
    label: "Federal Board of Revenue",
    iconBg: "bg-gradient-to-br from-rose-500 to-red-600",
    tickerBg: "bg-gradient-to-r from-rose-950 via-rose-900 to-rose-950",
    tickerFade: "from-rose-950",
    textColor: "text-rose-300",
    dotColor: "bg-rose-400",
    labelBg: "bg-rose-500/20 text-rose-300 ring-rose-400/20",
    speed: "160s",
  },
  SECP: {
    icon: Building2,
    label: "Securities & Exchange Commission",
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    tickerBg: "bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950",
    tickerFade: "from-blue-950",
    textColor: "text-blue-300",
    dotColor: "bg-blue-400",
    labelBg: "bg-blue-500/20 text-blue-300 ring-blue-400/20",
    speed: "180s",
  },
  PSX: {
    icon: BarChart3,
    label: "Pakistan Stock Exchange",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    tickerBg: "bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950",
    tickerFade: "from-emerald-950",
    textColor: "text-emerald-300",
    dotColor: "bg-emerald-400",
    labelBg: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/20",
    speed: "200s",
  },
  SBP: {
    icon: TrendingUp,
    label: "State Bank of Pakistan",
    iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
    tickerBg: "bg-gradient-to-r from-violet-950 via-violet-900 to-violet-950",
    tickerFade: "from-violet-950",
    textColor: "text-violet-300",
    dotColor: "bg-violet-400",
    labelBg: "bg-violet-500/20 text-violet-300 ring-violet-400/20",
    speed: "220s",
  },
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

  const categories = ["FBR", "SECP", "PSX", "SBP"] as const;

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/80 p-5 animate-pulse shadow-lg shadow-slate-200/50">
        <div className="h-7 bg-slate-100 rounded-lg w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-slate-50 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/80 p-6 shadow-lg shadow-slate-200/50">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-200/50">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Regulatory Intelligence</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full ring-1 ring-emerald-200/60">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>
        <div className="text-center py-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 ring-1 ring-slate-100">
            <AlertCircle className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-500">No regulatory updates available yet</p>
          <p className="text-xs text-slate-400 mt-1.5">Updates from FBR, SECP, PSX, and SBP will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden shadow-lg shadow-slate-200/50">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-200/50">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full ring-2 ring-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-slate-900">Regulatory Intelligence</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Real-time updates from Pakistan regulatory bodies</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full ring-1 ring-emerald-200/60 uppercase tracking-wider">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2">
        {categories.map(cat => {
          const config = CATEGORY_CONFIG[cat];
          const Icon = config.icon;
          const catUpdates = updates.filter(u => u.category === cat && u.isActive !== false);

          if (catUpdates.length === 0) return null;

          return (
            <div
              key={cat}
              className={`relative overflow-hidden ${config.tickerBg} rounded-xl py-3 px-4 group cursor-default`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r ${config.tickerFade} to-transparent z-10 rounded-l-xl`} />
              <div className={`absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l ${config.tickerFade} to-transparent z-10 rounded-r-xl`} />

              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ring-1 ${config.labelBg}`}>
                  {cat}
                </span>
              </div>

              <div
                className="flex whitespace-nowrap pl-28"
                style={{ animation: `marquee ${config.speed} linear infinite` }}
              >
                {[...catUpdates, ...catUpdates, ...catUpdates].map((u, idx) => (
                  <span key={`${u.id}-${idx}`} className="inline-flex items-center gap-3 mr-16 text-[13px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor} shrink-0`} />
                    <span className="text-slate-200 font-medium">{u.text}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
