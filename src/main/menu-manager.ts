import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from 'electron';
import { buildMenuTemplate, type MenuTranslations } from './menu-template.js';

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
    return buildMenuTemplate({
      translations: this.getTranslations(),
      isMac: process.platform === 'darwin',
      appName: app.name,
      webServiceRunning: this.webServiceRunning,
      onNavigateWebView: (direction) => this.navigateWebView(direction),
      onOpenDevTools: () => this.openDevTools(),
    });
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
        edit: '编辑',
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
        edit: 'Edit',
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
