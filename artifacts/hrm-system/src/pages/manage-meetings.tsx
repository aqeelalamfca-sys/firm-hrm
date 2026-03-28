import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar, Clock, User, Building2, Mail, Phone, CheckCircle, XCircle,
  Video, FileText, Loader2, Check, X, Trash2
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

export default function ManageMeetings() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [detailMeeting, setDetailMeeting] = useState<any>(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  useEffect(() => {
    fetchMeetings();
  }, [token]);

  async function fetchMeetings() {
    try {
      const res = await fetch("/api/meetings", { headers });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: number, status: string) {
    const res = await fetch(`/api/meetings/${id}/status`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMeetings(meetings.map(m => m.id === id ? updated : m));
      if (detailMeeting?.id === id) setDetailMeeting(updated);
      toast({ title: `Meeting ${status}` });
    }
  }

  async function deleteMeeting(id: number) {
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      setMeetings(meetings.filter(m => m.id !== id));
      setDetailMeeting(null);
      toast({ title: "Meeting deleted" });
    }
  }

  const filtered = useMemo(() => {
    if (activeTab === "all") return meetings;
    return meetings.filter(m => m.status === activeTab);
  }, [meetings, activeTab]);

  const stats = useMemo(() => ({
    total: meetings.length,
    pending: meetings.filter(m => m.status === "pending").length,
    confirmed: meetings.filter(m => m.status === "confirmed").length,
    completed: meetings.filter(m => m.status === "completed").length,
    cancelled: meetings.filter(m => m.status === "cancelled").length,
  }), [meetings]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Manage Meetings</h1>
        <p className="text-sm text-muted-foreground mt-1">View and manage online meeting bookings with partners.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "bg-blue-50 border-blue-100 text-blue-700" },
          { label: "Pending", value: stats.pending, color: "bg-amber-50 border-amber-100 text-amber-700" },
          { label: "Confirmed", value: stats.confirmed, color: "bg-sky-50 border-sky-100 text-sky-700" },
          { label: "Completed", value: stats.completed, color: "bg-emerald-50 border-emerald-100 text-emerald-700" },
          { label: "Cancelled", value: stats.cancelled, color: "bg-red-50 border-red-100 text-red-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75">{s.label}</p>
            <p className="text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40 border border-border/50 p-1 rounded-xl h-auto flex-wrap">
          {[
            { key: "all", label: `All (${stats.total})` },
            { key: "pending", label: `Pending (${stats.pending})` },
            { key: "confirmed", label: `Confirmed (${stats.confirmed})` },
            { key: "completed", label: `Completed (${stats.completed})` },
            { key: "cancelled", label: `Cancelled (${stats.cancelled})` },
          ].map(({ key, label }) => (
            <TabsTrigger key={key} value={key} className="text-xs px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b border-border/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Partner</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Purpose</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <Video className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">No meetings found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m: any) => (
                      <tr
                        key={m.id}
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setDetailMeeting(m)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-sm">{m.clientName}</p>
                          <p className="text-xs text-muted-foreground">{m.clientEmail}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{m.partnerName}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm">{new Date(m.meetingDate + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p>
                          <p className="text-xs text-muted-foreground">{m.meetingTime} ({m.duration} min)</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm capitalize">{m.purpose}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`uppercase text-[10px] px-2 py-0.5 font-semibold ${STATUS_STYLES[m.status]}`}>
                            {m.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end">
                            {m.status === "pending" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => updateStatus(m.id, "confirmed")}>
                                  <Check className="w-3 h-3" /> Confirm
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => updateStatus(m.id, "cancelled")}>
                                  <X className="w-3 h-3" /> Cancel
                                </Button>
                              </>
                            )}
                            {m.status === "confirmed" && (
                              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => updateStatus(m.id, "completed")}>
                                <CheckCircle className="w-3 h-3" /> Complete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && filtered.length > 0 && (
              <div className="px-4 py-3 bg-muted/20 border-t border-border/50 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{filtered.length} meeting{filtered.length !== 1 ? "s" : ""}</span>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailMeeting} onOpenChange={open => { if (!open) setDetailMeeting(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          {detailMeeting && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Video className="w-5 h-5 text-primary" />
                  Meeting Details
                </DialogTitle>
                <DialogDescription>Booking information and management</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`uppercase text-[10px] font-semibold ${STATUS_STYLES[detailMeeting.status]}`}>
                    {detailMeeting.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Booked: {new Date(detailMeeting.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-3 text-sm">
                    <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> <span className="text-muted-foreground">Client:</span> <span className="font-medium">{detailMeeting.clientName}</span></div>
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> <span className="text-muted-foreground">Email:</span> <span className="font-medium">{detailMeeting.clientEmail}</span></div>
                    <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> <span className="text-muted-foreground">Phone:</span> <span className="font-medium">{detailMeeting.clientPhone}</span></div>
                    {detailMeeting.companyName && <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> <span className="text-muted-foreground">Company:</span> <span className="font-medium">{detailMeeting.companyName}</span></div>}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Partner</p>
                    <p className="font-semibold text-sm">{detailMeeting.partnerName}</p>
                  </div>
                  <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Purpose</p>
                    <p className="font-semibold text-sm">{detailMeeting.purpose}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1 flex items-center gap-2 bg-muted/30 rounded-lg p-3">
                    <Calendar className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Date</p>
                      <p className="text-sm font-semibold">{new Date(detailMeeting.meetingDate + "T00:00:00").toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-muted/30 rounded-lg p-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Time</p>
                      <p className="text-sm font-semibold">{detailMeeting.meetingTime} ({detailMeeting.duration} min)</p>
                    </div>
                  </div>
                </div>

                {detailMeeting.notes && <p className="text-sm bg-muted/50 p-3 rounded-lg">{detailMeeting.notes}</p>}

                <div className="flex gap-2 pt-2 border-t border-border/40">
                  {detailMeeting.status === "pending" && (
                    <>
                      <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => updateStatus(detailMeeting.id, "confirmed")}>
                        <CheckCircle className="w-4 h-4" /> Confirm
                      </Button>
                      <Button variant="outline" className="flex-1 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => updateStatus(detailMeeting.id, "cancelled")}>
                        <XCircle className="w-4 h-4" /> Cancel
                      </Button>
                    </>
                  )}
                  {detailMeeting.status === "confirmed" && (
                    <Button className="flex-1 gap-1.5" onClick={() => updateStatus(detailMeeting.id, "completed")}>
                      <CheckCircle className="w-4 h-4" /> Mark Completed
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMeeting(detailMeeting.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
