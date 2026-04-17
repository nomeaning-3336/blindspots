import { redirect } from "next/navigation";

export default async function ArcadeGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  redirect(`/practice/${gameId}`);
}

