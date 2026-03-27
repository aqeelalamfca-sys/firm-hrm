import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  User, Mail, Phone, Smartphone, CreditCard, Shield, Calendar,
  Pencil, Lock, Save, Camera
} from "lucide-react";

export default function Profile() {
  const { token, user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [form, setForm] = useState({
    name: "", phone: "", mobile: "", cnic: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "", newPassword: "", confirmPassword: "",
  });

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        phone: user.phone || "",
        mobile: user.mobile || "",
        cnic: user.cnic || "",
      });
    }
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/users/profile", {
      method: "PUT", headers,
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setEditing(false);
      if (refreshUser) refreshUser();
      toast({ title: "Profile updated successfully" });
    } else {
      toast({ title: "Failed to update profile", variant: "destructive" });
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    const res = await fetch("/api/users/change-password", {
      method: "PUT", headers,
      body: JSON.stringify({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }),
    });
    if (res.ok) {
      setPasswordDialogOpen(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed successfully" });
    } else {
      const data = await res.json();
      toast({ title: data.error || "Failed to change password", variant: "destructive" });
    }
  }

  if (!user) return null;

  const roleColors: Record<string, string> = {
    super_admin: "bg-red-100 text-red-700",
    partner: "bg-violet-100 text-violet-700",
    hr_admin: "bg-blue-100 text-blue-700",
    finance_officer: "bg-emerald-100 text-emerald-700",
    manager: "bg-amber-100 text-amber-700",
    employee: "bg-slate-100 text-slate-700",
    trainee: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-3">
          <User className="w-7 h-7 text-primary" /> My Profile
        </h1>
        <p className="text-muted-foreground mt-1">View and manage your account information</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold">
                {user.profilePicture ? (
                  <img src={user.profilePicture} alt={user.name} className="w-24 h-24 rounded-2xl object-cover" />
                ) : (
                  user.name?.charAt(0)?.toUpperCase() || "U"
                )}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold">{user.name}</h2>
                <Badge className={`text-xs ${roleColors[user.role] || "bg-gray-100"}`}>
                  {user.role?.replace("_", " ").toUpperCase()}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm flex items-center gap-2">
                <Mail className="w-4 h-4" /> {user.email}
              </p>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(!editing)}>
                  <Pencil className="w-3.5 h-3.5" /> {editing ? "Cancel" : "Edit Profile"}
                </Button>
                <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5"><Lock className="w-3.5 h-3.5" /> Change Password</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Change Password</DialogTitle>
                      <DialogDescription>Enter your current password and choose a new one</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Current Password</Label>
                        <Input type="password" required value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>New Password</Label>
                        <Input type="password" required minLength={6} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Confirm New Password</Label>
                        <Input type="password" required value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                      </div>
                      <Button type="submit" className="w-full">Update Password</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Profile</CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CNIC</Label>
                  <Input placeholder="12345-1234567-1" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Phone (Office)</Label>
                  <Input placeholder="+92-42-12345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input placeholder="+92-300-1234567" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="gap-1.5"><Save className="w-4 h-4" /> Save Changes</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InfoField icon={User} label="Full Name" value={user.name} />
              <InfoField icon={Mail} label="Email" value={user.email} />
              <InfoField icon={Phone} label="Phone" value={user.phone || "Not set"} />
              <InfoField icon={Smartphone} label="Mobile" value={user.mobile || "Not set"} />
              <InfoField icon={CreditCard} label="CNIC" value={user.cnic || "Not set"} />
              <InfoField icon={Shield} label="Role" value={user.role?.replace("_", " ").toUpperCase()} />
              <InfoField icon={Calendar} label="Member Since" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" }) : "—"} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Security</CardTitle>
          <CardDescription>Manage your account security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">Last changed: Unknown</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPasswordDialogOpen(true)}>Change</Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Account Status</p>
                <p className="text-xs text-muted-foreground">Your account is active</p>
              </div>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
