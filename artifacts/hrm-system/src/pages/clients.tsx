import React, { useState } from "react";
import { useGetClients, useCreateClient } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Briefcase, Phone, Mail, Building2, IndianRupee, TrendingDown } from "lucide-react";

const CLIENT_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500',
];

export default function Clients() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: clients = [], isLoading } = useGetClients({}, requestOpts);

  const createMutation = useCreateClient({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
        setIsDialogOpen(false);
        toast({ title: "Client added successfully" });
      },
      onError: () => toast({ title: "Failed to add client", variant: "destructive" })
    }
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        name: fd.get('name') as string,
        contactPerson: fd.get('contactPerson') as string,
        email: fd.get('email') as string,
        phone: fd.get('phone') as string,
        industry: fd.get('industry') as string,
      }
    });
  };

  const filtered = clients.filter((c: any) =>
    `${c.name} ${c.contactPerson} ${c.industry}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstanding = clients.reduce((s: number, c: any) => s + (c.outstandingBalance || 0), 0);
  const activeCount = clients.filter((c: any) => c.status === 'active').length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your firm's client portfolio</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20 gap-2">
              <Plus className="w-4 h-4" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border/60 sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name *</label>
                <Input name="name" required className="bg-muted/40 border-border/50" placeholder="ABC Pvt. Ltd." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Person *</label>
                  <Input name="contactPerson" required className="bg-muted/40 border-border/50" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Industry</label>
                  <Input name="industry" className="bg-muted/40 border-border/50" placeholder="Manufacturing" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email *</label>
                  <Input type="email" name="email" required className="bg-muted/40 border-border/50" placeholder="contact@company.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone</label>
                  <Input name="phone" className="bg-muted/40 border-border/50" placeholder="+91 98765 43210" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} className="shadow-md shadow-primary/20">
                  {createMutation.isPending ? "Saving..." : "Save Client"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats bar */}
      {clients.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center gap-3">
            <Building2 className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-xs text-blue-600 font-medium">Total Clients</p>
              <p className="text-lg font-display font-bold text-blue-700">{clients.length}</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 flex items-center gap-3">
            <Briefcase className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-xs text-emerald-600 font-medium">Active Clients</p>
              <p className="text-lg font-display font-bold text-emerald-700">{activeCount}</p>
            </div>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-xs text-red-600 font-medium">Total Outstanding</p>
              <p className="text-lg font-display font-bold text-red-700">₹{totalOutstanding.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-card border-border/60 shadow-sm"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 opacity-20 mx-auto mb-3" />
          <p className="font-medium">No clients found</p>
          <p className="text-sm mt-1 opacity-70">Try a different search or add a new client</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((client: any, index: number) => (
            <Card key={client.id} className="border-border/60 shadow-sm hover:shadow-lg transition-all duration-200 group overflow-hidden">
              <div className={`h-1.5 w-full ${CLIENT_COLORS[index % CLIENT_COLORS.length]}`} />
              <CardContent className="p-5">
                {/* Top Row */}
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold text-lg shadow-md ${CLIENT_COLORS[index % CLIENT_COLORS.length]}`}>
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <Badge
                    variant="outline"
                    className={client.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 text-[11px]'
                    }
                  >
                    {client.status}
                  </Badge>
                </div>

                {/* Name & Industry */}
                <h3 className="font-display font-bold text-lg text-foreground mb-0.5 truncate" title={client.name}>
                  {client.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">{client.industry || "General Services"}</p>

                {/* Contact Details */}
                <div className="space-y-2 mb-5">
                  <div className="flex items-center gap-2.5 text-sm text-foreground/80">
                    <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{client.contactPerson}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-foreground/80">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-xs">{client.email}</span>
                  </div>
                  {client.phone && (
                    <div className="flex items-center gap-2.5 text-sm text-foreground/80">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="pt-4 border-t border-border/50 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Outstanding</p>
                    <p className={`font-bold text-sm ${client.outstandingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {client.outstandingBalance > 0 ? `₹${client.outstandingBalance.toLocaleString('en-IN')}` : 'Cleared ✓'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{client.clientCode}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
