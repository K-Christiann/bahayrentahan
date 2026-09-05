export function userError(error: unknown, fallback: string) {
  if (!navigator.onLine) return "No internet connection. Reconnect, then retry without leaving this page.";
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (/failed to fetch|network|load failed/i.test(message)) return "The service could not be reached. Your Supabase project may be resuming; wait a moment, then retry.";
  if (/permission|row-level|rls|42501/i.test(`${message} ${code}`)) return "Your account does not have permission for this record. Sign in again if the problem continues.";
  if (/jwt|token|session|401/i.test(`${message} ${code}`)) return "Your session has expired. Sign in again to continue.";
  if (/duplicate|unique|23505/i.test(`${message} ${code}`)) return "A record with the same details already exists.";
  return message || fallback;
}
