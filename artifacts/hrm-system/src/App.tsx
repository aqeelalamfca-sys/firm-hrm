import React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DepartmentProvider } from "@/hooks/use-departments";
import { Layout } from "@/components/layout";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Employees from "@/pages/employees";
import Attendance from "@/pages/attendance";
import Leaves from "@/pages/leaves";
import Payroll from "@/pages/payroll";
import Clients from "@/pages/clients";
import Invoices from "@/pages/invoices";
import Reports from "@/pages/reports";
import Engagements from "@/pages/engagements";
import Documents from "@/pages/documents";
import AuditTrail from "@/pages/audit-trail";
import UserManagement from "@/pages/user-management";
import TaskScheduler from "@/pages/task-scheduler";
import CredentialVault from "@/pages/credential-vault";
import Profile from "@/pages/profile";
import TrainingApplication from "@/pages/training-application";
import Applications from "@/pages/applications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-lg w-full bg-card border border-border rounded-xl p-8 shadow-lg">
            <h2 className="text-xl font-bold text-destructive mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm mb-4">{this.state.error.message}</p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
              onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  React.useEffect(() => {
    if (!isLoading && !user) {
      navigate("/landing");
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/landing" component={Landing} />
      <Route path="/apply-training" component={TrainingApplication} />
      <Route path="/login" component={Login} />
      <Route path="/employees"><ProtectedRoute component={Employees} /></Route>
      <Route path="/attendance"><ProtectedRoute component={Attendance} /></Route>
      <Route path="/leaves"><ProtectedRoute component={Leaves} /></Route>
      <Route path="/payroll"><ProtectedRoute component={Payroll} /></Route>
      <Route path="/clients"><ProtectedRoute component={Clients} /></Route>
      <Route path="/invoices"><ProtectedRoute component={Invoices} /></Route>
      <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
      <Route path="/engagements"><ProtectedRoute component={Engagements} /></Route>
      <Route path="/documents"><ProtectedRoute component={Documents} /></Route>
      <Route path="/audit-trail"><ProtectedRoute component={AuditTrail} /></Route>
      <Route path="/user-management"><ProtectedRoute component={UserManagement} /></Route>
      <Route path="/task-scheduler"><ProtectedRoute component={TaskScheduler} /></Route>
      <Route path="/credential-vault"><ProtectedRoute component={CredentialVault} /></Route>
      <Route path="/profile"><ProtectedRoute component={Profile} /></Route>
      <Route path="/applications"><ProtectedRoute component={Applications} /></Route>
      <Route path="/"><ProtectedRoute component={Dashboard} /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <DepartmentProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </DepartmentProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
