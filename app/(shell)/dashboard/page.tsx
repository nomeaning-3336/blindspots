import { redirect } from "next/navigation";
import { getVerifiedAppUserId } from "@/lib/app-auth";
import { getDashboardSummary } from "@/lib/dashboard-server";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage() {
  const userIdResult = await getVerifiedAppUserId();

  if (userIdResult.status !== "valid") {
    redirect("/sign-in?next=/dashboard");
  }

  const summary = await getDashboardSummary(userIdResult.userId);

  return (
    <section className="app-scroll w-full overflow-auto pb-8 pt-4 sm:pt-6">
      <DashboardClient summary={summary} />
    </section>
  );
}
