import type { Account } from "@fin/schemas";
import { Select } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { listAccountGroups } from "@/lib/endpoints";

/**
 * Account picker that renders Mantine `Select` with options grouped by
 * `accountGroupId`. The caller pre-filters the `accounts` pool (CASA
 * only, CC only, exclude-current, etc.); this component only handles
 * the UI presentation — fetching the account-group names, building the
 * grouped data, and surfacing search.
 *
 * Data construction iterates over `groupsQ.data` (not over accounts) so
 * the picker can't fall back to a synthetic "(no group)" label: every
 * rendered section is named after a real group. Accounts referencing a
 * group that isn't in the response (shouldn't happen — `accountGroupId`
 * is `NOT NULL` and routes filter to active groups) are dropped silently
 * rather than shown under a fallback header. Until `groupsQ.data`
 * arrives, the dropdown stays empty — better than briefly rendering a
 * "(no group)" bucket that confuses the search filter.
 *
 * The cached `["accountGroups"]` query is shared across instances —
 * callers don't need to wire up an extra `useQuery`.
 *
 * `allowNone` toggles Mantine's built-in clear button (the X). When
 * cleared, the parent receives "" (empty string) as the new value.
 * Required pickers omit it — there's no clear affordance.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  label,
  description,
  placeholder = "Select…",
  required,
  allowNone,
  disabled,
}: {
  accounts: Account[];
  /** Empty string means "nothing selected"; we map to/from null at the
   *  Mantine boundary since `Select` uses null for the cleared state. */
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
      searchable
      // Mantine uses `null` for the cleared state; map to/from "" so the
      // parent's string-typed state stays simple.
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
    />
  );
}
