"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Inline "add" form for name-only entities. Controlled input so the field
 * resets after submit — uncontrolled defaults would persist across revalidation.
 */
export function NewNameForm({
  action,
  placeholder,
  submitLabel = "Add",
}: {
  action: (formData: FormData) => Promise<void>;
  placeholder: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setName("");
      }}
      className="flex items-center gap-2"
    >
      <Input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        maxLength={100}
        required
        className="flex-1"
      />
      <Button type="submit" size="sm" disabled={trimmed.length === 0}>
        {submitLabel}
      </Button>
    </form>
  );
}
