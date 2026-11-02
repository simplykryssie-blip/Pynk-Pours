import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { OpButton } from "@/components/admin/forms/OpButton";
import { SubmissionNotesForm, SubmissionStatusForm } from "@/components/admin/forms/FormSmall";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { answerText, STATUS_BADGE, statusLabel, type AnswerValue, type FormField } from "@/lib/forms";
import { personKey } from "@/lib/people";
import { deleteSubmission } from "@/server/admin/forms";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Response" };

type Sub = {
  id: string; name: string | null; email: string; status: string; created_at: string; staff_notes: string; data: Record<string, AnswerValue>;
  forms: { id: string; title: string; fields: FormField[] };
  form_files: { id: string; field_key: string; filename: string; size_bytes: number; content_type: string }[];
  form_status_updates: { status: string; message: string; notify: boolean; created_at: string }[];
};

const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function ResponsePage({ params }: PageProps<"/admin/forms/responses/[sid]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const { sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(sid)) notFound();
  const { data } = await staff.db.from("form_submissions")
    .select("id, name, email, status, created_at, staff_notes, data, forms(id, title, fields), form_files(id, field_key, filename, size_bytes, content_type), form_status_updates(status, message, notify, created_at)")
    .eq("id", sid).maybeSingle();
  const s = data as unknown as Sub | null;
  if (!s) notFound();
  const history = [...s.form_status_updates].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <AdminShell staff={staff}>
      <PageHeader title={s.name ?? s.email} back={{ href: `/admin/forms/${s.forms.id}/responses`, label: `Responses: ${s.forms.title}` }}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={STATUS_BADGE[s.status]} label={statusLabel(s.status)} />
          <a href={`mailto:${s.email}`} className="text-pp-pink-strong underline">{s.email}</a>
          <span>· Sent {formatEventDate(s.created_at, "America/Chicago")} {formatEventTime(s.created_at, "America/Chicago")}</span>
          <Link href={`/admin/people/p/${personKey(s.email)}`} className="underline">View in People</Link>
        </span>} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Answers" region>
          <dl className="space-y-4">
            {s.forms.fields.map((f) => {
              const files = s.form_files.filter((x) => x.field_key === f.key);
              return (
                <div key={f.key}>
                  <dt className="text-sm text-pp-black/65">{f.label}</dt>
                  {f.type === "file" ? (
                    files.length ? <dd><ul className="mt-1 space-y-1">{files.map((x) => (
                      <li key={x.id}><a href={`/admin/forms/files/${x.id}`} target="_blank" rel="noopener" className="text-pp-pink-strong underline">{x.filename}</a> <span className="text-xs text-pp-black/60">({size(x.size_bytes)})</span></li>
                    ))}</ul></dd> : <dd>—</dd>
                  ) : <dd className="whitespace-pre-wrap">{answerText(s.data[f.key]) || "—"}</dd>}
                </div>
              );
            })}
          </dl>
        </Card>
        <div className="space-y-6">
          <Card title="Status" region>
            <SubmissionStatusForm id={s.id} status={s.status} />
            {history.length > 0 && (
              <ol className="mt-5 space-y-2 border-t border-pp-black/10 pt-4 text-sm" aria-label="Status history">
                {history.map((h, i) => (
                  <li key={i}>
                    <strong>{statusLabel(h.status)}</strong> · {formatEventDate(h.created_at, "America/Chicago")}{h.notify ? " · emailed" : ""}
                    {h.message && <p className="whitespace-pre-wrap text-pp-black/75">{h.message}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Notes" region><SubmissionNotesForm id={s.id} notes={s.staff_notes} /></Card>
          <Card title="Delete response">
            <p className="mb-3 text-sm text-pp-black/70">Permanently removes the answers and files (e.g. if the person asks you to delete their information).</p>
            <OpButton action={deleteSubmission} fields={{ id: s.id }} label="Delete response" variant="danger" pendingLabel="Deleting…"
              confirm="Delete this response and its files permanently?" />
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
