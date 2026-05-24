import { redirect } from "next/navigation";

export default async function TrainRouteAlias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") next.append(key, item);
      }
    } else if (typeof value === "string") {
      next.set(key, value);
    }
  }

  const query = next.toString();
  redirect(query ? `/?${query}` : "/");
}
