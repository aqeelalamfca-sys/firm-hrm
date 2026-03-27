import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ClipboardList, Calendar, Users, ArrowRight, Building2 } from "lucide-react";
import { useDepartments } from "@/hooks/use-departments";
import { DepartmentBadge } from "@/components/department-badge";
import { DepartmentSelect } from "@/components/department-select";

const statusColors: Record<string, string> = {
  planning: "bg-blue-100 text-blue-800",
  execution: "bg-amber-100 text-amber-800",
  review: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  on_hold: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const typeColors: Record<string, string> = {
  audit: "bg-indigo-100 text-indigo-800",
  tax: "bg-emerald-100 text-emerald-800",
  advisory: "bg-cyan-100 text-cyan-800",
  accounting: "bg-orange-100 text-orange-800",
  compliance: "bg-rose-100 text-rose-800",
  other: "bg-gray-100 text-gray-800",
};

export default function Engagements() {
  const { token } = useAuth();
  const { selectedDepartmentId } = useDepartments();
  const [engagements, setEngagements] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    clientId: "",
    title: "",
    type: "audit",
    description: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    departmentId: "",
  });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  React.useEffect(() => {
    Promise.all([
      fetch("/api/engagements", { headers }).then((r) => r.json()),
      fetch("/api/clients", { headers }).then((r) => r.json()),
    ]).then(([eng, cli]) => {
      setEngagements(eng);
      setClients(cli);
      setLoading(false);
    });
  }, [token]);

  const filteredEngagements = engagements
    .filter((e: any) => filterStatus === "all" || e.status === filterStatus)
    .filter((e: any) => !selectedDepartmentId || e.departmentId === selectedDepartmentId);

  const stats = {
    total: engagements.length,
    active: engagements.filter((e: any) => ["planning", "execution", "review"].includes(e.status)).length,
    completed: engagements.filter((e: any) => e.status === "completed").length,
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/engagements", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...form, clientId: Number(form.clientId), departmentId: form.departmentId ? Number(form.departmentId) : null }),
    });
    if (res.ok) {
      const eng = await res.json();
      setEngagements([eng, ...engagements]);
      setDialogOpen(false);
      setForm({ clientId: "", title: "", type: "audit", description: "", startDate: new Date().toISOString().split("T")[0], endDate: "", departmentId: "" });
    }
  }

  async function handleStatusChange(id: number, newStatus: string) {
    const res = await fetch(`/api/engagements/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEngagements(engagements.map((e: any) => (e.id === id ? updated : e)));
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Engagements</h1>
          <p className="text-muted-foreground mt-1">Manage client engagements and assignments</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg shadow-primary/25"><Plus className="w-4 h-4" /> New Engagement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create New Engagement</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["audit", "tax", "advisory", "accounting", "compliance", "other"].map((t) => (
                        <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <DepartmentSelect value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v === "none" ? "" : v })} showAll={false} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <Button type="submit" className="w-full">Create Engagement</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-blue-50 border-blue-200"><CardContent className="p-4 flex items-center gap-4">
          <ClipboardList className="w-8 h-8 text-blue-600" />
          <div><p className="text-2xl font-bold text-blue-900">{stats.total}</p><p className="text-sm text-blue-700">Total Engagements</p></div>
        </CardContent></Card>
        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 flex items-center gap-4">
          <Calendar className="w-8 h-8 text-amber-600" />
          <div><p className="text-2xl font-bold text-amber-900">{stats.active}</p><p className="text-sm text-amber-700">Active</p></div>
        </CardContent></Card>
        <Card className="bg-green-50 border-green-200"><CardContent className="p-4 flex items-center gap-4">
          <Users className="w-8 h-8 text-green-600" />
          <div><p className="text-2xl font-bold text-green-900">{stats.completed}</p><p className="text-sm text-green-700">Completed</p></div>
        </CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "planning", "execution", "review", "completed", "on_hold"].map((s) => (
          <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s)} className="capitalize">
            {s === "all" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      <div className="grid gap-4">
        {filteredEngagements.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">No engagements found</CardContent></Card>
        ) : (
          filteredEngagements.map((eng: any) => (
            <Card key={eng.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{eng.title}</h3>
                      <Badge className={typeColors[eng.type] || "bg-gray-100"}>{eng.type}</Badge>
                      <Badge className={statusColors[eng.status] || "bg-gray-100"}>{eng.status.replace("_", " ")}</Badge>
                      <DepartmentBadge departmentId={eng.departmentId} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {eng.clientName}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {eng.startDate}</span>
                      <span className="text-xs text-muted-foreground">{eng.engagementCode}</span>
                      {eng.assignmentCount > 0 && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {eng.assignmentCount} members</span>}
                    </div>
                    {eng.description && <p className="text-sm text-muted-foreground mt-2">{eng.description}</p>}
                  </div>
                  {eng.status !== "completed" && eng.status !== "cancelled" && (
                    <div className="flex gap-2 ml-4">
                      {eng.status === "planning" && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(eng.id, "execution")} className="gap-1">
                          Start <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                      {eng.status === "execution" && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(eng.id, "review")} className="gap-1">
                          Review <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                      {eng.status === "review" && (
                        <Button size="sm" variant="default" onClick={() => handleStatusChange(eng.id, "completed")} className="gap-1">
                          Complete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
