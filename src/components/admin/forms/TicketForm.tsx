"use client";

import { useActionState, useRef } from "react";
import { saveTicketType } from "@/server/admin/tickets";
import { Fieldset, Input, Result, Select, Submit, TextArea } from "./Fields";

export interface TicketDefaults {
  id?: string; name?: string; description?: string | null; inclusions?: string[]; price?: string;
  admits_per_unit?: number; capacity?: number | null; max_per_order?: number | null;
  sales_start_local?: string; sales_end_local?: string; status?: string;
}

export function TicketForm({ eventId, defaults = {}, legend, submitLabel }: { eventId: string; defaults?: TicketDefaults; legend: string; submitLabel: string }) {
  const [state, action] = useActionState(saveTicketType, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const d = defaults;
  // A successful "add" clears the form for the next ticket.
  const key = !d.id && state.nonce ? state.nonce : "form";
  return (
    <form ref={formRef} key={key} action={action} noValidate className="space-y-4">
      <input type="hidden" name="event_id" value={eventId} />
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <Fieldset legend={legend}>
        <Result state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="name" label="Ticket name" required state={state} defaultValue={d.name} hint="e.g. General Admission, Early Bird, VIP, Table for 4" />
          <Input name="price" label="Price (USD)" required inputMode="decimal" state={state} defaultValue={d.price ?? ""} hint="Use 0 for a free ticket." />
          <Input name="capacity" label="Quantity available" inputMode="numeric" state={state} defaultValue={d.capacity} hint="Blank = no limit for this ticket (event capacity still applies)." />
          <Input name="max_per_order" label="Max per order" inputMode="numeric" state={state} defaultValue={d.max_per_order} hint="Blank = event default." />
          <Input name="admits_per_unit" label="Guests per ticket" inputMode="numeric" state={state} defaultValue={d.admits_per_unit ?? 1} hint="e.g. 4 for a table. Each guest gets their own QR ticket." />
          <Select name="status" label="Sales status" state={state} defaultValue={d.status ?? "active"}
            options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused (temporarily unavailable)" }, { value: "closed", label: "Closed" }]} />
          <Input name="sales_start_local" label="Sales open (optional)" type="datetime-local" state={state} defaultValue={d.sales_start_local} hint="Event timezone." />
          <Input name="sales_end_local" label="Sales close / deadline (optional)" type="datetime-local" state={state} defaultValue={d.sales_end_local} hint="Defaults to the event's registration deadline or end time." />
        </div>
        <TextArea name="description" label="Description (optional)" state={state} defaultValue={d.description} rows={2} />
        <TextArea name="inclusions" label="What's included (one per line, optional)" state={state} defaultValue={(d.inclusions ?? []).join("\n")} rows={3} />
        <Submit>{submitLabel}</Submit>
      </Fieldset>
    </form>
  );
}
