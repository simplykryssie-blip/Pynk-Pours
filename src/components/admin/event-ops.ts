export type EventOperation = "publish" | "unpublish" | "cancel" | "complete" | "archive" | "unarchive" | "duplicate";

export const OP_DONE: Record<EventOperation, string> = {
  publish: "Event published — it's now live on the website.",
  unpublish: "Event unpublished — it's hidden from the website.",
  cancel: "Event marked as cancelled.",
  complete: "Event marked as completed.",
  archive: "Event archived — hidden from the website and active lists.",
  unarchive: "Event restored from the archive (as a draft).",
  duplicate: "Event duplicated.",
};

export const isEventOperation = (v: unknown): v is EventOperation => typeof v === "string" && v in OP_DONE;
