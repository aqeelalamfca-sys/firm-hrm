import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCog, Shield, Edit, Search } from "lucide-react";
import { useDepartments } from "@/hooks/use-departments";
import { DepartmentBadge } from "@/components/department-badge";
import { DepartmentSelect } from "@/components/department-select";

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
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditUser(null); setForm({ name: "", email: "", password: "", role: "employee", phone: "", mobile: "", cnic: "" }); } }}>
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
