import { Badge, Group, Stack, TagsInput, UnstyledButton } from "@mantine/core";
import { Tag } from "lucide-react";
import { useState } from "react";

/**
 * Tag entry field. Type-and-space hardens a tag into a pill; backspace or ×
 * removes one. While focused, existing-tag suggestions appear horizontally
 * below the input — clicking one adds it. The list filters as the user types.
 *
 * `data={[]}` + `openOnFocus={false}` suppress Mantine's vertical dropdown
 * since we render our own horizontal suggestions.
 */
export function TagsField({
  label,
  allTags,
  value,
  onChange,
}: {
  label?: string;
  allTags: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const trimmed = search.trim().toLowerCase();
  const suggestions = allTags
    .filter((t) => !value.includes(t))
    .filter((t) => trimmed === "" || t.toLowerCase().includes(trimmed));

  return (
    <Stack
      gap="xs"
      onBlur={(e) => {
        // Keep focused while focus moves to a child (e.g., a suggestion pill).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
      onFocus={() => setFocused(true)}
    >
      <TagsInput
        data={[]}
        label={label}
        leftSection={<Tag size={14} />}
        openOnFocus={false}
        placeholder="Type a tag and press space"
        searchValue={search}
        splitChars={[" ", ","]}
        value={value}
        onChange={onChange}
        onSearchChange={setSearch}
      />
      {focused && suggestions.length > 0 && (
        <Group gap="xs">
          {suggestions.map((t) => (
            <UnstyledButton
              key={t}
              aria-label={`Add tag ${t}`}
              onClick={() => {
                onChange([...value, t]);
                setSearch("");
              }}
            >
              <Badge style={{ cursor: "pointer" }} variant="light">
                #{t}
              </Badge>
            </UnstyledButton>
          ))}
        </Group>
      )}
    </Stack>
  );
}
