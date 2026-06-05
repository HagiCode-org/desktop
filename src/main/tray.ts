import { electron } from '../electron-api.js';
import type { Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activateMainWindow } from './main.js';
import { resolveWindowIconPath } from './window-icon-path.js';
import { resolveDesktopLanguageCode } from '../shared/desktop-languages.js';

const { Tray: ElectronTray, Menu: ElectronMenu, nativeImage, app } = electron;

export function setWebServiceManagerRef(_ref: unknown): void {
  // Tray service controls have been removed, but main.ts still calls this.
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAppRootPath(): string {
  return path.resolve(__dirname, '..', '..');
}

function loadTrayIcon(): Electron.NativeImage {
  const iconPath = resolveWindowIconPath({
    appRootPath: getAppRootPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    existsSync: fs.existsSync,
  });
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.warn('[Tray] Tray icon could not be loaded:', iconPath);
  }

  return icon;
}

let tray: Tray | null = null;
let serverStatus: 'running' | 'stopped' | 'error' = 'stopped';
let currentServiceUrl: string | null = null;
let currentTrayLanguage: string | null = null;

// Translation helper - supports multiple languages
const getTrayLabel = (key: string): string => {
  const labels: Record<string, Record<string, string>> = {
    'quit': {
      'en': 'Quit',
      'zh': '退出',
      'zh-CN': '退出',
      'zh-Hant': '結束',
      'ja-JP': '終了',
      'ko-KR': '종료',
      'de-DE': 'Beenden',
      'fr-FR': 'Quitter',
      'es-ES': 'Salir',
      'pt-BR': 'Sair',
      'ru-RU': 'Выход',
    }
  };

  const locale = currentTrayLanguage ?? app.getLocale?.() ?? 'en';
  const lang = resolveDesktopLanguageCode(locale, 'en-US');

  return labels[key]?.[lang] || labels[key]?.['en'] || key;
};

export function setTrayLanguage(language: string): void {
  currentTrayLanguage = language;
  updateTrayMenu();
}

export function createTray(): void {
  const icon = loadTrayIcon();

  tray = new ElectronTray(icon.resize({ width: 16, height: 16 }));

  updateTrayMenu();

  tray.on('click', () => {
    activateMainWindow('tray-click');
  });
}

export function updateTrayMenu(): void {
  if (!tray) return;

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Hagicode Desktop',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: getTrayLabel('quit'),
      click: () => {
        app.quit();
      },
    },
  ];

  const contextMenu = ElectronMenu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Hagicode Desktop');
}

export function setServerStatus(status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping', url?: string | null): void {
  // Map starting/stopping to appropriate display status
  const displayStatus: 'running' | 'stopped' | 'error' =
    status === 'running' ? 'running' :
    status === 'stopped' ? 'stopped' :
    status === 'error' ? 'error' :
    status === 'starting' ? 'running' :  // Show as running during startup
    'stopped';  // Show as stopped during shutdown

  serverStatus = displayStatus;
  if (url !== undefined) {
    currentServiceUrl = url;
  }
  updateTrayMenu();
}

export function setServiceUrl(url: string | null | undefined): void {
  currentServiceUrl = url || null;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
