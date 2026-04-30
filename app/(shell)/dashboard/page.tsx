import { DashboardClient } from "@/app/(shell)/dashboard/dashboard-client";
import { requireAppAuth } from "@/lib/app-auth";
import { getDashboardSummary } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await requireAppAuth("/dashboard");
  const summary = await getDashboardSummary(userId);

  return (
    <section className="app-scroll w-full overflow-auto pb-8 pt-4 sm:pt-6">
      <DashboardClient summary={summary} />
    </section>
  );
}
