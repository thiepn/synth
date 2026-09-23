import { useEffect, useState } from "react";

export function AccessibilityBridge({
  modeLabel,
}: {
  modeLabel: string;
}) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const root = document.documentElement;
    const queries = [
      ["reduced-motion", "(prefers-reduced-motion: reduce)"],
      ["forced-colors", "(forced-colors: active)"],
      ["high-contrast", "(prefers-contrast: more)"],
      ["coarse-pointer", "(pointer: coarse)"],
    ] as const;

    const cleanups = queries.map(([attribute, query]) => {
      const media = window.matchMedia(query);
      const apply = () => {
        if (media.matches) {
          root.dataset[attribute.replace(/-([a-z])/g, (_, letter: string) =>
            letter.toUpperCase(),
          )] = "true";
        } else {
          delete root.dataset[
            attribute.replace(/-([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            )
          ];
        }
      };

      apply();
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    });

    const setKeyboard = (event: KeyboardEvent) => {
      if (
        event.key === "Tab" ||
        event.key.startsWith("Arrow") ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        root.dataset.inputModality = "keyboard";
      }
    };
    const setPointer = () => {
      root.dataset.inputModality = "pointer";
    };

    window.addEventListener("keydown", setKeyboard, true);
    window.addEventListener("pointerdown", setPointer, true);

    return () => {
      for (const cleanup of cleanups) cleanup();
      window.removeEventListener("keydown", setKeyboard, true);
      window.removeEventListener("pointerdown", setPointer, true);
      delete root.dataset.inputModality;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnnouncement("Mode changed to " + modeLabel + ".");
    }, 20);
    return () => window.clearTimeout(timer);
  }, [modeLabel]);

  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </div>
  );
}
