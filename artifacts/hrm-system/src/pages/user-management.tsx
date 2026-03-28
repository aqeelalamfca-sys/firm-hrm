import React, { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCog, Shield, Edit, Search, Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useDepartments } from "@/hooks/use-departments";
import { DepartmentBadge } from "@/components/department-badge";
import { DepartmentSelect } from "@/components/department-select";
import * as XLSX from "xlsx";

const roleLabels: Record<string, string> = {
  super_admin: "Admin",
  partner: "Partner",
  hr_admin: "HR Admin",
  finance_officer: "Finance",
  manager: "Manager",
  employee: "Employee",
  trainee: "Trainee",
};

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800",
  partner: "bg-purple-100 text-purple-800",
  hr_admin: "bg-blue-100 text-blue-800",
  finance_officer: "bg-emerald-100 text-emerald-800",
  manager: "bg-amber-100 text-amber-800",
  employee: "bg-gray-100 text-gray-800",
  trainee: "bg-cyan-100 text-cyan-800",
};

export default function UserManagement() {
  const { token, user: currentUser } = useAuth();
  const { selectedDepartmentId } = useDepartments();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "employee",
    phone: "", mobile: "", cnic: "", departmentId: "",
  });

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  React.useEffect(() => {
    fetch("/api/users", { headers })
      .then((r) => r.json())
      .then((data) => { setUsers(data); setLoading(false); });
  }, [token]);

  const filtered = users
    .filter((u: any) => !selectedDepartmentId || u.departmentId === selectedDepartmentId)
    .filter((u: any) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editUser) {
      const updateData: any = { name: form.name, email: form.email, role: form.role, phone: form.phone, mobile: form.mobile, cnic: form.cnic, departmentId: form.departmentId ? Number(form.departmentId) : null };
      if (form.password) updateData.password = form.password;
      const res = await fetch(`/api/users/${editUser.id}`, { method: "PUT", headers, body: JSON.stringify(updateData) });
      if (res.ok) {
        const updated = await res.json();
        setUsers(users.map((u: any) => (u.id === editUser.id ? updated : u)));
      }
    } else {
      const res = await fetch("/api/users", { method: "POST", headers, body: JSON.stringify({ ...form, departmentId: form.departmentId ? Number(form.departmentId) : null }) });
      if (res.ok) {
        const newUser = await res.json();
        setUsers([...users, newUser]);
      }
    }
    setDialogOpen(false);
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "employee", phone: "", mobile: "", cnic: "", departmentId: "" });
  }

  function openEdit(u: any) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, phone: u.phone || "", mobile: u.mobile || "", cnic: u.cnic || "", departmentId: u.departmentId ? String(u.departmentId) : "" });
    setDialogOpen(true);
  }

  async function toggleStatus(u: any) {
    const newStatus = u.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/users/${u.id}`, { method: "PUT", headers, body: JSON.stringify({ status: newStatus }) });
    if (res.ok) {
      const updated = await res.json();
      setUsers(users.map((x: any) => (x.id === u.id ? updated : x)));
    }
  }

  function downloadTemplate() {
    const templateData = [
      {
        Name: "John Doe",
        Email: "john@example.com",
        Password: "password123",
        Role: "employee",
        Department: "Audit & Assurance",
        Phone: "042-1234567",
        Mobile: "0300-1234567",
        CNIC: "35201-1234567-1",
      },
      {
        Name: "Jane Smith",
        Email: "jane@example.com",
        Password: "password123",
        Role: "trainee",
        Department: "Taxation",
        Phone: "",
        Mobile: "0321-9876543",
        CNIC: "35202-7654321-2",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);

    const colWidths = [
      { wch: 25 },
      { wch: 30 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
    ];
    ws["!cols"] = colWidths;

    const rolesSheet = XLSX.utils.aoa_to_sheet([
      ["Valid Roles", "Description"],
      ["super_admin", "Full system access"],
      ["partner", "Partner-level access"],
      ["hr_admin", "HR administration"],
      ["finance_officer", "Finance/billing access"],
      ["manager", "Department manager"],
      ["employee", "Basic employee access"],
      ["trainee", "Limited trainee access"],
    ]);
    rolesSheet["!cols"] = [{ wch: 18 }, { wch: 30 }];

    const deptSheet = XLSX.utils.aoa_to_sheet([
      ["Valid Departments"],
      ["Audit & Assurance"],
      ["Taxation"],
      ["Corporate & Secretarial"],
      ["Advisory"],
      ["Others"],
    ]);
    deptSheet["!cols"] = [{ wch: 28 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.utils.book_append_sheet(wb, rolesSheet, "Valid Roles");
    XLSX.utils.book_append_sheet(wb, deptSheet, "Valid Departments");

    XLSX.writeFile(wb, "User_Upload_Template.xlsx");
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploadResults(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const mapped = rows.map((row) => ({
        name: row["Name"] || row["name"] || "",
        email: row["Email"] || row["email"] || "",
        password: row["Password"] || row["password"] || "",
        role: row["Role"] || row["role"] || "employee",
        department: row["Department"] || row["department"] || "",
        phone: row["Phone"] || row["phone"] || "",
        mobile: row["Mobile"] || row["mobile"] || "",
        cnic: row["CNIC"] || row["cnic"] || "",
      }));
      setParsedRows(mapped);
    };
    reader.readAsBinaryString(file);
  }

  async function handleBulkUpload() {
    if (parsedRows.length === 0) return;
    setUploading(true);
    try {
      const res = await fetch("/api/users/bulk-upload", {
        method: "POST",
        headers,
        body: JSON.stringify({ users: parsedRows }),
      });
      const data = await res.json();
      if (res.ok) {
        setUploadResults(data);
        const refreshRes = await fetch("/api/users", { headers });
        const refreshData = await refreshRes.json();
        setUsers(refreshData);
      } else {
        setUploadResults({ error: data.error || "Upload failed" });
      }
    } catch {
      setUploadResults({ error: "Network error during upload" });
    } finally {
      setUploading(false);
    }
  }

  function resetUploadDialog() {
    setParsedRows([]);
    setFileName("");
    setUploadResults(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-3">
            <UserCog className="w-7 h-7 text-primary" /> User Management
          </h1>
          <p className="text-muted-foreground mt-1">Manage system users, roles, and access</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={(open) => { setUploadDialogOpen(open); if (!open) resetUploadDialog(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="w-4 h-4" /> Upload Sheet
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  Bulk Upload Users
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Instructions</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Download the template file below</li>
                        <li>Fill in user details (Name, Email, Password are required)</li>
                        <li>Check the "Valid Roles" and "Valid Departments" sheets for allowed values</li>
                        <li>Upload the completed file</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <Button variant="outline" className="gap-2 w-full" onClick={downloadTemplate}>
                  <Download className="w-4 h-4" /> Download Excel Template
                </Button>

                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="excel-upload"
                  />
                  <label htmlFor="excel-upload" className="cursor-pointer">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">{fileName || "Click to select Excel file"}</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx or .xls files only</p>
                  </label>
                </div>

                {parsedRows.length > 0 && !uploadResults && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{parsedRows.length} user(s) found in file</p>
                    </div>
                    <div className="max-h-48 overflow-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">#</TableHead>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Email</TableHead>
                            <TableHead className="text-xs">Role</TableHead>
                            <TableHead className="text-xs">Department</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{i + 1}</TableCell>
                              <TableCell className="text-xs">{row.name}</TableCell>
                              <TableCell className="text-xs">{row.email}</TableCell>
                              <TableCell className="text-xs">{row.role}</TableCell>
                              <TableCell className="text-xs">{row.department || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button onClick={handleBulkUpload} disabled={uploading} className="w-full gap-2">
                      {uploading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" /> Upload {parsedRows.length} User(s)
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {uploadResults && !uploadResults.error && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-muted rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold">{uploadResults.total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-700">{uploadResults.created}</p>
                        <p className="text-xs text-green-600">Created</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-amber-700">{uploadResults.skipped}</p>
                        <p className="text-xs text-amber-600">Skipped</p>
                      </div>
                    </div>

                    <div className="max-h-48 overflow-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Row</TableHead>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uploadResults.results.map((r: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{r.row}</TableCell>
                              <TableCell className="text-xs">{r.name}</TableCell>
                              <TableCell>
                                {r.status === "created" ? (
                                  <Badge className="bg-green-100 text-green-800 text-xs gap-1"><CheckCircle2 className="w-3 h-3" /> Created</Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-800 text-xs gap-1"><XCircle className="w-3 h-3" /> Skipped</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.reason || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <Button variant="outline" onClick={resetUploadDialog} className="w-full">
                      Upload Another File
                    </Button>
                  </div>
                )}

                {uploadResults?.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                    <p className="font-medium">Upload Failed</p>
                    <p>{uploadResults.error}</p>
                    <Button variant="outline" size="sm" onClick={resetUploadDialog} className="mt-2">
                      Try Again
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditUser(null); setForm({ name: "", email: "", password: "", role: "employee", phone: "", mobile: "", cnic: "", departmentId: "" }); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/25"><Plus className="w-4 h-4" /> Add User</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editUser ? "Edit User" : "Create New User"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{editUser ? "New Password (leave blank to keep)" : "Password"}</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editUser} />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(roleLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>CNIC</Label>
                    <Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <DepartmentSelect value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v === "none" ? "" : v })} showAll={false} />
                </div>
                <Button type="submit" className="w-full">{editUser ? "Update User" : "Create User"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search users..." className="pl-10" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-medium text-primary">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={roleColors[u.role] || "bg-gray-100"}>
                      <Shield className="w-3 h-3 mr-1" />
                      {roleLabels[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DepartmentBadge departmentId={u.departmentId} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.phone || u.mobile || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === "active" ? "default" : "secondary"} className={u.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(u)}><Edit className="w-4 h-4" /></Button>
                      {u.id !== currentUser?.id && (
                        <Button size="sm" variant="ghost" className={u.status === "active" ? "text-destructive" : "text-green-600"} onClick={() => toggleStatus(u)}>
                          {u.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
