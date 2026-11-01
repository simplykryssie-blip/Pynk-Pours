import type { FieldErrors } from "@/lib/validation";

export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echo back safe values so the form keeps user input after an error. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = { status: "idle" };
