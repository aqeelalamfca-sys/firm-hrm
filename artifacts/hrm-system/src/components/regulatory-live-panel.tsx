import { useState, useEffect, useRef } from "react";
import { Zap, TrendingUp, Building2, Landmark, BarChart3, AlertCircle, ChevronDown, X } from "lucide-react";

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
  textColor: string;
  badgeBg: string;
  badgeText: string;
  dotColor: string;
  expandedBg: string;
  borderColor: string;
}> = {
  FBR: {
    icon: Landmark,
    label: "Federal Board of Revenue",
    iconBg: "bg-gradient-to-br from-rose-500 to-red-600",
    textColor: "text-rose-600",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    dotColor: "bg-rose-500",
    expandedBg: "bg-rose-50/30",
    borderColor: "border-rose-200",
  },
  SECP: {
    icon: Building2,
    label: "Securities & Exchange Commission",
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    textColor: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
    expandedBg: "bg-blue-50/30",
    borderColor: "border-blue-200",
  },
  PSX: {
    icon: BarChart3,
    label: "Pakistan Stock Exchange",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    textColor: "text-emerald-600",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    dotColor: "bg-emerald-500",
    expandedBg: "bg-emerald-50/30",
    borderColor: "border-emerald-200",
  },
  SBP: {
    icon: TrendingUp,
    label: "State Bank of Pakistan",
    iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
    textColor: "text-violet-600",
    badgeBg: "bg-violet-50",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    expandedBg: "bg-violet-50/30",
    borderColor: "border-violet-200",
  },
};

export default function RegulatoryLivePanel() {
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);

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

  const tickerUpdates = updates.filter(u => u.isActive !== false).slice(0, 20);
  const categories = ["FBR", "SECP", "PSX", "SBP"] as const;

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/80 p-6 animate-pulse shadow-lg shadow-slate-200/50">
        <div className="h-7 bg-slate-100 rounded-lg w-1/3 mb-4" />
        <div className="h-12 bg-slate-50 rounded-xl mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-50 rounded-xl" />
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

      {tickerUpdates.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-3 px-5 mx-4 rounded-lg mb-3">
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-slate-900 to-transparent z-10 rounded-l-lg" />
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-slate-900 to-transparent z-10 rounded-r-lg" />
          <div
            ref={tickerRef}
            className="flex animate-marquee-slow whitespace-nowrap"
          >
            {[...tickerUpdates, ...tickerUpdates].map((u, idx) => {
              const config = CATEGORY_CONFIG[u.category];
              return (
                <span key={`${u.id}-${idx}`} className="inline-flex items-center gap-2.5 mr-10 text-[12px]">
                  <span className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-[10px] ${config?.textColor || "text-slate-400"} bg-white/10 px-2 py-0.5 rounded`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${config?.dotColor || "bg-slate-400"}`} />
                    {u.category}
                  </span>
                  <span className="text-slate-300 font-medium">{u.text}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {categories.map(cat => {
            const config = CATEGORY_CONFIG[cat];
            const Icon = config.icon;
            const catUpdates = updates.filter(u => u.category === cat).slice(0, 3);
            const isExpanded = activeCategory === cat;

            return (
              <div
                key={cat}
                className={`rounded-xl border transition-all duration-300 cursor-pointer group ${
                  isExpanded
                    ? `${config.borderColor} ${config.expandedBg} shadow-md ring-1 ring-inset ${config.borderColor}`
                    : "border-slate-100/80 hover:border-slate-200 hover:shadow-sm"
                }`}
                onClick={() => setActiveCategory(isExpanded ? null : cat)}
              >
                <div className="flex flex-col items-center text-center p-4">
                  <div className={`w-11 h-11 rounded-xl ${config.iconBg} flex items-center justify-center shadow-sm shrink-0 transition-transform duration-300 ${isExpanded ? 'scale-110' : 'group-hover:scale-105'} mb-2.5`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="text-[14px] font-bold text-slate-900">{cat}</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-tight hidden sm:block">{config.label}</p>
                  {catUpdates.length > 0 && (
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-2 ${config.badgeBg} ${config.badgeText} ring-1 ring-inset ring-current/10`}>
                      {catUpdates.length} update{catUpdates.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-300 mt-1.5 transition-transform duration-300 ${isExpanded ? "rotate-180 text-slate-500" : ""}`} />
                </div>
              </div>
            );
          })}
        </div>

        {activeCategory && (() => {
          const config = CATEGORY_CONFIG[activeCategory];
          const catUpdates = updates.filter(u => u.category === activeCategory).slice(0, 3);
          if (catUpdates.length === 0) return (
            <div className={`mt-3 p-4 rounded-xl ${config.expandedBg} border ${config.borderColor}`}>
              <p className="text-[12px] text-slate-400 text-center italic">No updates yet for {activeCategory}</p>
            </div>
          );
          return (
            <div className={`mt-3 rounded-xl ${config.expandedBg} border ${config.borderColor} overflow-hidden`}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-current/5">
                <div className="flex items-center gap-2">
                  <span className={`text-[12px] font-bold ${config.badgeText}`}>{activeCategory}</span>
                  <span className="text-[11px] text-slate-400 font-medium">{config.label}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveCategory(null); }}
                  className="w-6 h-6 rounded-lg hover:bg-white/60 flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {catUpdates.map(u => (
                  <div key={u.id} className="bg-white rounded-lg p-3.5 ring-1 ring-slate-100 shadow-sm">
                    <div className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        u.priority === "high" ? "bg-red-500 ring-2 ring-red-100" : u.priority === "medium" ? "bg-amber-500 ring-2 ring-amber-100" : "bg-slate-300 ring-2 ring-slate-100"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-slate-700 leading-relaxed font-medium">{u.text}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {u.priority === "high" && (
                            <span className="text-[9px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded ring-1 ring-red-100 uppercase tracking-wide">Priority</span>
                          )}
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(u.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">
                            {u.source === "ai" ? "AI Generated" : "Manual"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
