import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Clock, AlertTriangle, CheckCircle2, ListTodo, BarChart3,
  Target, User, Building2, ClipboardList, Pencil, Trash2,
  FileText, ArrowUpDown,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "text-gray-700", bg: "bg-gray-100 border-gray-300", label: "Pending" },
  in_progress: { color: "text-blue-700", bg: "bg-blue-100 border-blue-300", label: "In Progress" },
  completed: { color: "text-green-700", bg: "bg-green-100 border-green-300", label: "Completed" },
  delayed: { color: "text-red-700", bg: "bg-red-100 border-red-300", label: "Delayed" },
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  low: { color: "text-slate-600", bg: "bg-slate-100", label: "Low" },
  medium: { color: "text-amber-700", bg: "bg-amber-100", label: "Medium" },
  high: { color: "text-orange-700", bg: "bg-orange-100", label: "High" },
  critical: { color: "text-red-700", bg: "bg-red-100", label: "Critical" },
};

const CALENDAR_COLORS: Record<string, string> = {
  pending: "bg-gray-200 text-gray-800 border-l-gray-500",
  in_progress: "bg-blue-100 text-blue-800 border-l-blue-500",
  completed: "bg-green-100 text-green-800 border-l-green-500",
  delayed: "bg-red-100 text-red-800 border-l-red-500",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function TaskScheduler() {
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<any>(null);
  const [editTask, setEditTask] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const [form, setForm] = useState({
    title: "", description: "", clientId: "", engagementId: "",
    assignedTo: "", startDate: new Date().toISOString().split("T")[0],
    dueDate: "", priority: "medium", remarks: "",
  });

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const canCreate = user && ["super_admin", "partner", "manager", "hr_admin"].includes(user.role);
  const canDelete = user && ["super_admin", "partner", "manager"].includes(user.role);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks", { headers }).then((r) => r.json()),
      fetch("/api/tasks/stats", { headers }).then((r) => r.json()),
      fetch("/api/clients", { headers }).then((r) => r.json()),
      fetch("/api/engagements", { headers }).then((r) => r.json()),
      fetch("/api/users", { headers }).then((r) => r.json()).catch(() => []),
    ]).then(([t, s, c, e, u]) => {
      setTasks(t);
      setStats(s);
      setClients(c);
      setEngagements(e);
      setUsers(u);
      setLoading(false);
    });
  }, [token]);

  const today = new Date().toISOString().split("T")[0];

  function getEffectiveStatus(t: any): string {
    if (t.status !== "completed" && t.dueDate && t.dueDate < today) return "delayed";
    return t.status;
  }

  const enrichedTasks = useMemo(() => {
    return tasks.map((t: any) => ({ ...t, effectiveStatus: getEffectiveStatus(t) }));
  }, [tasks, today]);

  const filteredTasks = useMemo(() => {
    return enrichedTasks
      .filter((t: any) => filterStatus === "all" || t.effectiveStatus === filterStatus)
      .filter((t: any) => filterPriority === "all" || t.priority === filterPriority);
  }, [enrichedTasks, filterStatus, filterPriority]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredTasks.forEach((t: any) => {
      const start = t.startDate;
      const due = t.dueDate;
      if (!map[start]) map[start] = [];
      map[start].push({ ...t, dateType: "start" });
      if (due !== start) {
        if (!map[due]) map[due] = [];
        map[due].push({ ...t, dateType: "due" });
      }
    });
    return map;
  }, [filteredTasks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tasks", {
      method: "POST", headers,
      body: JSON.stringify({
        ...form,
        clientId: form.clientId ? Number(form.clientId) : null,
        engagementId: form.engagementId ? Number(form.engagementId) : null,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
      }),
    });
    if (res.ok) {
      const task = await res.json();
      setTasks([task, ...tasks]);
      const sr = await fetch("/api/tasks/stats", { headers });
      setStats(await sr.json());
      setDialogOpen(false);
      resetForm();
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editTask) return;
    const res = await fetch(`/api/tasks/${editTask.id}`, {
      method: "PUT", headers,
      body: JSON.stringify({
        ...form,
        clientId: form.clientId ? Number(form.clientId) : null,
        engagementId: form.engagementId ? Number(form.engagementId) : null,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(tasks.map((t: any) => (t.id === editTask.id ? { ...t, ...updated } : t)));
      const sr = await fetch("/api/tasks/stats", { headers });
      setStats(await sr.json());
      setEditTask(null);
      setDialogOpen(false);
      resetForm();
    }
  }

  async function handleStatusChange(id: number, status: string) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT", headers,
      body: JSON.stringify({ status, progressPercentage: status === "completed" ? 100 : undefined }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(tasks.map((t: any) => (t.id === id ? { ...t, ...updated } : t)));
      const sr = await fetch("/api/tasks/stats", { headers });
      setStats(await sr.json());
      if (detailTask?.id === id) setDetailTask({ ...detailTask, ...updated });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this task?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      setTasks(tasks.filter((t: any) => t.id !== id));
      const sr = await fetch("/api/tasks/stats", { headers });
      setStats(await sr.json());
      setDetailTask(null);
    }
  }

  function resetForm() {
    setForm({
      title: "", description: "", clientId: "", engagementId: "",
      assignedTo: "", startDate: new Date().toISOString().split("T")[0],
      dueDate: "", priority: "medium", remarks: "",
    });
  }

  function openEdit(task: any) {
    setEditTask(task);
    setForm({
      title: task.title || "", description: task.description || "",
      clientId: task.clientId ? String(task.clientId) : "",
      engagementId: task.engagementId ? String(task.engagementId) : "",
      assignedTo: task.assignedTo ? String(task.assignedTo) : "",
      startDate: task.startDate || "", dueDate: task.dueDate || "",
      priority: task.priority || "medium", remarks: task.remarks || "",
    });
    setDialogOpen(true);
  }

  function navigateMonth(dir: number) {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1));
  }

  function navigateWeek(dir: number) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, [currentDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
  }, [weekStart]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-3">
            <CalendarIcon className="w-7 h-7 text-primary" /> Task Scheduler
          </h1>
          <p className="text-muted-foreground mt-1">Manage tasks, deadlines, and assignments</p>
        </div>
        {canCreate && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditTask(null); resetForm(); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/25"><Plus className="w-4 h-4" /> New Task</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editTask ? "Edit Task" : "Create New Task"}</DialogTitle></DialogHeader>
              <form onSubmit={editTask ? handleUpdate : handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Engagement</Label>
                    <Select value={form.engagementId} onValueChange={(v) => setForm({ ...form, engagementId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select engagement" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {engagements.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Assign To</Label>
                    <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
                      <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {users.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["low", "medium", "high", "critical"].map((p) => (
                          <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date *</Label>
                    <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} />
                </div>
                <Button type="submit" className="w-full">{editTask ? "Update Task" : "Create Task"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={ListTodo} label="Total" value={stats.total || 0} color="blue" />
        <StatCard icon={Clock} label="Pending" value={stats.pending || 0} color="gray" />
        <StatCard icon={Target} label="In Progress" value={stats.inProgress || 0} color="blue" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.completed || 0} color="green" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue || 0} color="red" />
        <StatCard icon={AlertTriangle} label="Critical" value={stats.critical || 0} color="orange" />
        <StatCard icon={Clock} label="Due Today" value={stats.dueToday || 0} color="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="calendar" className="gap-1.5"><CalendarIcon className="w-4 h-4" /> Calendar</TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5"><ListTodo className="w-4 h-4" /> List</TabsTrigger>
          </TabsList>
        </Tabs>
        {viewMode === "calendar" && (
          <Tabs value={calendarView} onValueChange={(v) => setCalendarView(v as any)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="flex-1" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {viewMode === "calendar" ? (
        calendarView === "month" ? (
          <MonthCalendar
            year={year} month={month} daysInMonth={daysInMonth} firstDay={firstDay}
            today={today} tasksByDate={tasksByDate}
            onNavigate={navigateMonth} onTaskClick={setDetailTask}
          />
        ) : (
          <WeekCalendar
            weekDays={weekDays} weekStart={weekStart}
            today={today} tasksByDate={tasksByDate}
            onNavigate={navigateWeek} onTaskClick={setDetailTask}
          />
        )
      ) : (
        <TaskList
          tasks={filteredTasks}
          onTaskClick={setDetailTask}
          onEdit={openEdit}
          onDelete={handleDelete}
          canDelete={!!canDelete}
        />
      )}

      <Dialog open={!!detailTask} onOpenChange={(open) => { if (!open) setDetailTask(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailTask && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="flex-1">{detailTask.title}</span>
                  <Badge className={PRIORITY_CONFIG[detailTask.priority]?.bg || "bg-gray-100"}>
                    {PRIORITY_CONFIG[detailTask.priority]?.label}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_CONFIG[getEffectiveStatus(detailTask)]?.bg || "bg-gray-100"}>
                    {STATUS_CONFIG[getEffectiveStatus(detailTask)]?.label || detailTask.status}
                  </Badge>
                </div>

                {detailTask.description && (
                  <p className="text-sm text-muted-foreground">{detailTask.description}</p>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-muted-foreground" /><span>Start: {detailTask.startDate}</span></div>
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /><span>Due: {detailTask.dueDate}</span></div>
                  {detailTask.assignedToName && <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><span>Assigned: {detailTask.assignedToName}</span></div>}
                  {detailTask.assignedByName && <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><span>By: {detailTask.assignedByName}</span></div>}
                  {detailTask.clientName && <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span>{detailTask.clientName}</span></div>}
                  {detailTask.engagementTitle && <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-muted-foreground" /><span>{detailTask.engagementTitle}</span></div>}
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Progress</span>
                    <span>{detailTask.progressPercentage}%</span>
                  </div>
                  <Progress value={detailTask.progressPercentage} className="h-2" />
                </div>

                {detailTask.remarks && (
                  <div className="text-sm bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Remarks</p>
                    <p>{detailTask.remarks}</p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap pt-2 border-t">
                  {getEffectiveStatus(detailTask) === "pending" && (
                    <Button size="sm" onClick={() => handleStatusChange(detailTask.id, "in_progress")} className="bg-blue-600 hover:bg-blue-700 text-white">
                      Start Task
                    </Button>
                  )}
                  {getEffectiveStatus(detailTask) === "in_progress" && (
                    <Button size="sm" onClick={() => handleStatusChange(detailTask.id, "completed")} className="bg-green-600 hover:bg-green-700 text-white">
                      Mark Complete
                    </Button>
                  )}
                  {getEffectiveStatus(detailTask) === "delayed" && (
                    <Button size="sm" onClick={() => handleStatusChange(detailTask.id, "in_progress")} variant="outline">
                      Resume
                    </Button>
                  )}
                  {canCreate && (
                    <Button size="sm" variant="outline" onClick={() => { setDetailTask(null); openEdit(detailTask); }}>
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(detailTask.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-600",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
    green: "bg-green-50 border-green-200 text-green-600",
    red: "bg-red-50 border-red-200 text-red-600",
    orange: "bg-orange-50 border-orange-200 text-orange-600",
    amber: "bg-amber-50 border-amber-200 text-amber-600",
  };
  return (
    <Card className={`border ${colors[color] || colors.gray}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className="w-5 h-5 shrink-0" />
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs opacity-70">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthCalendar({
  year, month, daysInMonth, firstDay, today, tasksByDate, onNavigate, onTaskClick,
}: {
  year: number; month: number; daysInMonth: number; firstDay: number;
  today: string; tasksByDate: Record<string, any[]>;
  onNavigate: (dir: number) => void; onTaskClick: (t: any) => void;
}) {
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <Button variant="ghost" size="icon" onClick={() => onNavigate(-1)}><ChevronLeft className="w-5 h-5" /></Button>
        <CardTitle className="text-lg">{MONTHS[month]} {year}</CardTitle>
        <Button variant="ghost" size="icon" onClick={() => onNavigate(1)}><ChevronRight className="w-5 h-5" /></Button>
      </CardHeader>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="bg-card p-1 min-h-[80px]" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayTasks = tasksByDate[dateStr] || [];
            const isToday = dateStr === today;
            return (
              <div key={dateStr} className={`bg-card p-1 min-h-[80px] ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}>
                <span className={`text-xs font-medium inline-block w-6 h-6 leading-6 text-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                  {day}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t: any, idx: number) => (
                    <button
                      key={`${t.id}-${idx}`}
                      onClick={() => onTaskClick(t)}
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80 transition-opacity ${CALENDAR_COLORS[t.effectiveStatus || t.status] || CALENDAR_COLORS.pending}`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function WeekCalendar({
  weekDays, weekStart, today, tasksByDate, onNavigate, onTaskClick,
}: {
  weekDays: string[]; weekStart: Date;
  today: string; tasksByDate: Record<string, any[]>;
  onNavigate: (dir: number) => void; onTaskClick: (t: any) => void;
}) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <Button variant="ghost" size="icon" onClick={() => onNavigate(-1)}><ChevronLeft className="w-5 h-5" /></Button>
        <CardTitle className="text-lg">{label}</CardTitle>
        <Button variant="ghost" size="icon" onClick={() => onNavigate(1)}><ChevronRight className="w-5 h-5" /></Button>
      </CardHeader>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((dateStr) => {
            const d = new Date(dateStr + "T12:00:00");
            const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
            const dayNum = d.getDate();
            const dayTasks = tasksByDate[dateStr] || [];
            const isToday = dateStr === today;
            return (
              <div key={dateStr} className={`rounded-lg border p-2 min-h-[200px] ${isToday ? "ring-2 ring-primary" : "border-border"}`}>
                <div className="text-center mb-2">
                  <p className="text-xs text-muted-foreground">{dayName}</p>
                  <p className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>{dayNum}</p>
                </div>
                <div className="space-y-1">
                  {dayTasks.map((t: any, idx: number) => (
                    <button
                      key={`${t.id}-${idx}`}
                      onClick={() => onTaskClick(t)}
                      className={`w-full text-left text-xs px-2 py-1 rounded border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${CALENDAR_COLORS[t.effectiveStatus || t.status] || CALENDAR_COLORS.pending}`}
                    >
                      <p className="font-medium truncate">{t.title}</p>
                      <p className="text-[10px] opacity-70 truncate">{t.assignedToName || "Unassigned"}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskList({
  tasks, onTaskClick, onEdit, onDelete, canDelete,
}: {
  tasks: any[]; onTaskClick: (t: any) => void;
  onEdit: (t: any) => void; onDelete: (id: number) => void; canDelete: boolean;
}) {
  return (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No tasks found</p>
        </CardContent></Card>
      ) : (
        tasks.map((t: any) => (
          <Card key={t.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onTaskClick(t)}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`w-1.5 h-12 rounded-full ${
                (t.effectiveStatus || t.status) === "completed" ? "bg-green-500" :
                (t.effectiveStatus || t.status) === "delayed" ? "bg-red-500" :
                (t.effectiveStatus || t.status) === "in_progress" ? "bg-blue-500" : "bg-gray-300"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium truncate">{t.title}</h3>
                  <Badge className={`text-[10px] ${PRIORITY_CONFIG[t.priority]?.bg || ""}`}>
                    {PRIORITY_CONFIG[t.priority]?.label}
                  </Badge>
                  <Badge className={`text-[10px] ${STATUS_CONFIG[t.effectiveStatus || t.status]?.bg || ""}`}>
                    {STATUS_CONFIG[t.effectiveStatus || t.status]?.label || t.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {t.startDate} → {t.dueDate}</span>
                  {t.assignedToName && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {t.assignedToName}</span>}
                  {t.clientName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {t.clientName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="w-16">
                  <Progress value={t.progressPercentage} className="h-1.5" />
                  <p className="text-[10px] text-center text-muted-foreground mt-0.5">{t.progressPercentage}%</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => onEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                {canDelete && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
