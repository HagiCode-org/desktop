import type { MenuItemConstructorOptions } from 'electron';

export interface MenuTranslations {
  edit: string;
  hagicoWeb: string;
  navigate: string;
  back: string;
  forward: string;
  refresh: string;
  devTools: string;
  help: string;
  about: string;
  quit: string;
}

interface BuildMenuTemplateOptions {
  translations: MenuTranslations;
  isMac: boolean;
  appName: string;
  webServiceRunning: boolean;
  onNavigateWebView: (direction: 'back' | 'forward' | 'refresh') => void;
  onOpenDevTools: () => void;
}

export function buildMenuTemplate({
  translations,
  isMac,
  appName,
  webServiceRunning,
  onNavigateWebView,
  onOpenDevTools,
}: BuildMenuTemplateOptions): MenuItemConstructorOptions[] {
  const appMenu: MenuItemConstructorOptions = isMac
    ? {
        label: appName,
        submenu: [
          { label: translations.about, role: 'about' as const },
          { type: 'separator' as const },
          { label: translations.quit, role: 'quit' as const },
        ],
      }
    : { label: translations.help, role: 'help' as const };

  const editMenu: MenuItemConstructorOptions = {
    label: translations.edit,
    submenu: [
      { role: 'undo' as const },
      { role: 'redo' as const },
      { type: 'separator' as const },
      { role: 'cut' as const },
      { role: 'copy' as const },
      { role: 'paste' as const },
      { role: 'selectAll' as const },
    ],
  };

  const hagicoWebMenu: MenuItemConstructorOptions = {
    label: translations.hagicoWeb,
    submenu: [
      {
        label: translations.navigate,
        submenu: [
          {
            label: translations.back,
            accelerator: 'CmdOrCtrl+Left',
            click: () => onNavigateWebView('back'),
            enabled: webServiceRunning,
          },
          {
            label: translations.forward,
            accelerator: 'CmdOrCtrl+Right',
            click: () => onNavigateWebView('forward'),
            enabled: webServiceRunning,
          },
          {
            label: translations.refresh,
            accelerator: 'CmdOrCtrl+R',
            click: () => onNavigateWebView('refresh'),
            enabled: webServiceRunning,
          },
        ],
      },
      { type: 'separator' as const },
      {
        label: translations.devTools,
        accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        click: () => onOpenDevTools(),
        enabled: webServiceRunning,
      },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: translations.help,
    submenu: [{ label: translations.about, role: 'about' as const }],
  };

  return isMac
    ? [appMenu, editMenu, hagicoWebMenu, helpMenu]
    : [editMenu, hagicoWebMenu, helpMenu];
}
