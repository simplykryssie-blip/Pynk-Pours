"use client";

import { useActionState } from "react";
import { EVENT_TIMEZONES } from "@/lib/zoned-time";
import type { ActionState } from "@/server/admin/common";
import { Checkbox, Fieldset, Input, Result, Select, Submit, TextArea } from "./Fields";
import { ListEditor } from "./ListEditor";

export interface EventFormDefaults {
  id?: string;
  title?: string; slug?: string; category_label?: string | null; short_description?: string | null; description?: string | null;
  timezone?: string | null; starts_local?: string; ends_local?: string; registration_closes_local?: string;
  is_online?: boolean; venue_name?: string | null; venue_address?: string | null; venue_notes?: string | null;
  dress_code?: string | null; parking_info?: string | null; accessibility_info?: string | null; refund_policy?: string | null;
  min_age?: number | null; capacity?: number | null; max_tickets_per_order?: number | null; show_remaining_count?: boolean;
  registration_mode?: string; sold_out_behavior?: string; is_featured?: boolean;
  agenda?: Record<string, string>[]; faqs?: Record<string, string>[]; speakers?: Record<string, string>[];
}

export function EventForm({ action, defaults, submitLabel }: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  defaults: EventFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" });
  const d = defaults;
  return (
    <form action={formAction} noValidate className="space-y-6">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <Result state={state} />

      <Fieldset legend="Basics">
        <Input name="title" label="Event title" required state={state} defaultValue={d.title} maxLength={160} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="slug" label="Web address" state={state} defaultValue={d.slug} hint="pynkpours.com/events/… — leave blank to create it from the title." />
          <Input name="category_label" label="Label (optional)" state={state} defaultValue={d.category_label} hint='e.g. "Signature Experience"' />
        </div>
        <TextArea name="short_description" label="Short description" state={state} defaultValue={d.short_description} rows={2} hint="Shown on event cards. Required before publishing." />
        <TextArea name="description" label="Full description" state={state} defaultValue={d.description} rows={6} hint="Separate paragraphs with a blank line." />
      </Fieldset>

      <Fieldset legend="Date & time" description="Enter times as they'll be on the clock at the event. Leave dates blank for a “coming soon — date to be announced” event.">
        <Select name="timezone" label="Event timezone" required state={state} defaultValue={d.timezone ?? "America/Chicago"} options={EVENT_TIMEZONES} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="starts_local" label="Starts" type="datetime-local" state={state} defaultValue={d.starts_local} />
          <Input name="ends_local" label="Ends" type="datetime-local" state={state} defaultValue={d.ends_local} />
        </div>
        <Input name="registration_closes_local" label="Registration deadline (optional)" type="datetime-local" state={state} defaultValue={d.registration_closes_local}
          hint="Online registration for every ticket type closes at this time. Individual tickets can close earlier." />
      </Fieldset>

      <Fieldset legend="Location">
        <Checkbox name="is_online" label="This is an online event" state={state} defaultChecked={d.is_online} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="venue_name" label="Venue name" state={state} defaultValue={d.venue_name} />
          <Input name="venue_address" label="Venue address" state={state} defaultValue={d.venue_address} />
        </div>
        <TextArea name="venue_notes" label="Venue notes" state={state} defaultValue={d.venue_notes} rows={2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea name="parking_info" label="Parking" state={state} defaultValue={d.parking_info} rows={2} />
          <TextArea name="accessibility_info" label="Accessibility" state={state} defaultValue={d.accessibility_info} rows={2} />
        </div>
      </Fieldset>

      <Fieldset legend="Registration">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="registration_mode" label="Registration status" state={state} defaultValue={d.registration_mode ?? "coming_soon"}
            options={[{ value: "coming_soon", label: "Coming soon — collect “get notified” sign-ups" }, { value: "tickets", label: "Tickets — sell tickets" }, { value: "closed", label: "Closed" }]} />
          <Select name="sold_out_behavior" label="When sold out" state={state} defaultValue={d.sold_out_behavior ?? "sold_out"}
            options={[{ value: "sold_out", label: "Show “Sold out”" }, { value: "waitlist", label: "Offer a waitlist" }]} />
          <Input name="capacity" label="Total capacity (optional)" inputMode="numeric" state={state} defaultValue={d.capacity} hint="Overall guest limit across all ticket types. Blank = no overall limit." />
          <Input name="max_tickets_per_order" label="Max tickets per order" inputMode="numeric" state={state} defaultValue={d.max_tickets_per_order ?? 10} />
          <Input name="min_age" label="Minimum age (optional)" inputMode="numeric" state={state} defaultValue={d.min_age} />
          <Input name="dress_code" label="Dress code (optional)" state={state} defaultValue={d.dress_code} />
        </div>
        <Checkbox name="show_remaining_count" label="Show “Only N left” when tickets run low" state={state} defaultChecked={d.show_remaining_count} />
        <Checkbox name="is_featured" label="Feature this event on the home page" state={state} defaultChecked={d.is_featured} />
        <TextArea name="refund_policy" label="Refund policy for this event" state={state} defaultValue={d.refund_policy} rows={2} />
      </Fieldset>

      <Fieldset legend="Schedule, speakers & FAQs">
        <ListEditor name="agenda" label="Schedule" addLabel="Add schedule item" initial={d.agenda ?? []} error={state.fieldErrors?.agenda}
          fields={[{ key: "time", label: "Time", placeholder: "11:00 AM" }, { key: "title", label: "What's happening", required: true }, { key: "description", label: "Details", multiline: true }]} />
        <ListEditor name="speakers" label="Speakers / special guests" addLabel="Add speaker" initial={d.speakers ?? []} error={state.fieldErrors?.speakers}
          fields={[{ key: "name", label: "Name", required: true }, { key: "title", label: "Title" }, { key: "bio", label: "Short bio", multiline: true }]} />
        <ListEditor name="faqs" label="Frequently asked questions" addLabel="Add question" initial={d.faqs ?? []} error={state.fieldErrors?.faqs}
          fields={[{ key: "question", label: "Question", required: true }, { key: "answer", label: "Answer", required: true, multiline: true }]} />
      </Fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-pp-black/10 bg-[#f6f2ef]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-sm">
        <Submit>{submitLabel}</Submit>
        {state.status === "error" && <span className="text-sm text-[#b3261e]">{state.message}</span>}
        {state.status === "success" && <span className="text-sm text-[#14532d]">{state.message}</span>}
      </div>
    </form>
  );
}
