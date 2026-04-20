import { MemosWorkspace } from "@/components/memos-workspace";
import { requireAppAuth } from "@/lib/app-auth";
import { normalizeMemoFilters } from "@/lib/memos/normalization";
import { getMemoWorkspaceData } from "@/lib/memos/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function MemosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireAppAuth("/memos");
  const supabase = await getSupabaseServerClient();
  const resolvedSearchParams = await searchParams;
  const data = await getMemoWorkspaceData(
    supabase,
    userId,
    normalizeMemoFilters(resolvedSearchParams),
  );

  return (
    <section className="w-full overflow-auto pb-2">
      <MemosWorkspace initialData={data} />
    </section>
  );
}
