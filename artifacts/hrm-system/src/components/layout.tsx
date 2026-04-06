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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
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
  { href: "/applications", label: "Candidate Mgmt", icon: GraduationCap, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/manage-meetings", label: "Meetings", icon: Video, section: "admin", roles: ["super_admin", "partner"] },
  { href: "/audit-trail", label: "Audit Trail", icon: ScrollText, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/user-management", label: "User Management", icon: UserCog, section: "admin", roles: ["super_admin", "partner", "hr_admin"] },
  { href: "/regulatory-updates", label: "Regulatory Updates", icon: Zap, section: "admin", roles: ["super_admin", "partner"] },
  { href: "/settings", label: "Settings", icon: Settings, section: "admin", roles: ["super_admin", "partner"] },
];

const sections: { key: string; label: string }[] = [
  { key: "main", label: "Main" },
  { key: "finance", label: "Finance" },
  { key: "work", label: "Work" },
  { key: "analytics", label: "Analytics" },
  { key: "admin", label: "Admin" },
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

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/employees": "Employees",
  "/attendance": "Attendance",
  "/leaves": "Leaves",
  "/payroll": "Payroll",
  "/clients": "Clients",
  "/invoices": "Invoices",
  "/credential-vault": "Credential Vault",
  "/task-scheduler": "Task Scheduler",
  "/engagements": "Engagements",
  "/documents": "Documents",
  "/working-papers": "Working Papers",
  "/reports": "Reports",
  "/applications": "Candidate Management",
  "/manage-meetings": "Meeting Management",
  "/audit-trail": "Audit Trail",
  "/user-management": "User Management",
  "/regulatory-updates": "Regulatory Updates",
  "/settings": "Settings",
  "/profile": "My Profile",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, token } = useAuth();
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const notifRef = React.useRef<HTMLDivElement>(null);
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();

  const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
      return next;
    });
  };

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

  const pageLabel = PAGE_LABELS[location] || location.split("/")[1]?.replace(/-/g, " ") || "Dashboard";

  const SidebarContent = ({ mini }: { mini?: boolean }) => (
    <>
      <div className={`flex items-center border-b border-white/[0.06] shrink-0 ${mini ? "px-3 py-4 justify-center" : "px-4 py-4 gap-3"}`}>
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-5 h-5" />
        </div>
        {!mini && <span className="font-bold text-[15px] text-white/95 tracking-tight">Alam & Aulakh</span>}
      </div>

      <div className={`py-3 flex-1 overflow-y-auto scrollbar-thin space-y-0.5 ${mini ? "px-2" : "px-2.5"}`}>
        <TooltipProvider delayDuration={0}>
          {activeSections.map((section, idx) => (
            <React.Fragment key={section.key}>
              {idx > 0 && <div className="pt-3" />}
              {!mini && (
                <p className="text-[9.5px] font-bold text-white/35 uppercase tracking-[0.14em] mb-1.5 px-2.5">{section.label}</p>
              )}
              {mini && idx > 0 && <div className="h-px bg-white/[0.07] mx-1 mb-2" />}
              {filteredItems
                .filter((item) => item.section === section.key)
                .map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const Icon = item.icon;
                  if (mini) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link href={item.href} className="block">
                            <div className={`
                              flex items-center justify-center w-10 h-10 rounded-xl mx-auto transition-all duration-150 cursor-pointer
                              ${isActive
                                ? "text-white"
                                : "text-white/45 hover:text-white/80 hover:bg-white/[0.07]"
                              }
                            `}
                            style={isActive ? { background: "linear-gradient(135deg, hsl(217 78% 54%) 0%, hsl(217 78% 44%) 100%)", boxShadow: "0 2px 8px rgba(59,130,246,0.35)" } : undefined}
                            >
                              <Icon className="w-[17px] h-[17px]" />
                            </div>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs font-medium">{item.label}</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className={`
                        flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-all duration-150 group cursor-pointer relative
                        ${isActive
                          ? "text-white font-medium"
                          : "text-white/50 hover:text-white/85 hover:bg-white/[0.06]"
                        }
                      `}
                      style={isActive ? { background: "linear-gradient(135deg, hsl(217 78% 54%) 0%, hsl(217 78% 44%) 100%)", boxShadow: "0 2px 8px rgba(59,130,246,0.28), 0 1px 2px rgba(0,0,0,0.1)" } : undefined}
                      >
                        <Icon className={`w-[16px] h-[16px] shrink-0 ${isActive ? "opacity-100" : "opacity-55 group-hover:opacity-80"}`} />
                        <span className="truncate">{item.label}</span>
                        {isActive && <div className="absolute right-2.5 w-1.5 h-1.5 rounded-full bg-white/60" />}
                      </div>
                    </Link>
                  );
                })}
            </React.Fragment>
          ))}
        </TooltipProvider>
      </div>

      <div className={`border-t border-white/[0.06] shrink-0 ${mini ? "p-2" : "p-2.5"}`}>
        {mini ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/profile" className="block mb-1.5">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full mx-auto text-sm font-bold text-white cursor-pointer hover:ring-2 hover:ring-white/20 transition-all"
                    style={{ background: "linear-gradient(135deg, hsl(217 78% 54%) 0%, hsl(262 70% 55%) 100%)" }}>
                    {user.name.charAt(0)}
                  </div>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">{user.name}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={logout} className="flex items-center justify-center w-10 h-10 rounded-xl mx-auto text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Sign out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <>
            <Link href="/profile" className="block mb-1">
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/[0.06] cursor-pointer transition-all">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(217 78% 54%) 0%, hsl(262 70% 55%) 100%)" }}>
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate text-white/90">{user.name}</p>
                  <p className="text-[10.5px] text-white/40 truncate capitalize">{user.role.replace(/_/g, " ")}</p>
                </div>
              </div>
            </Link>
            <button onClick={logout} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all text-[13px]">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
        style={{ background: "linear-gradient(180deg, hsl(224 40% 14%) 0%, hsl(224 40% 12%) 100%)" }}>
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-7 h-7 rounded-lg" />
          <span className="font-bold text-[15px] text-white">Alam & Aulakh</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} className="text-white hover:bg-white/10 h-9 w-9">
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed left-0 top-0 bottom-0 w-[260px] z-50 flex flex-col md:hidden"
            style={{ background: "linear-gradient(180deg, hsl(224 40% 14%) 0%, hsl(224 40% 10%) 100%)" }}
            onClick={() => setMobileOpen(false)}
          >
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 232 }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        className="hidden md:flex flex-col shrink-0 overflow-hidden relative"
        style={{ background: "linear-gradient(180deg, hsl(224 40% 14%) 0%, hsl(224 40% 10%) 100%)" }}
      >
        <SidebarContent mini={collapsed} />

        {/* Collapse toggle button */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-[68px] w-6 h-6 rounded-full bg-sidebar border border-sidebar-border flex items-center justify-center text-white/50 hover:text-white transition-all hover:scale-110 z-10 shadow-md"
          style={{ background: "hsl(224 40% 18%)", borderColor: "hsl(224 30% 22%)" }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </motion.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-0">
        <header className="h-12 bg-card/90 backdrop-blur-xl border-b border-border/30 flex items-center justify-between px-4 md:px-5 sticky top-0 z-10 shadow-sm shadow-black/[0.03]">
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="md:hidden text-muted-foreground h-8 w-8">
              <Menu className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold text-[14.5px] text-foreground tracking-tight capitalize">
              {pageLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2 relative" ref={notifRef}>
            <Select
              value={selectedDepartmentId ? String(selectedDepartmentId) : "all"}
              onValueChange={(v) => setSelectedDepartmentId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs border-border/40 bg-background/50 hidden sm:flex">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="relative h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              onClick={() => setNotifOpen(!notifOpen)}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            <Link href="/profile">
              <button className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-primary bg-primary/10 border border-primary/20 hover:border-primary/40 transition-all">
                {user.name.charAt(0)}
              </button>
            </Link>

            {/* Notification panel */}
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 w-[360px] bg-card border border-border/60 rounded-xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">{unreadCount} new</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" /> Mark all read
                        </button>
                      )}
                      <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground ml-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-sm">
                        <Bell className="w-7 h-7 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const typeConfig = NOTIF_TYPE_ICONS[n.type] || NOTIF_TYPE_ICONS.system;
                        const NIcon = typeConfig.icon;
                        return (
                          <div
                            key={n.id}
                            className={`flex items-start gap-3 px-4 py-3 border-b border-border/15 hover:bg-muted/40 transition-colors cursor-pointer ${!n.isRead ? "bg-primary/[0.025]" : ""}`}
                            onClick={() => !n.isRead && markAsRead(n.id)}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${typeConfig.color}`}>
                              <NIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[13px] leading-snug ${!n.isRead ? "font-semibold" : ""}`}>{n.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                            </div>
                            {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-5 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
