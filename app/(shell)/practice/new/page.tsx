import { PracticeSetupFlow } from "@/components/practice-setup-flow";
import { requireAppAuth } from "@/lib/app-auth";

export default async function PracticeNewPage() {
  await requireAppAuth("/practice/new");
  return <PracticeSetupFlow />;
}
