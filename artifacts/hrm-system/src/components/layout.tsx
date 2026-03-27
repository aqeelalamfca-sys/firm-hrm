import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Users, 
  CalendarDays, 
  Palmtree, 
  Banknote, 
  Briefcase, 
  FileText, 
  BarChart3, 
  LogOut,
  Menu,
  Bell,
  Shield,
  FolderOpen,
  ClipboardList,
  ScrollText,
  UserCog,
  Calendar,
  KeyRound,
  User,
  Check,
  CheckCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  section: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, section: "main" },
  { href: "/employees", label: "Employees", icon: Users, section: "main" },
  { href: "/attendance", label: "Attendance", icon: CalendarDays, section: "main" },
  { href: "/leaves", label: "Leaves", icon: Palmtree, section: "main" },
  { href: "/payroll", label: "Payroll", icon: Banknote, section: "finance", roles: ["super_admin", "partner", "hr_admin", "finance_officer", "manager"] },
  { href: "/clients", label: "Clients", icon: Briefcase, section: "finance" },
  { href: "/invoices", label: "Invoices", icon: FileText, section: "finance", roles: ["super_admin", "partner", "finance_officer", "manager"] },
  { href: "/credential-vault", label: "Credential Vault", icon: KeyRound, section: "finance", roles: ["super_admin", "partner"] },
  { href: "/task-scheduler", label: "Task Scheduler", icon: Calendar, section: "work" },
  { href: "/engagements", label: "Engagements", icon: ClipboardList, section: "work" },
  { href: "/documents", label: "Documents", icon: FolderOpen, section: "work" },
  { href: "/reports", label: "Reports", icon: BarChart3, section: "analytics", roles: ["super_admin", "partner", "hr_admin", "finance_officer", "manager"] },
  { href: "/audit-trail", label: "Audit Trail", icon: ScrollText, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/user-management", label: "User Management", icon: UserCog, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
];

const sections: { key: string; label: string }[] = [
  { key: "main", label: "Main Menu" },
  { key: "finance", label: "Finance" },
  { key: "work", label: "Work" },
  { key: "analytics", label: "Analytics" },
  { key: "admin", label: "Administration" },
];

const NOTIF_TYPE_ICONS: Record<string, { icon: any; color: string }> = {
  task_assigned: { icon: Calendar, color: "text-blue-600 bg-blue-100" },
  task_due: { icon: Calendar, color: "text-amber-600 bg-amber-100" },
  task_overdue: { icon: Calendar, color: "text-red-600 bg-red-100" },
  task_status_changed: { icon: Check, color: "text-green-600 bg-green-100" },
  invoice_created: { icon: FileText, color: "text-violet-600 bg-violet-100" },
  invoice_status_changed: { icon: FileText, color: "text-emerald-600 bg-emerald-100" },
  leave_approved: { icon: Palmtree, color: "text-green-600 bg-green-100" },
  leave_rejected: { icon: Palmtree, color: "text-red-600 bg-red-100" },
  system: { icon: Bell, color: "text-gray-600 bg-gray-100" },
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, token } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const notifRef = React.useRef<HTMLDivElement>(null);

  const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  React.useEffect(() => {
    if (!token) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [token]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications?limit=20", { headers });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  }

  async function markAsRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT", headers });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PUT", headers });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  if (!user) return <>{children}</>;

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user.role);
  });

  const activeSections = sections.filter((s) =>
    filteredItems.some((item) => item.section === s.key)
  );

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      <div className="md:hidden flex items-center justify-between p-4 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 font-display font-bold text-xl">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-8 h-8 rounded-md" />
          Vertex HR
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white hover:bg-sidebar-accent">
          <Menu className="w-6 h-6" />
        </Button>
      </div>

      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 0 }}
        className={`bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 ease-in-out shrink-0 ${isSidebarOpen ? 'w-[260px]' : 'w-0'} md:block overflow-hidden`}
      >
        <div className="p-6 flex items-center gap-3 font-display font-bold text-2xl tracking-wide border-b border-sidebar-border">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-8 h-8 rounded-md shadow-sm" />
          Vertex HR
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto space-y-1">
          {activeSections.map((section, idx) => (
            <React.Fragment key={section.key}>
              {idx > 0 && <div className="pt-3" />}
              <p className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">{section.label}</p>
              {filteredItems
                .filter((item) => item.section === section.key)
                .map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const Icon = item.icon;
                  
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer
                        ${isActive 
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-md shadow-black/10' 
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }
                      `}>
                        <Icon className={`w-5 h-5 ${isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100 transition-opacity'}`} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
            </React.Fragment>
          ))}
        </div>

        <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/30">
          <Link href="/profile" className="block">
            <div className="flex items-center gap-3 mb-3 px-2 cursor-pointer rounded-lg hover:bg-sidebar-accent/50 py-2 transition-colors">
              <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center font-bold text-white shadow-inner">
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-white">{user.name}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user.role.replace(/_/g, ' ')}</p>
              </div>
            </div>
          </Link>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </motion.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-0">
        <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-8 sticky top-0 z-10 hidden md:flex">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="font-display font-semibold text-lg text-foreground capitalize">
              {location === "/" ? "Dashboard" : location.split('/')[1].replace(/-/g, ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-4 relative" ref={notifRef}>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full relative border-border/50 bg-background/50 shadow-sm"
              onClick={() => setNotifOpen(!notifOpen)}
            >
              <Bell className="w-4 h-4 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-[380px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> Mark all read
                      </button>
                    )}
                    <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const typeConfig = NOTIF_TYPE_ICONS[n.type] || NOTIF_TYPE_ICONS.system;
                      const NIcon = typeConfig.icon;
                      return (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 px-4 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer ${!n.isRead ? "bg-primary/5" : ""}`}
                          onClick={() => !n.isRead && markAsRead(n.id)}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${typeConfig.color}`}>
                            <NIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.isRead ? "font-semibold" : ""}`}>{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                          </div>
                          {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
