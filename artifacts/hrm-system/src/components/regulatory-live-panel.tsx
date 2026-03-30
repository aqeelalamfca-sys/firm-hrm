import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, Building2, Landmark, BarChart3, AlertCircle, ChevronRight } from "lucide-react";

interface RegulatoryUpdate {
  id: number;
  category: string;
  text: string;
  priority: string;
  source: string;
  createdAt: string;
  isActive?: boolean;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Zap; color: string; bgColor: string; borderColor: string; gradientFrom: string; gradientTo: string; label: string; dotColor: string }> = {
  FBR: { icon: Landmark, color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-100", gradientFrom: "from-red-500", gradientTo: "to-rose-600", label: "Federal Board of Revenue", dotColor: "bg-red-500" },
  SECP: { icon: Building2, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-100", gradientFrom: "from-blue-500", gradientTo: "to-indigo-600", label: "Securities & Exchange Commission", dotColor: "bg-blue-500" },
  PSX: { icon: BarChart3, color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-100", gradientFrom: "from-emerald-500", gradientTo: "to-teal-600", label: "Pakistan Stock Exchange", dotColor: "bg-emerald-500" },
  SBP: { icon: TrendingUp, color: "text-violet-600", bgColor: "bg-violet-50", borderColor: "border-violet-100", gradientFrom: "from-violet-500", gradientTo: "to-purple-600", label: "State Bank of Pakistan", dotColor: "bg-violet-500" },
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
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 animate-pulse shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="h-7 bg-slate-100 rounded-lg w-2/3 mb-5" />
        <div className="h-12 bg-slate-50 rounded-lg mb-5" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-slate-50 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-800">Regulatory Intelligence</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-500">No regulatory updates available yet</p>
          <p className="text-xs text-slate-400 mt-1.5">Updates from FBR, SECP, PSX, and SBP will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden h-full flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-800">Regulatory Intelligence</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Real-time updates from Pakistan regulatory bodies</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>
      </div>

      {tickerUpdates.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border-y border-slate-100 py-3 px-5">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent z-10" />
          <div
            ref={tickerRef}
            className="flex animate-marquee-slow whitespace-nowrap"
          >
            {[...tickerUpdates, ...tickerUpdates].map((u, idx) => {
              const config = CATEGORY_CONFIG[u.category];
              return (
                <span key={`${u.id}-${idx}`} className="inline-flex items-center gap-2 mr-12 text-[12px]">
                  <span className={`inline-flex items-center gap-1 font-semibold ${config?.color || ""}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${config?.dotColor || "bg-slate-400"}`} />
                    {u.category}
                  </span>
                  <span className="text-slate-600">{u.text}</span>
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
                className={`rounded-xl border transition-all duration-200 cursor-pointer group ${
                  isExpanded
                    ? `${config.borderColor} ${config.bgColor}/40 shadow-sm`
                    : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50"
                }`}
                onClick={() => setActiveCategory(isExpanded ? null : cat)}
              >
                <div className="flex items-center gap-3 p-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} flex items-center justify-center shadow-sm shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-800">{cat}</h4>
                      <span className="text-[10px] text-slate-400 font-medium">{config.label}</span>
                    </div>
                    {!isExpanded && catUpdates.length > 0 && (
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{catUpdates[0].text}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {catUpdates.length > 0 && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
                        {catUpdates.length} update{catUpdates.length > 1 ? "s" : ""}
                      </span>
                    )}
                    <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                  </div>
                </div>

                {isExpanded && catUpdates.length > 0 && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="ml-12 space-y-2 border-l-2 border-slate-200/60 pl-3">
                      {catUpdates.map(u => (
                        <div key={u.id} className="relative">
                          <div className={`absolute -left-[17px] top-1.5 w-2 h-2 rounded-full ring-2 ring-white ${
                            u.priority === "high" ? "bg-red-500" : u.priority === "medium" ? "bg-amber-500" : "bg-slate-300"
                          }`} />
                          <p className="text-[12px] text-slate-600 leading-relaxed">{u.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {u.priority === "high" && (
                              <span className="text-[9px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">HIGH</span>
                            )}
                            {u.priority === "medium" && (
                              <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">MEDIUM</span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              {new Date(u.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isExpanded && catUpdates.length === 0 && (
                  <div className="px-3 pb-3 pt-0 ml-12">
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
