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
 * Account groups are fetched internally so callers don't have to wire
 * up an extra `useQuery`. The cached `["accountGroups"]` query is
 * shared across instances, and `accounts` itself is the source of truth
 * for membership — the group fetch only contributes display names.
 *
 * `allowNone` toggles a leading "— No default —" entry, used by forms
 * where the field is optional. Required pickers omit it.
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
  /** Render a leading "— No default —" item — for optional fields
   *  where clearing should set the parent state to "". */
  allowNone?: boolean;
  disabled?: boolean;
}) {
  const groupsQ = useQuery({
    queryKey: ["accountGroups"],
    queryFn: listAccountGroups,
  });

  const data = useMemo(() => {
    const groupNameById = new Map(
      (groupsQ.data ?? []).map((g) => [g.id, g.name]),
    );
    // Bucket by group id (preserve account input order within each group).
    const byGroupId = new Map<string, Account[]>();
    for (const a of accounts) {
      const arr = byGroupId.get(a.accountGroupId) ?? [];
      arr.push(a);
      byGroupId.set(a.accountGroupId, arr);
    }
    // Sort groups by their display name; "(no group)" — for accounts
    // whose group hasn't loaded yet — sinks to the bottom.
    const groups = [...byGroupId.entries()]
      .map(([gid, accs]) => ({
        gid,
        groupName: groupNameById.get(gid) ?? "(no group)",
        items: accs.map((a) => ({
          value: a.id,
          label: `${a.name} (${a.currency})`,
        })),
      }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName));
    const grouped = groups.map(({ groupName, items }) => ({
      group: groupName,
      items,
    }));
    return allowNone
      ? [{ value: "", label: "— No default —" }, ...grouped]
      : grouped;
  }, [accounts, groupsQ.data, allowNone]);

  return (
    <Select
      clearable={false}
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
