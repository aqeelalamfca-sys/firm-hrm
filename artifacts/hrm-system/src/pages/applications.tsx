import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Filter, Eye, UserCheck, UserX, Star, Clock, Users, FileText, Download,
  GraduationCap, MapPin, Phone, Mail, Briefcase, Calendar, CheckCircle2, XCircle,
  AlertCircle, Loader2
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  shortlisted: { label: "Shortlisted", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Star },
  selected: { label: "Selected", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: UserCheck },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: UserX },
};

const DEPT_LABELS: Record<string, string> = {
  audit: "Audit & Assurance",
  tax: "Tax Advisory",
  corporate: "Corporate Services",
  advisory: "Advisory & Consulting",
  any: "No Preference",
};

const LOCATION_LABELS: Record<string, string> = {
  lahore: "Lahore",
  islamabad: "Islamabad",
  any: "Either",
};

async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = localStorage.getItem("hrm_token");
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

export default function Applications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", search, statusFilter, deptFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (deptFilter !== "all") params.set("department", deptFilter);
      return fetchWithAuth(`${API_BASE}/applications?${params.toString()}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetchWithAuth(`${API_BASE}/applications/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      if (selectedApp) setSelectedApp({ ...selectedApp, status: data.status });
      toast({ title: "Status Updated", description: `Application marked as ${data.status}` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const viewApplication = async (id: number) => {
    setDetailLoading(true);
    try {
      const app = await fetchWithAuth(`${API_BASE}/applications/${id}`);
      setSelectedApp(app);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const stats = {
    total: applications.length,
    pending: applications.filter((a: any) => a.status === "pending").length,
    shortlisted: applications.filter((a: any) => a.status === "shortlisted").length,
    selected: applications.filter((a: any) => a.status === "selected").length,
    rejected: applications.filter((a: any) => a.status === "rejected").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training Applications</h1>
          <p className="text-sm text-muted-foreground">Review and manage CA training applications</p>
        </div>
        <Badge variant="outline" className="text-xs font-semibold px-3 py-1.5">
          <Users className="w-3.5 h-3.5 mr-1.5" /> {stats.total} Applications
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, { label, color, icon: Icon }]) => (
          <Card
            key={key}
            className={`cursor-pointer border transition-all hover:shadow-sm ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold">{(stats as any)[key]}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, CNIC, or email..."
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            <SelectItem value="audit">Audit & Assurance</SelectItem>
            <SelectItem value="tax">Tax Advisory</SelectItem>
            <SelectItem value="corporate">Corporate Services</SelectItem>
            <SelectItem value="advisory">Advisory & Consulting</SelectItem>
            <SelectItem value="any">No Preference</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : applications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No applications found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Applicant</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">CRN</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Test</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Applied</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app: any) => {
                  const sc = STATUS_CONFIG[app.status] || STATUS_CONFIG.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={app.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{app.fullName}</div>
                        <div className="text-[10px] text-muted-foreground">{app.mobile} | {app.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-primary font-medium">{app.crn || "—"}</td>
                      <td className="px-4 py-3 text-xs">{DEPT_LABELS[app.preferredDept] || app.preferredDept}</td>
                      <td className="px-4 py-3">
                        {app.testStatus ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${app.testStatus === "Passed" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                            {app.testStatus === "Passed" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {app.testScore}/{app.testTotal}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Not taken</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sc.color}`}>
                          <StatusIcon className="w-3 h-3" /> {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(app.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-right flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => viewApplication(app.id)}>
                          <Eye className="w-3.5 h-3.5" /> View
                        </Button>
                        {app.pdfUrl && (
                          <a href={`${API_BASE.replace("/api", "")}${app.pdfUrl}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-blue-600">
                              <Download className="w-3.5 h-3.5" /> PDF
                            </Button>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : selectedApp && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedApp.photoUrl && (
                      <img
                        src={`${API_BASE.replace("/api", "")}${selectedApp.photoUrl}`}
                        alt={selectedApp.fullName}
                        className="w-14 h-14 rounded-xl object-cover border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div>
                      <DialogTitle className="text-lg">{selectedApp.fullName}</DialogTitle>
                      <p className="text-xs text-muted-foreground">S/D of {selectedApp.fatherName}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_CONFIG[selectedApp.status]?.color || ""}`}>
                    {STATUS_CONFIG[selectedApp.status]?.label || selectedApp.status}
                  </span>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap gap-2 mt-3">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground font-medium">
                  <Phone className="w-3 h-3" /> {selectedApp.mobile}
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground font-medium">
                  <Mail className="w-3 h-3" /> {selectedApp.email}
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground font-medium">
                  <FileText className="w-3 h-3" /> {selectedApp.cnic}
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground font-medium">
                  <Calendar className="w-3 h-3" /> DOB: {new Date(selectedApp.dateOfBirth).toLocaleDateString("en-PK")}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Gender</p>
                  <p className="text-xs font-semibold capitalize">{selectedApp.gender}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Marital Status</p>
                  <p className="text-xs font-semibold capitalize">{selectedApp.maritalStatus}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Location</p>
                  <p className="text-xs font-semibold">{LOCATION_LABELS[selectedApp.preferredLocation] || selectedApp.preferredLocation}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Department</p>
                  <p className="text-xs font-semibold">{DEPT_LABELS[selectedApp.preferredDept] || selectedApp.preferredDept}</p>
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5" /> Academic Record
                </h4>
                <div className="space-y-2">
                  <div className="bg-muted/20 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Matriculation</p>
                      <p className="text-[10px] text-muted-foreground">{selectedApp.matricBoard} ({selectedApp.matricYear})</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{selectedApp.matricMarks}</Badge>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Intermediate</p>
                      <p className="text-[10px] text-muted-foreground">{selectedApp.interBoard} ({selectedApp.interYear})</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{selectedApp.interMarks}</Badge>
                  </div>
                  {selectedApp.graduationDegree && (
                    <div className="bg-muted/20 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold">{selectedApp.graduationDegree}</p>
                        <p className="text-[10px] text-muted-foreground">{selectedApp.graduationUni} ({selectedApp.graduationYear})</p>
                      </div>
                      {selectedApp.graduationMarks && <Badge variant="outline" className="text-[10px]">{selectedApp.graduationMarks}</Badge>}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> Training Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground">ICAP Level</p>
                    <p className="text-xs font-semibold">{selectedApp.icapLevel?.replace(/_/g, " ").toUpperCase()}</p>
                  </div>
                  {selectedApp.icapRegNo && (
                    <div className="bg-muted/20 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground">ICAP Reg No.</p>
                      <p className="text-xs font-semibold">{selectedApp.icapRegNo}</p>
                    </div>
                  )}
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground">Available From</p>
                    <p className="text-xs font-semibold">{new Date(selectedApp.availableStart).toLocaleDateString("en-PK")}</p>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground">Availability</p>
                    <p className="text-xs font-semibold">{selectedApp.isFullTime ? "Full-Time" : "Part-Time"}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Skills Assessment</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/20 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Accounting</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{selectedApp.accountingLevel}</Badge>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Excel</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{selectedApp.excelLevel}</Badge>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Communication</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{selectedApp.communication}</Badge>
                  </div>
                </div>
                {selectedApp.softwareSkills && (
                  <p className="text-xs text-muted-foreground mt-2">Software: {selectedApp.softwareSkills}</p>
                )}
              </div>

              {selectedApp.experienceDetails && (
                <div className="mt-5">
                  <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2">Experience</h4>
                  <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 leading-relaxed">{selectedApp.experienceDetails}</p>
                </div>
              )}

              {(selectedApp.cnicFrontUrl || selectedApp.cnicBackUrl) && (
                <div className="mt-5">
                  <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Uploaded Documents</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedApp.cnicFrontUrl && (
                      <a
                        href={`${API_BASE.replace("/api", "")}${selectedApp.cnicFrontUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-primary hover:underline bg-muted/20 rounded-lg p-3"
                      >
                        <Download className="w-3.5 h-3.5" /> CNIC Front
                      </a>
                    )}
                    {selectedApp.cnicBackUrl && (
                      <a
                        href={`${API_BASE.replace("/api", "")}${selectedApp.cnicBackUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-primary hover:underline bg-muted/20 rounded-lg p-3"
                      >
                        <Download className="w-3.5 h-3.5" /> CNIC Back
                      </a>
                    )}
                  </div>
                </div>
              )}

              {selectedApp.testStatus && (
                <div className="mt-5">
                  <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5" /> Assessment Test Result
                  </h4>
                  <div className={`rounded-xl p-4 border ${selectedApp.testStatus === "Passed" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {selectedApp.testStatus === "Passed" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        <span className={`text-sm font-bold ${selectedApp.testStatus === "Passed" ? "text-emerald-700" : "text-red-700"}`}>
                          {selectedApp.testStatus}
                        </span>
                      </div>
                      <span className="text-lg font-bold">{selectedApp.testScore}/{selectedApp.testTotal}</span>
                    </div>
                    {selectedApp.testDate && (
                      <p className="text-[10px] text-muted-foreground">Test Date: {new Date(selectedApp.testDate).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}</p>
                    )}
                    {selectedApp.interviewDate && (
                      <p className="text-[10px] text-muted-foreground mt-1">Interview: {new Date(selectedApp.interviewDate).toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} at 11:00 AM</p>
                    )}
                    {selectedApp.pdfUrl && (
                      <a href={`${API_BASE.replace("/api", "")}${selectedApp.pdfUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:underline">
                        <Download className="w-3.5 h-3.5" /> Download Result PDF
                      </a>
                    )}
                  </div>
                </div>
              )}

              {selectedApp.crn && (
                <div className="mt-3">
                  <p className="text-[10px] text-muted-foreground">CRN: <span className="font-mono font-semibold text-primary">{selectedApp.crn}</span></p>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-border/40">
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Update Status</h4>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(STATUS_CONFIG).map(([key, { label, icon: Icon }]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={selectedApp.status === key ? "default" : "outline"}
                      className="gap-1.5 text-xs"
                      disabled={selectedApp.status === key || statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: selectedApp.id, status: key })}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
