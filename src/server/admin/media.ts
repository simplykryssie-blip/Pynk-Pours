"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import sharp, { type OutputInfo } from "sharp";
import { staffForAction } from "../auth/staff";
import { dbMessage, isUuid, type ActionState } from "./common";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "event-media";

/**
 * Upload an event image. The file is decoded and RE-ENCODED on the server
 * (sharp): this proves it's a real image, strips EXIF/GPS metadata, fixes
 * orientation, and caps the size. Stored as WebP under events/<eventId>/.
 */
export async function uploadEventImage(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const eventId = form.get("event_id");
  const file = form.get("file");
  const alt = String(form.get("alt_text") ?? "").trim().slice(0, 300) || null;
  const makeCover = form.get("make_cover") === "on";
  if (!isUuid(eventId)) return { status: "error", message: "Missing event." };
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose an image to upload." };
  if (file.size > MAX_BYTES) return { status: "error", message: "Images must be 5 MB or smaller." };
  if (!ALLOWED.includes(file.type)) return { status: "error", message: "Upload a JPG, PNG or WebP image." };

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { status: "error", message: "That file couldn't be read as an image." };
  }

  const path = `events/${eventId}/${randomUUID()}.webp`;
  const { error: upErr } = await staff.db.storage.from(BUCKET).upload(path, output.data, {
    contentType: "image/webp", cacheControl: "31536000", upsert: false,
  });
  if (upErr) {
    console.error("[media] upload failed", upErr.message);
    return { status: "error", message: "Upload failed. Please try again." };
  }
  const { count } = await staff.db.from("event_media").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const { error } = await staff.db.from("event_media").insert({
    event_id: eventId, storage_path: path, alt_text: alt, width: output.info.width, height: output.info.height,
    bytes: output.info.size, sort_order: count ?? 0, created_by: staff.user.id,
  });
  if (error) {
    await staff.db.storage.from(BUCKET).remove([path]);
    return { status: "error", message: dbMessage(error) };
  }
  if (makeCover) {
    await staff.db.from("events").update({ cover_image_path: path, cover_image_alt: alt }).eq("id", eventId);
  }
  revalidatePath(`/admin/events/${eventId}`, "layout");
  revalidatePath("/", "layout");
  return { status: "success", message: makeCover ? "Image uploaded and set as the cover." : "Image uploaded." };
}

export async function mediaOperation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const eventId = form.get("event_id");
  const mediaId = form.get("id");
  const op = form.get("op");
  if (!isUuid(eventId) || !isUuid(mediaId)) return { status: "error", message: "Invalid request." };
  const { data: media, error: mErr } = await staff.db.from("event_media").select("*").eq("id", mediaId).eq("event_id", eventId).single();
  if (mErr) return { status: "error", message: dbMessage(mErr) };

  let message = "Saved.";
  if (op === "cover") {
    const { error } = await staff.db.from("events").update({ cover_image_path: media.storage_path, cover_image_alt: media.alt_text }).eq("id", eventId);
    if (error) return { status: "error", message: dbMessage(error) };
    message = "Cover image updated.";
  } else if (op === "gallery") {
    const { error } = await staff.db.from("event_media").update({ show_in_gallery: !media.show_in_gallery }).eq("id", mediaId);
    if (error) return { status: "error", message: dbMessage(error) };
    message = media.show_in_gallery ? "Removed from the public gallery." : "Added to the public gallery.";
  } else if (op === "alt") {
    const alt = String(form.get("alt_text") ?? "").trim().slice(0, 300) || null;
    const { error } = await staff.db.from("event_media").update({ alt_text: alt }).eq("id", mediaId);
    if (error) return { status: "error", message: dbMessage(error) };
    await staff.db.from("events").update({ cover_image_alt: alt }).eq("id", eventId).eq("cover_image_path", media.storage_path);
    message = "Description saved.";
  } else if (op === "delete") {
    await staff.db.from("events").update({ cover_image_path: null, cover_image_alt: null }).eq("id", eventId).eq("cover_image_path", media.storage_path);
    const { error } = await staff.db.from("event_media").delete().eq("id", mediaId);
    if (error) return { status: "error", message: dbMessage(error) };
    await staff.db.storage.from("event-media").remove([media.storage_path]);
    message = "Image deleted.";
  } else {
    return { status: "error", message: "Invalid request." };
  }
  revalidatePath(`/admin/events/${eventId}`, "layout");
  revalidatePath("/", "layout");
  return { status: "success", message };
}
