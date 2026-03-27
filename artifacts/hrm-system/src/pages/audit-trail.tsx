import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Shield, User, Clock, ChevronLeft, ChevronRight } from "lucide-react";

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  login: "bg-indigo-100 text-indigo-800",
  logout: "bg-gray-100 text-gray-800",
  approve: "bg-emerald-100 text-emerald-800",
  reject: "bg-rose-100 text-rose-800",
  status_change: "bg-amber-100 text-amber-800",
  view: "bg-cyan-100 text-cyan-800",
  download: "bg-purple-100 text-purple-800",
  upload: "bg-teal-100 text-teal-800",
};

export default function AuditTrail() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 25;

  const headers = { Authorization: `Bearer ${token}` };

  React.useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterModule !== "all") params.set("module", filterModule);
    if (filterAction !== "all") params.set("action", filterAction);
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));

    fetch(`/api/activity-logs?${params}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs);
        setTotal(data.total);
        setLoading(false);
      });
  }, [token, filterModule, filterAction, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-3">
            <Shield className="w-7 h-7 text-primary" /> Audit Trail
          </h1>
          <p className="text-muted-foreground mt-1">Complete activity log of all system actions</p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">{total} records</Badge>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterModule} onValueChange={(v) => { setFilterModule(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {["auth", "users", "employees", "attendance", "leaves", "payroll", "clients", "invoices", "engagements", "documents", "client_credentials"].map((m) => (
              <SelectItem key={m} value={m}>{m.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {["create", "update", "delete", "login", "logout", "approve", "reject", "status_change", "view", "upload"].map((a) => (
              <SelectItem key={a} value={a}>{a.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <ScrollText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No activity logs found</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((log: any) => (
              <Card key={log.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{log.userName}</span>
                      <Badge className={`text-xs ${actionColors[log.action] || "bg-gray-100"}`}>{log.action}</Badge>
                      <Badge variant="outline" className="text-xs">{log.module}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{log.description}</p>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(log.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
