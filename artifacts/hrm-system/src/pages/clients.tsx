import React, { useState } from "react";
import { useGetClients, useCreateClient } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Briefcase, Phone, Mail } from "lucide-react";

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
      }
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

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage firm clients and portfolios</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Add Client</Button>
          </DialogTrigger>
          <DialogContent className="border-border/50">
            <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name</label>
                <Input name="name" required className="bg-muted/50 border-0" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Person</label>
                  <Input name="contactPerson" required className="bg-muted/50 border-0" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Industry</label>
                  <Input name="industry" className="bg-muted/50 border-0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" name="email" required className="bg-muted/50 border-0" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone</label>
                  <Input name="phone" className="bg-muted/50 border-0" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>Save Client</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card border-border/50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <p className="text-muted-foreground">Loading clients...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground col-span-full">No clients found.</p>
        ) : (
          filtered.map(client => (
            <Card key={client.id} className="p-6 border-border/50 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-bold text-lg">
                  {client.name.charAt(0)}
                </div>
                <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className={client.status === 'active' ? 'bg-green-100 text-green-700' : ''}>
                  {client.status}
                </Badge>
              </div>
              <h3 className="font-display font-bold text-xl mb-1 truncate" title={client.name}>{client.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{client.industry || "General"}</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex items-center text-sm text-foreground/80">
                  <Briefcase className="w-4 h-4 mr-3 text-muted-foreground" /> {client.contactPerson}
                </div>
                <div className="flex items-center text-sm text-foreground/80">
                  <Mail className="w-4 h-4 mr-3 text-muted-foreground" /> {client.email}
                </div>
                {client.phone && (
                  <div className="flex items-center text-sm text-foreground/80">
                    <Phone className="w-4 h-4 mr-3 text-muted-foreground" /> {client.phone}
                  </div>
                )}
              </div>
              
              <div className="pt-4 border-t border-border/50 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="font-bold text-red-600">${client.outstandingBalance.toLocaleString()}</p>
                </div>
                <Button variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">View Details</Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
