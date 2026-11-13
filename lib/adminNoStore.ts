export const ADMIN_CACHE_CONTROL = "no-store, private";

export function setAdminNoStore(res: { setHeader: (name: string, value: string) => void }): void {
  res.setHeader("Cache-Control", ADMIN_CACHE_CONTROL);
}
