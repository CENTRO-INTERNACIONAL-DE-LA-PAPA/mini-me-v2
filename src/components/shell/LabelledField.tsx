import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import type { ReactNode } from "react";

/** A control under its label, with an optional hint and error between them. */
export function LabelledField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        {hint && <FieldDescription>{hint}</FieldDescription>}
        {error && <FieldError>{error}</FieldError>}
      </FieldContent>
      {children}
    </Field>
  );
}
