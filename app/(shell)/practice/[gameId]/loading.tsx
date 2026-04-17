import { PracticeLoader } from "@/components/practice-loader";

export default function PracticeGameLoading() {
  return (
    <PracticeLoader
      title="Opening Practice Room"
      description="Restoring the board, syncing the saved game, and seating the opponent."
      hint="Please wait. Your board should be ready in a moment."
    />
  );
}
