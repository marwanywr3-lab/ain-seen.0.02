export function roomJoinUrl(currentUrl: string, code: string): string {
  if (!/^[A-F0-9]{8}$/.test(code)) throw new Error("رمز الغرفة غير صالح");
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = new URLSearchParams({ join: code }).toString();
  return url.href;
}
export function readJoinCode(hash: string): string {
  const code =
    new URLSearchParams(hash.replace(/^#/, "")).get("join")?.toUpperCase() ||
    "";
  return /^[A-F0-9]{8}$/.test(code) ? code : "";
}
