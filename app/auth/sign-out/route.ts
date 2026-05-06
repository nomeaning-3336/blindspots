import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Failed to sign out from Supabase", error);
    }

    return applyCookies(NextResponse.redirect(publicUrl(request, "/"), 303));
  } catch (error) {
    console.error("Sign-out route failed", error);
    return NextResponse.redirect(publicUrl(request, "/"), 303);
  }
}
