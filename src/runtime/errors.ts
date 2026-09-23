export function errorMessage(
  error: unknown,
  fallback = "Unknown error.",
): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || fallback;
  }

  if (typeof error === "string") {
    const message = error.trim();
    return message || fallback;
  }

  if (
    error !== null &&
    error !== undefined
  ) {
    try {
      const serialized = String(error).trim();
      if (serialized) return serialized;
    } catch {
      // Fall through to the supplied fallback.
    }
  }

  return fallback;
}
