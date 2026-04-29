import { redirect } from "next/navigation";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParam = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next;
  const errorParam = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error;
  const nextPath = normalizeNextPath(nextParam);
  const userId = await getOptionalAppUserId();

  if (userId) {
    redirect(nextPath);
  }

  const target = new URLSearchParams({ next: nextPath });
  if (errorParam) {
    target.set("error", errorParam);
  }

  redirect(`/auth/email?${target.toString()}`);
}
