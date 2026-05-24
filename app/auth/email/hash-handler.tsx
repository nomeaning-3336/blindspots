"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function EmailAuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#error=")) return;

    const params = new URLSearchParams(hash.slice(1));
    const error = params.get("error") ?? "";
    const errorCode = params.get("error_code") ?? "";
    const next = params.get("next") ?? "/";

    // Map Supabase OTP errors to user-friendly query params
    if (errorCode === "otp_expired" || error === "access_denied") {
      const url = new URL("/auth/email", window.location.origin);
      url.searchParams.set("next", next);
      url.searchParams.set("error", "link-expired");
      router.replace(url.toString());
    }
  }, [router]);

  return null;
}
