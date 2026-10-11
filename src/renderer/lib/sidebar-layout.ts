export const SIDEBAR_COLLAPSE_STORAGE_KEY = 'hagicode.desktop.sidebar.collapsed';

/** Windows narrower than this start with the icon rail unless the user chose otherwise. */
export const SIDEBAR_AUTO_COLLAPSE_BELOW_PX = 1024;

/** `null` means the user has not chosen, so the window width decides. */
export type SidebarCollapsePreference = boolean | null;

export function parseSidebarCollapsePreference(raw: string | null | undefined): SidebarCollapsePreference {
  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return null;
}

export function resolveSidebarCollapsed(
  preference: SidebarCollapsePreference,
  viewportWidth: number,
): boolean {
  return preference ?? viewportWidth < SIDEBAR_AUTO_COLLAPSE_BELOW_PX;
}
