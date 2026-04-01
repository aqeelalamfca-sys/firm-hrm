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
  GraduationCap,
  Video,
  Settings,
  Zap,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { useDepartments } from "@/hooks/use-departments";

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
  { href: "/working-papers", label: "Working Papers", icon: BookOpen, section: "work" },
  { href: "/reports", label: "Reports", icon: BarChart3, section: "analytics", roles: ["super_admin", "partner", "hr_admin", "finance_officer", "manager"] },
  { href: "/applications", label: "Candidate Management", icon: GraduationCap, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/manage-meetings", label: "Meeting Management", icon: Video, section: "admin", roles: ["super_admin", "partner"] },
  { href: "/audit-trail", label: "Audit Trail", icon: ScrollText, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/user-management", label: "User Management", icon: UserCog, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/regulatory-updates", label: "Regulatory Updates", icon: Zap, section: "admin", roles: ["super_admin", "partner"] },
  { href: "/settings", label: "Settings", icon: Settings, section: "admin", roles: ["super_admin", "partner"] },
];

const sections: { key: string; label: string }[] = [
  { key: "main", label: "Main Menu" },
  { key: "finance", label: "Finance" },
  { key: "work", label: "Work" },
  { key: "analytics", label: "Analytics" },
  { key: "admin", label: "Administration" },
];

const NOTIF_TYPE_ICONS: Record<string, { icon: any; color: string }> = {
  task_assigned: { icon: Calendar, color: "text-blue-600 bg-blue-50" },
  task_due: { icon: Calendar, color: "text-amber-600 bg-amber-50" },
  task_overdue: { icon: Calendar, color: "text-red-600 bg-red-50" },
  task_status_changed: { icon: Check, color: "text-green-600 bg-green-50" },
  invoice_created: { icon: FileText, color: "text-violet-600 bg-violet-50" },
  invoice_status_changed: { icon: FileText, color: "text-emerald-600 bg-emerald-50" },
  leave_approved: { icon: Palmtree, color: "text-green-600 bg-green-50" },
  leave_rejected: { icon: Palmtree, color: "text-red-600 bg-red-50" },
  system: { icon: Bell, color: "text-gray-600 bg-gray-50" },
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, token } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const notifRef = React.useRef<HTMLDivElement>(null);
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();

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
        <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-7 h-7 rounded-lg" />
          Alam & Aulakh
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white hover:bg-sidebar-accent">
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 0 }}
        className={`text-sidebar-foreground flex flex-col transition-all duration-300 ease-in-out shrink-0 ${isSidebarOpen ? 'w-[260px]' : 'w-0'} md:block overflow-hidden`}
        style={{ background: 'linear-gradient(180deg, hsl(224 40% 14%) 0%, hsl(224 40% 10%) 100%)' }}
      >
        <div className="px-5 py-5 flex items-center gap-3 font-bold text-lg tracking-tight border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-6 h-6" />
          </div>
          <span className="text-white/95">Alam & Aulakh</span>
        </div>
        
        <div className="px-3 py-4 flex-1 overflow-y-auto scrollbar-thin space-y-0.5">
          {activeSections.map((section, idx) => (
            <React.Fragment key={section.key}>
              {idx > 0 && <div className="pt-4" />}
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em] mb-2 px-3">{section.label}</p>
              {filteredItems
                .filter((item) => item.section === section.key)
                .map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const Icon = item.icon;
                  
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className={`
                        flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 group cursor-pointer relative
                        ${isActive 
                          ? 'text-white font-medium' 
                          : 'text-white/55 hover:text-white/85 hover:bg-white/[0.06]'
                        }
                      `}
                      style={isActive ? { background: 'linear-gradient(135deg, hsl(217 78% 54%) 0%, hsl(217 78% 46%) 100%)', boxShadow: '0 2px 8px rgba(59,130,246,0.3), 0 1px 2px rgba(0,0,0,0.1)' } : undefined}
                      >
                        <Icon className={`w-[18px] h-[18px] ${isActive ? 'opacity-100' : 'opacity-50 group-hover:opacity-80 transition-opacity'}`} />
                        {item.label}
                        {isActive && <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white/70" />}
                      </div>
                    </Link>
                  );
                })}
            </React.Fragment>
          ))}
        </div>

        <div className="px-3 py-3 border-t border-white/[0.06]">
          <Link href="/profile" className="block">
            <div className="flex items-center gap-2.5 mb-2 px-2.5 cursor-pointer rounded-xl hover:bg-white/[0.06] py-2.5 transition-all duration-200">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, hsl(217 78% 54%) 0%, hsl(262 70% 55%) 100%)' }}>
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-white/90">{user.name}</p>
                <p className="text-[11px] text-white/50 truncate capitalize">{user.role.replace(/_/g, ' ')}</p>
              </div>
            </div>
          </Link>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-white/55 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 text-[13px] h-9 rounded-xl"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </motion.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-0">
        <header className="h-14 bg-card/80 backdrop-blur-xl border-b border-border/30 flex items-center justify-between px-6 sticky top-0 z-10 hidden md:flex shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-muted-foreground hover:text-foreground h-8 w-8" aria-label="Toggle sidebar">
              <Menu className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold text-[15px] text-foreground capitalize tracking-tight">
              {location === "/" ? "Dashboard" : location.split('/')[1].replace(/-/g, ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-3 relative" ref={notifRef}>
            <Select
              value={selectedDepartmentId ? String(selectedDepartmentId) : "all"}
              onValueChange={(v) => setSelectedDepartmentId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-[150px] h-8 text-xs border-border/50 bg-background/60">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setNotifOpen(!notifOpen)}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>

            <Link href="/profile">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full p-0 overflow-hidden border border-border/50 hover:border-primary/50 transition-colors"
              >
                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {user.name.charAt(0)}
                </div>
              </Button>
            </Link>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-[360px] bg-card border border-border/70 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
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
                <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Bell className="w-7 h-7 mx-auto mb-2 opacity-20" />
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const typeConfig = NOTIF_TYPE_ICONS[n.type] || NOTIF_TYPE_ICONS.system;
                      const NIcon = typeConfig.icon;
                      return (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 px-4 py-3 border-b border-border/20 hover:bg-muted/40 transition-colors cursor-pointer ${!n.isRead ? "bg-primary/[0.03]" : ""}`}
                          onClick={() => !n.isRead && markAsRead(n.id)}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${typeConfig.color}`}>
                            <NIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${!n.isRead ? "font-semibold" : ""}`}>{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                          </div>
                          {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-400">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
