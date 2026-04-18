import { AccountsSidebar } from "@/components/accounts-sidebar";
import { getCurrentSession } from "@/lib/session";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session) return null;

  return (
    <div className="flex h-full">
      <AccountsSidebar session={session} />
      <main className="flex-1 p-8" />
    </div>
  );
}
