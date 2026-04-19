import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * Label + control pair with consistent spacing. The label's `htmlFor` must
 * match the control's `id`. Keep one Field per form field.
 */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
