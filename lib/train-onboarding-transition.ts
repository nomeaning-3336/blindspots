export type StartTrainingTransitionCallbacks = {
  enterTrainingSurface: () => void;
  persistOnboarding?: () => Promise<void>;
  saveSettings: () => Promise<void>;
  loadPosition: () => Promise<void>;
};

export async function runStartTrainingTransition({
  enterTrainingSurface,
  persistOnboarding,
  saveSettings,
  loadPosition,
}: StartTrainingTransitionCallbacks) {
  enterTrainingSurface();
  await persistOnboarding?.();
  await saveSettings();
  await loadPosition();
}
