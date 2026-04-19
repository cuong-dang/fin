import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";

export default function SettingsPage() {
  return (
    <FormPage size="lg">
      <BackLink href="/" />
      <h1 className="mt-4 text-2xl font-semibold">Settings</h1>
      <ul className="mt-6 space-y-2">
        <li>
          <Link
            href="/settings/categories"
            className="hover:bg-muted/40 -mx-3 block rounded-md px-3 py-2"
          >
            <div className="text-sm font-medium">Categories</div>
            <div className="text-muted-foreground text-xs">
              Income &amp; expense categories and subcategories
            </div>
          </Link>
        </li>
      </ul>
    </FormPage>
  );
}
