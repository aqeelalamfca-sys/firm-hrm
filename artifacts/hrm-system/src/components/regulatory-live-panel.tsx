import { useState, useEffect, useRef } from "react";
import { Zap, TrendingUp, Building2, Landmark, BarChart3, AlertCircle, ChevronRight, ExternalLink } from "lucide-react";

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
  gradient: string;
  iconBg: string;
  accentColor: string;
  textColor: string;
  badgeBg: string;
  badgeText: string;
  dotColor: string;
  hoverBorder: string;
  expandedBg: string;
}> = {
  FBR: {
    icon: Landmark,
    label: "Federal Board of Revenue",
    gradient: "from-rose-500 to-red-600",
    iconBg: "bg-gradient-to-br from-rose-500 to-red-600",
    accentColor: "border-l-rose-500",
    textColor: "text-rose-600",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    dotColor: "bg-rose-500",
    hoverBorder: "hover:border-rose-200",
    expandedBg: "bg-rose-50/30",
  },
  SECP: {
    icon: Building2,
    label: "Securities & Exchange Commission",
    gradient: "from-blue-500 to-indigo-600",
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    accentColor: "border-l-blue-500",
    textColor: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
    hoverBorder: "hover:border-blue-200",
    expandedBg: "bg-blue-50/30",
  },
  PSX: {
    icon: BarChart3,
    label: "Pakistan Stock Exchange",
    gradient: "from-emerald-500 to-teal-600",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    accentColor: "border-l-emerald-500",
    textColor: "text-emerald-600",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    dotColor: "bg-emerald-500",
    hoverBorder: "hover:border-emerald-200",
    expandedBg: "bg-emerald-50/30",
  },
  SBP: {
    icon: TrendingUp,
    label: "State Bank of Pakistan",
    gradient: "from-violet-500 to-purple-600",
    iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
    accentColor: "border-l-violet-500",
    textColor: "text-violet-600",
    badgeBg: "bg-violet-50",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    hoverBorder: "hover:border-violet-200",
    expandedBg: "bg-violet-50/30",
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
        <div className="h-7 bg-slate-100 rounded-lg w-2/3 mb-5" />
        <div className="h-14 bg-slate-50 rounded-xl mb-5" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[72px] bg-slate-50 rounded-xl" />
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
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 ring-1 ring-slate-100">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-500">No regulatory updates available yet</p>
          <p className="text-xs text-slate-400 mt-1.5">Updates from FBR, SECP, PSX, and SBP will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden h-full flex flex-col shadow-lg shadow-slate-200/50">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
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
      </div>

      {tickerUpdates.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-3 px-5 mx-4 rounded-lg mb-2">
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

      <div className="p-4 flex-1">
        <div className="space-y-2">
          {categories.map(cat => {
            const config = CATEGORY_CONFIG[cat];
            const Icon = config.icon;
            const catUpdates = updates.filter(u => u.category === cat).slice(0, 3);
            const isExpanded = activeCategory === cat;

            return (
              <div
                key={cat}
                className={`rounded-xl border-l-[3px] transition-all duration-300 cursor-pointer group ${
                  isExpanded
                    ? `${config.accentColor} ${config.expandedBg} shadow-sm ring-1 ring-slate-100`
                    : `border-l-transparent border border-slate-100/80 ${config.hoverBorder} hover:shadow-sm`
                }`}
                onClick={() => setActiveCategory(isExpanded ? null : cat)}
              >
                <div className={`flex items-center gap-3 p-3 ${!isExpanded ? 'border-l-0' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center shadow-sm shrink-0 transition-transform duration-300 ${isExpanded ? 'scale-105' : 'group-hover:scale-105'}`}>
                    <Icon className="w-[18px] h-[18px] text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[14px] font-bold text-slate-900">{cat}</h4>
                      <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">{config.label}</span>
                    </div>
                    {!isExpanded && catUpdates.length > 0 && (
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-relaxed">{catUpdates[0].text}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {catUpdates.length > 0 && (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${config.badgeBg} ${config.badgeText} ring-1 ring-inset ring-current/10`}>
                        {catUpdates.length} update{catUpdates.length > 1 ? "s" : ""}
                      </span>
                    )}
                    <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform duration-300 ${isExpanded ? "rotate-90 text-slate-500" : "group-hover:text-slate-400"}`} />
                  </div>
                </div>

                {isExpanded && catUpdates.length > 0 && (
                  <div className="px-4 pb-4 pt-1">
                    <div className="ml-[52px] space-y-2.5">
                      {catUpdates.map((u, i) => (
                        <div key={u.id} className="relative bg-white rounded-lg p-3 ring-1 ring-slate-100 shadow-sm">
                          <div className="flex items-start gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                              u.priority === "high" ? "bg-red-500 ring-2 ring-red-100" : u.priority === "medium" ? "bg-amber-500 ring-2 ring-amber-100" : "bg-slate-300 ring-2 ring-slate-100"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-slate-700 leading-relaxed font-medium">{u.text}</p>
                              <div className="flex items-center gap-2 mt-1.5">
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
                )}

                {isExpanded && catUpdates.length === 0 && (
                  <div className="px-4 pb-4 pt-0 ml-[52px]">
                    <p className="text-[11px] text-slate-400 italic">No updates yet</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
