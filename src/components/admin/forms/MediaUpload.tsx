"use client";

import { useActionState } from "react";
import { uploadEventImage } from "@/server/admin/media";
import { Checkbox, Fieldset, Input, Result, Submit } from "./Fields";

export function MediaUpload({ eventId, hasCover }: { eventId: string; hasCover: boolean }) {
  const [state, action] = useActionState(uploadEventImage, { status: "idle" });
  return (
    <form action={action} className="space-y-4" key={state.status === "success" ? state.message : "f"}>
      <input type="hidden" name="event_id" value={eventId} />
      <Fieldset legend="Upload an image" description="JPG, PNG or WebP up to 5 MB. Images are resized and location data is removed automatically.">
        <Result state={state} />
        <div>
          <label htmlFor={`upload-${eventId}`} className="text-sm font-medium">Image file</label>
          <input id={`upload-${eventId}`} name="file" type="file" required accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-pp-black file:px-4 file:py-2.5 file:text-pp-cream" />
        </div>
        <Input name="alt_text" label="Image description (for screen readers)" state={state} hint="e.g. “Guests networking at a brunch table”" />
        <Checkbox name="make_cover" label="Use as the event's cover image" state={state} defaultChecked={!hasCover} />
        <Submit pendingLabel="Uploading…">Upload</Submit>
      </Fieldset>
    </form>
  );
}
