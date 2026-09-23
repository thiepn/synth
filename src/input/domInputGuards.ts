export function eventTargetConsumesKeyboard(
  target: EventTarget | null,
): boolean {
  return (
    target instanceof HTMLElement &&
    (
      target.isContentEditable ||
      target.matches(
        "input, textarea, select, button, [role='slider'], [role='textbox'], [role='spinbutton']",
      )
    )
  );
}
