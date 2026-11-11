export function readServiceUrl(value: unknown): string {
  if (typeof value !== "object" || value === null)
    throw Error("Invalid service configuration");
  const apiUrl = (value as { apiUrl?: unknown }).apiUrl;
  if (apiUrl === "" || apiUrl === undefined) return "";
  if (typeof apiUrl !== "string") throw Error("Invalid service URL");
  const url = new URL(apiUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("Service URL must use HTTPS without credentials");
  return url.href.replace(/\/$/, "");
}
