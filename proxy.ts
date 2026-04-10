import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware((_, request) => {
  const { pathname, search } = request.nextUrl;
  if (
    pathname === "/analyze" ||
    pathname === "/analyze/" ||
    pathname === "/app/analyze" ||
    pathname === "/app/analyze/"
  ) {
    const targetUrl = new URL(`/analysis${search}`, request.url);
    return NextResponse.redirect(targetUrl, 302);
  }
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const targetPath =
      pathname === "/app" ? "/analysis" : pathname.slice(4) || "/analysis";
    const targetUrl = new URL(`${targetPath}${search}`, request.url);
    return NextResponse.redirect(targetUrl, 308);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
