import React, { useState } from "react";
import { useGetEmployees, useCreateEmployee, Employee } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal, Building2, Phone, Mail, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const employeeSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  email: z.string().email("Invalid email"),
  department: z.string().min(2, "Department is required"),
  designation: z.string().min(2, "Designation is required"),
  joiningDate: z.string().min(1, "Date is required"),
  salary: z.coerce.number().min(1, "Salary must be positive"),
});

export default function Employees() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: employees = [], isLoading } = useGetEmployees({}, requestOpts);
  
  const createMutation = useCreateEmployee({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        setIsDialogOpen(false);
        toast({ title: "Employee created successfully" });
        form.reset();
      },
      onError: () => toast({ title: "Failed to create employee", variant: "destructive" })
    }
  });

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: "", lastName: "", email: "", department: "", designation: "", joiningDate: new Date().toISOString().split('T')[0], salary: 0
    }
  });

  const filteredEmployees = employees.filter(e => 
    `${e.firstName} ${e.lastName} ${e.department}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Employees</h1>
          <p className="text-muted-foreground mt-1">Manage firm staff and trainees</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-semibold shadow-md shadow-primary/20 rounded-xl px-6">
              <Plus className="w-4 h-4 mr-2" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] border-border/50">
            <DialogHeader>
              <DialogTitle className="text-xl font-display">Add New Employee</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => createMutation.mutate({ data: d }))} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} className="bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary/50" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} className="bg-muted/50 border-0" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} className="bg-muted/50 border-0" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="department" render={({ field }) => (
                    <FormItem><FormLabel>Department</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-muted/50 border-0"><SelectValue placeholder="Select dept" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Audit">Audit</SelectItem>
                          <SelectItem value="Tax">Tax</SelectItem>
                          <SelectItem value="Advisory">Advisory</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    <FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="designation" render={({ field }) => (
                    <FormItem><FormLabel>Designation</FormLabel><FormControl><Input {...field} className="bg-muted/50 border-0" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="joiningDate" render={({ field }) => (
                    <FormItem><FormLabel>Joining Date</FormLabel><FormControl><Input type="date" {...field} className="bg-muted/50 border-0" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="salary" render={({ field }) => (
                    <FormItem><FormLabel>Monthly Salary</FormLabel><FormControl><Input type="number" {...field} className="bg-muted/50 border-0" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending} className="shadow-md shadow-primary/20">
                    {createMutation.isPending ? "Saving..." : "Save Employee"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search employees..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border/50 h-10"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Role & Dept</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Loading employees...</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Users className="w-12 h-12 mb-4 opacity-20" />
                    <p>No employees found.</p>
                  </div>
                </td></tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground">{emp.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-foreground">{emp.designation}</p>
                      <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <Building2 className="w-3 h-3 mr-1" /> {emp.department}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-foreground mb-1">
                        <Mail className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> {emp.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={emp.status === 'active' ? 'default' : 'secondary'} 
                        className={emp.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0' : ''}>
                        {emp.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="hover:bg-muted"><MoreHorizontal className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
