import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from 'electron';

interface MenuTranslations {
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

export class MenuManager {
  private menu: Menu | null = null;
  private currentLanguage: string = 'zh-CN';
  private webServiceRunning: boolean = false;

  constructor(private mainWindow: BrowserWindow) {}

  createMenu(language: string, webServiceRunning: boolean = false): Menu {
    this.currentLanguage = language;
    this.webServiceRunning = webServiceRunning;

    const template = this.getMenuTemplate();
    this.menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(this.menu);

    return this.menu;
  }

  updateMenuLanguage(language: string): void {
    this.currentLanguage = language;
    this.createMenu(language, this.webServiceRunning);
  }

  updateWebServiceStatus(running: boolean): void {
    this.webServiceRunning = running;
    this.createMenu(this.currentLanguage, running);
  }

  private getMenuTemplate(): MenuItemConstructorOptions[] {
    const i18n = this.getTranslations();
    const isMac = process.platform === 'darwin';

    // Application menu (macOS only)
    const appMenu: MenuItemConstructorOptions = isMac
      ? {
          label: app.name,
          submenu: [
            { label: i18n.about, role: 'about' as const },
            { type: 'separator' as const },
            { label: i18n.quit, role: 'quit' as const },
          ],
        }
      : { label: i18n.help, role: 'help' as const };

    // Hagicode Web menu (web view navigation only)
    const hagicoWebMenu: MenuItemConstructorOptions = {
      label: i18n.hagicoWeb,
      submenu: [
        {
          label: i18n.navigate,
          submenu: [
            {
              label: i18n.back,
              accelerator: 'CmdOrCtrl+Left',
              click: () => this.navigateWebView('back'),
              enabled: this.webServiceRunning,
            },
            {
              label: i18n.forward,
              accelerator: 'CmdOrCtrl+Right',
              click: () => this.navigateWebView('forward'),
              enabled: this.webServiceRunning,
            },
            {
              label: i18n.refresh,
              accelerator: 'CmdOrCtrl+R',
              click: () => this.navigateWebView('refresh'),
              enabled: this.webServiceRunning,
            },
          ],
        },
        { type: 'separator' as const },
        {
          label: i18n.devTools,
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => this.openDevTools(),
          enabled: this.webServiceRunning,
        },
      ],
    };

    // Help menu (Windows/Linux)
    const helpMenu: MenuItemConstructorOptions = {
      label: i18n.help,
      submenu: [
        { label: i18n.about, role: 'about' as const },
      ],
    };

    // Build menu based on platform
    if (isMac) {
      return [appMenu, hagicoWebMenu, helpMenu];
    } else {
      return [hagicoWebMenu, helpMenu];
    }
  }

  private navigateWebView(direction: 'back' | 'forward' | 'refresh'): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('webview-navigate', direction);
    }
  }

  private openDevTools(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('webview-devtools');
    }
  }

  private getTranslations(): MenuTranslations {
    const translations: Record<string, MenuTranslations> = {
      'zh-CN': {
        hagicoWeb: 'Hagicode Web',
        navigate: '导航',
        back: '后退',
        forward: '前进',
        refresh: '刷新',
        devTools: '开发者工具',
        help: '帮助',
        about: '关于',
        quit: '退出',
      },
      'en-US': {
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navigation',
        back: 'Back',
        forward: 'Forward',
        refresh: 'Refresh',
        devTools: 'Developer Tools',
        help: 'Help',
        about: 'About',
        quit: 'Quit',
      },
    };

    return translations[this.currentLanguage] || translations['en-US'];
  }
}
