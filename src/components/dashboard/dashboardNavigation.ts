export type DashboardNavItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
  superAdminOnly?: boolean;
};

export const dashboardNavItems: DashboardNavItem[] = [
  { id: "overview", label: "Dashboard", icon: "D", href: "/dashboard" },
  { id: "subscription", label: "Subscription", icon: "S", href: "/dashboard/subscription" },
  { id: "payments", label: "Payments", icon: "P", href: "/dashboard/payments" },
  { id: "meetings", label: "Meetings", icon: "M", href: "/dashboard/meetings" },
  { id: "meeting-history", label: "Meeting History", icon: "H", href: "/dashboard/meeting-history" },
  { id: "chat", label: "Chat", icon: "C", href: "/dashboard/chat" },
  { id: "files", label: "File Transfer", icon: "F", href: "/dashboard/files" },
  { id: "features", label: "Features", icon: "A", href: "/dashboard/features" },
  { id: "avatar-analytics", label: "Avatar Analytics", icon: "V", href: "/dashboard/analytics/avatar" },
  { id: "profile", label: "Profile", icon: "U", href: "/dashboard/profile" },
  { id: "settings", label: "Settings", icon: "T", href: "/dashboard/settings" },
  { id: "security", label: "Security Logs", icon: "L", href: "/dashboard/security", superAdminOnly: true },
];
