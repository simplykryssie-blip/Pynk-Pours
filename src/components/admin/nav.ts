import type { StaffRole } from "@/server/auth/staff";

export interface AdminNavItem { href: string; label: string; roles: StaffRole[] }

/** Navigation is filtered by role; every page also enforces its own role check server-side. */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", roles: ["owner", "admin"] },
  { href: "/admin/events", label: "Events", roles: ["owner", "admin"] },
  { href: "/admin/registrations", label: "Registrations", roles: ["owner", "admin"] },
  { href: "/admin/check-in", label: "Check-in", roles: ["owner", "admin", "checkin"] },
  { href: "/admin/people", label: "People", roles: ["owner", "admin"] },
  { href: "/admin/forms", label: "Forms", roles: ["owner", "admin"] },
  { href: "/admin/inbox", label: "Inbox", roles: ["owner", "admin"] },
  { href: "/admin/policies", label: "Policies", roles: ["owner", "admin"] },
  { href: "/admin/activity", label: "Activity log", roles: ["owner", "admin"] },
  { href: "/admin/staff", label: "Staff", roles: ["owner"] },
  { href: "/admin/account", label: "My account", roles: ["owner", "admin", "checkin"] },
];

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  checkin: "Check-in staff",
};
