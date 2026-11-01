import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, PageHeader, TableWrap } from "@/components/admin/ui";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Activity log" };

const LABELS: Record<string, string> = {
  "insert:events": "Created event", "update:events": "Edited event", "delete:events": "Deleted draft event",
  "insert:ticket_types": "Added ticket", "update:ticket_types": "Edited ticket", "delete:ticket_types": "Deleted ticket",
  "insert:event_media": "Uploaded image", "update:event_media": "Edited image", "delete:event_media": "Deleted image",
  "insert:admin_profiles": "Added staff", "update:admin_profiles": "Changed staff access",
  "event.duplicate": "Duplicated event", "attendee.update": "Edited attendee", "export.attendees": "Exported attendees",
  "export.sales": "Exported sales", "order.paid": "Order paid", "order.refund": "Refund", "ticket.undo_check_in": "Undid check-in",
  "ticket.cancel": "Cancelled ticket", "ticket.resend": "Resent ticket", "ticket.rotate_credential": "Reissued ticket QR",
};

export default async function ActivityPage() {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ data: rows }, { data: people }] = await Promise.all([
    staff.db.from("audit_log").select("id, occurred_at, actor_user_id, action, entity_type, entity_id, after_data, before_data").order("id", { ascending: false }).limit(150),
    staff.db.rpc("admin_events_overview"),
  ]);
  const titles = new Map(((people ?? []) as { id: string; title: string }[]).map((e) => [e.id, e.title]));
  const { data: profiles } = await staff.db.from("admin_profiles").select("user_id, display_name");
  const names = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name]));
  type Row = { id: number; occurred_at: string; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; after_data: Record<string, unknown> | null; before_data: Record<string, unknown> | null };
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Activity log" subtitle="A permanent record of changes and exports. Entries can't be edited or deleted." />
      <Card>
        {(rows ?? []).length === 0 ? <EmptyState title="No activity yet" /> : (
          <TableWrap label="Activity">
            <thead><tr><th>When (Central)</th><th>Who</th><th>What</th><th>Item</th></tr></thead>
            <tbody>
              {((rows ?? []) as Row[]).map((r) => {
                const label = LABELS[`${r.action}:${r.entity_type}`] ?? LABELS[r.action] ?? `${r.action} ${r.entity_type}`;
                const data = r.after_data ?? r.before_data;
                const item = (data?.title as string) ?? (data?.name as string) ?? (data?.display_name as string) ?? (r.entity_id ? titles.get(r.entity_id) : undefined) ?? "";
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatEventDate(r.occurred_at, "America/Chicago")} {formatEventTime(r.occurred_at, "America/Chicago")}</td>
                    <td>{r.actor_user_id ? names.get(r.actor_user_id) ?? "Staff" : "System"}</td>
                    <td>{label}</td>
                    <td className="max-w-xs truncate">{item}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </AdminShell>
  );
}
