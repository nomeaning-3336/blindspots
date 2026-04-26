import { requireAppAuth } from "@/lib/app-auth";
import TrainPage from "./train-client";

export default async function TrainPageWrapper() {
  await requireAppAuth("/train");
  return <TrainPage />;
}
