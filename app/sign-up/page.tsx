import { redirect } from "next/navigation";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParam = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next;
  const nextPath = normalizeNextPath(nextParam);
  const userId = await getOptionalAppUserId();

  if (userId) {
    redirect(nextPath);
  }

  redirect(`/auth/email?next=${encodeURIComponent(nextPath)}`);
}