export type AnnotationClickIntent = {
  button: number;
  disabled: boolean;
  annotationsDisabled: boolean;
};

export function shouldClearAnnotationsOnPointerDown({
  button,
  disabled,
  annotationsDisabled,
}: AnnotationClickIntent) {
  return button === 0 && disabled && !annotationsDisabled;
}
