import { electron } from '../electron-api.js';
import type { Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activateMainWindow, mainWindow } from './main.js';
import { resolveWindowIconPath } from './window-icon-path.js';
import { resolveDesktopLanguageCode } from '../shared/desktop-languages.js';

const { Tray: ElectronTray, Menu: ElectronMenu, nativeImage, app, Notification, shell, ipcMain } = electron;

// Reference to webServiceManager - will be set from main.ts
let webServiceManagerRef: any = null;

export function setWebServiceManagerRef(ref: any): void {
  webServiceManagerRef = ref;
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
    'showWindow': {
      'en': 'Show Window',
      'zh': '显示窗口',
      'zh-CN': '显示窗口',
      'zh-Hant': '顯示視窗',
      'ja-JP': 'ウィンドウを表示',
      'ko-KR': '창 표시',
      'de-DE': 'Fenster anzeigen',
      'fr-FR': 'Afficher la fenêtre',
      'es-ES': 'Mostrar ventana',
      'pt-BR': 'Mostrar janela',
      'ru-RU': 'Показать окно',
    },
    'startService': {
      'en': 'Start Service',
      'zh': '启动服务',
      'zh-CN': '启动服务',
      'zh-Hant': '啟動服務',
      'ja-JP': 'サービスを開始',
      'ko-KR': '서비스 시작',
      'de-DE': 'Dienst starten',
      'fr-FR': 'Démarrer le service',
      'es-ES': 'Iniciar servicio',
      'pt-BR': 'Iniciar serviço',
      'ru-RU': 'Запустить службу',
    },
    'stopService': {
      'en': 'Stop Service',
      'zh': '停止服务',
      'zh-CN': '停止服务',
      'zh-Hant': '停止服務',
      'ja-JP': 'サービスを停止',
      'ko-KR': '서비스 중지',
      'de-DE': 'Dienst stoppen',
      'fr-FR': 'Arrêter le service',
      'es-ES': 'Detener servicio',
      'pt-BR': 'Parar serviço',
      'ru-RU': 'Остановить службу',
    },
    'openHagicode': {
      'en': 'Open Hagicode',
      'zh': '打开 Hagicode',
      'zh-CN': '打开 Hagicode',
      'zh-Hant': '打開 Hagicode',
      'ja-JP': 'Hagicode を開く',
      'ko-KR': 'Hagicode 열기',
      'de-DE': 'Hagicode öffnen',
      'fr-FR': 'Ouvrir Hagicode',
      'es-ES': 'Abrir Hagicode',
      'pt-BR': 'Abrir Hagicode',
      'ru-RU': 'Открыть Hagicode',
    },
    'openInBrowser': {
      'en': 'Open in Browser',
      'zh': '浏览器打开',
      'zh-CN': '浏览器打开',
      'zh-Hant': '在瀏覽器開啟',
      'ja-JP': 'ブラウザーで開く',
      'ko-KR': '브라우저에서 열기',
      'de-DE': 'Im Browser öffnen',
      'fr-FR': 'Ouvrir dans le navigateur',
      'es-ES': 'Abrir en navegador',
      'pt-BR': 'Abrir no navegador',
      'ru-RU': 'Открыть в браузере',
    },
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

  const isRunning = serverStatus === 'running';

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Hagicode Desktop',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: getTrayLabel('showWindow'),
      click: () => {
        activateMainWindow('tray-menu-show-window');
      },
    },
    { type: 'separator' },
    // Dynamic service control buttons
    ...(isRunning ? [] : [{
      label: getTrayLabel('startService'),
      click: async () => {
        // Update status to starting immediately
        setServerStatus('starting');
        try {
          // Use IPC to start service - this ensures entryPoint is properly set
          // The main process handles the full startup flow including entryPoint
          mainWindow?.webContents.send('tray-start-service');
        } catch (error) {
          console.error('Failed to start service from tray:', error);
          setServerStatus('error');
        }
      },
    }]),
    ...(isRunning ? [{
      label: getTrayLabel('stopService'),
      click: async () => {
        // Update status to stopping immediately
        setServerStatus('stopping');
        try {
          if (webServiceManagerRef) {
            const result = await webServiceManagerRef.stop();
            const status = await webServiceManagerRef.getStatus();
            setServerStatus(status.status);
            setServiceUrl(null);
            // Notify renderer of status change
            mainWindow?.webContents.send('web-service-status-changed', status);
          } else {
            // Fallback: send IPC message to renderer
            mainWindow?.webContents.send('tray-stop-service');
          }
        } catch (error) {
          console.error('Failed to stop service from tray:', error);
          setServerStatus('error');
        }
      },
    }] : []),
    { type: 'separator' },
    // Open buttons (only when running)
    ...(isRunning ? [{
      label: getTrayLabel('openHagicode'),
      click: async () => {
        if (currentServiceUrl) {
          shell.openExternal(currentServiceUrl);
        } else {
          showNotification('Error', 'Service URL not available');
        }
      },
    }, {
      label: getTrayLabel('openInBrowser'),
      click: () => {
        activateMainWindow('tray-menu-open-in-browser');
      },
    }] : []),
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
  // Rebuild menu when URL changes
  if (serverStatus === 'running') {
    updateTrayMenu();
  }
}

export function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
    }).show();
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
