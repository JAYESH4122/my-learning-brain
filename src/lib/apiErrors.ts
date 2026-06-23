export function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function parseProviderError(message: string): Record<string, unknown> | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getNestedProviderMessage(parsed: Record<string, unknown>) {
  const error = parsed.error;
  if (!error || typeof error !== "object") return "";

  const providerError = error as Record<string, unknown>;
  return [
    providerError.message,
    providerError.status,
    providerError.code,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ");
}

export function getPublicErrorMessage(err: unknown) {
  const message = getErrorMessage(err);
  const parsedProviderError = parseProviderError(message);
  const searchable = `${message} ${
    parsedProviderError ? getNestedProviderMessage(parsedProviderError) : ""
  }`.toLowerCase();

  if (
    searchable.includes("currently experiencing high demand") ||
    searchable.includes("unavailable") ||
    searchable.includes("\"code\":503") ||
    searchable.includes(" 503")
  ) {
    return "The AI model is busy right now. Please try again in a moment.";
  }

  if (
    searchable.includes("quota") ||
    searchable.includes("rate limit") ||
    searchable.includes("resource_exhausted") ||
    searchable.includes("\"code\":429") ||
    searchable.includes(" 429")
  ) {
    return "The AI usage limit was reached for now. Please wait a bit and try again.";
  }

  return message;
}

export function isSchemaMissingError(err: unknown) {
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("could not find the function") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}
