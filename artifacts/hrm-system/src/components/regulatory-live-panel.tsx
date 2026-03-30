import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, Building2, Landmark, BarChart3, AlertCircle } from "lucide-react";

interface RegulatoryUpdate {
  id: number;
  category: string;
  text: string;
  priority: string;
  source: string;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Zap; color: string; bgColor: string; borderColor: string; label: string }> = {
  FBR: { icon: Landmark, color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200", label: "Federal Board of Revenue" },
  SECP: { icon: Building2, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", label: "Securities & Exchange Commission" },
  PSX: { icon: BarChart3, color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", label: "Pakistan Stock Exchange" },
  SBP: { icon: TrendingUp, color: "text-violet-600", bgColor: "bg-violet-50", borderColor: "border-violet-200", label: "State Bank of Pakistan" },
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
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

  const tickerUpdates = updates.filter(u => u.isActive !== false).slice(0, 20);
  const categories = ["FBR", "SECP", "PSX", "SBP"] as const;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-border/30 p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-2/3 mb-4" />
        <div className="h-10 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-border/30 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Regulatory Intelligence
          </h2>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <div className="text-center py-10">
          <AlertCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No regulatory updates available yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Updates from FBR, SECP, PSX, and SBP will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-border/30 overflow-hidden h-full flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Regulatory Intelligence
          </h2>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Real-time updates from Pakistan regulatory bodies</p>
      </div>

      {tickerUpdates.length > 0 && (
        <div className="overflow-hidden border-y border-border/30 bg-slate-50/50 py-2.5 px-5">
          <div className="flex animate-marquee whitespace-nowrap">
            {[...tickerUpdates, ...tickerUpdates].map((u, idx) => {
              const config = CATEGORY_CONFIG[u.category];
              return (
                <span key={`${u.id}-${idx}`} className="inline-flex items-center gap-1.5 mr-10 text-xs">
                  <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${config?.bgColor || ""} ${config?.color || ""} ${config?.borderColor || ""}`}>
                    {u.category}
                  </Badge>
                  <span className="text-muted-foreground">{u.text}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-5 flex-1">
        <div className="grid grid-cols-2 gap-3">
          {categories.map(cat => {
            const config = CATEGORY_CONFIG[cat];
            const Icon = config.icon;
            const catUpdates = updates.filter(u => u.category === cat).slice(0, 3);

            return (
              <div key={cat} className={`p-3.5 rounded-xl border ${config.borderColor} ${config.bgColor}/30 transition-all hover:shadow-sm`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-7 h-7 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{cat}</h4>
                    <p className="text-[9px] text-muted-foreground leading-tight">{config.label}</p>
                  </div>
                </div>
                {catUpdates.length > 0 ? (
                  <div className="space-y-1.5">
                    {catUpdates.map(u => (
                      <div key={u.id} className="flex items-start gap-1.5">
                        {u.priority === "high" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                        )}
                        {u.priority === "medium" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        )}
                        {u.priority === "low" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                        )}
                        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{u.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground/50 italic">No updates yet</p>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
