function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(origin: string | undefined) {
  if (!origin) return null;

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function getPublicOrigin(request: Request) {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (configuredOrigin && !configuredOrigin.includes("localhost")) {
    return configuredOrigin;
  }

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    const requestProtocol = new URL(request.url).protocol.replace(":", "");
    const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) || requestProtocol;
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

function publicUrl(request: Request, pathname: string) {
  return new URL(pathname, getPublicOrigin(request));
}

export function buildMagicLinkCallbackUrl(request: Request, nextPath: string) {
  return publicUrl(
    request,
    `/auth/callback?next=${encodeURIComponent(nextPath)}`,
  ).toString();
}

export function buildMagicLinkSentUrl(
  request: Request,
  nextPath: string,
  email: string,
) {
  const url = publicUrl(request, "/auth/email");
  url.searchParams.set("next", nextPath);
  url.searchParams.set("sent", "true");
  url.searchParams.set("email", email);
  return url;
}
