export function normalizeText(value: string) { return value.trim().replace(/\s+/g, " "); }
export function normalizePhone(value: string) { return value.replace(/[^\d+()\-\s]/g, "").slice(0, 20); }
export function phoneError(value: string) {
  if (!value.trim()) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length < 7 || digits.length > 15 ? "Enter a valid phone number with 7–15 digits." : "";
}
export function emailError(value: string) {
  if (!value.trim()) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? "" : "Enter a valid email address.";
}
export function duplicateError(value: string, existing: string[], label: string) {
  const normalized = normalizeText(value).toLocaleLowerCase();
  return normalized && existing.some((item) => normalizeText(item).toLocaleLowerCase() === normalized) ? `${label} already exists.` : "";
}
