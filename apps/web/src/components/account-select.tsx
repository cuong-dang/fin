import { listAccountGroups } from "@/lib/endpoints";

import type { Account } from "@fin/schemas";
import { Select } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Account picker that renders Mantine `Select` with options grouped by
 * `accountGroupId`. The caller pre-filters the `accounts` pool (CASA
 * only, CC only, exclude-current, etc.); this component only handles
 * the UI presentation — fetching the account-group names and building
 * the grouped data.
 *
 * The cached `["accountGroups"]` query is shared across instances —
 * callers don't need to wire up an extra `useQuery`.
 *
 * `allowNone` toggles Mantine's built-in clear button (the X). When
 * cleared, the parent receives "" (empty string) as the new value.
 * Required pickers omit it — there's no clear affordance.
 *
 * Deliberately not searchable: search-as-you-type would pop the mobile
 * soft keyboard on tap, which eats half the screen. Account lists are
 * small enough to scroll.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  label,
  description,
  placeholder = "Select…",
  required = false,
  allowNone = false,
  disabled = false,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  /** Surface Mantine's clear (X) button. Use for optional fields where
   *  the parent should accept "" when cleared. */
  allowNone?: boolean;
  disabled?: boolean;
}) {
  const groupsQ = useQuery({
    queryKey: ["accountGroups"],
    queryFn: listAccountGroups,
  });
  const data = useMemo(() => {
    const groupsList = groupsQ.data;
    if (!groupsList) return [];
    // Walk groups (the source of truth for naming + ordering) and slot
    // accounts into them. Empty groups — no accounts in this picker's
    // filtered pool — are skipped so the dropdown isn't littered with
    // bare headers.
    return groupsList
      .map((g) => ({
        group: g.name,
        items: accounts
          .filter((a) => a.accountGroupId === g.id)
          .map((a) => ({
            value: a.id,
            label: `${a.name} (${a.currency})`,
          })),
      }))
      .filter((g) => g.items.length > 0);
  }, [accounts, groupsQ.data]);

  return (
    <Select
      clearable={allowNone}
      data={data}
      description={description}
      disabled={disabled}
      label={label}
      placeholder={placeholder}
      required={required}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
    />
  );
}
