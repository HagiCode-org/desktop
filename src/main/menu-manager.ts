import { electron } from '../electron-api.js';
import type { BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import { buildMenuTemplate, type MenuTranslations } from './menu-template.js';
import { resolveDesktopLanguageCode } from '../shared/desktop-languages.js';

const { Menu: ElectronMenu, app } = electron;

export class MenuManager {
  private menu: Menu | null = null;
  private currentLanguage: string = 'zh-CN';
  private webServiceRunning: boolean = false;

  constructor(private mainWindow: BrowserWindow) {}

  createMenu(language: string, webServiceRunning: boolean = false): Menu {
    this.currentLanguage = language;
    this.webServiceRunning = webServiceRunning;

    const template = this.getMenuTemplate();
    this.menu = ElectronMenu.buildFromTemplate(template);
    ElectronMenu.setApplicationMenu(this.menu);

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
      'zh-Hant': {
        edit: '編輯',
        hagicoWeb: 'Hagicode Web',
        navigate: '導覽',
        back: '返回',
        forward: '前進',
        refresh: '重新整理',
        devTools: '開發者工具',
        help: '說明',
        about: '關於',
        quit: '結束',
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
      'ja-JP': {
        edit: '編集',
        hagicoWeb: 'Hagicode Web',
        navigate: 'ナビゲーション',
        back: '戻る',
        forward: '進む',
        refresh: '更新',
        devTools: '開発者ツール',
        help: 'ヘルプ',
        about: 'バージョン情報',
        quit: '終了',
      },
      'ko-KR': {
        edit: '편집',
        hagicoWeb: 'Hagicode Web',
        navigate: '탐색',
        back: '뒤로',
        forward: '앞으로',
        refresh: '새로 고침',
        devTools: '개발자 도구',
        help: '도움말',
        about: '정보',
        quit: '종료',
      },
      'de-DE': {
        edit: 'Bearbeiten',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navigation',
        back: 'Zurück',
        forward: 'Vorwärts',
        refresh: 'Aktualisieren',
        devTools: 'Entwicklertools',
        help: 'Hilfe',
        about: 'Über',
        quit: 'Beenden',
      },
      'fr-FR': {
        edit: 'Modifier',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navigation',
        back: 'Précédent',
        forward: 'Suivant',
        refresh: 'Actualiser',
        devTools: 'Outils de développement',
        help: 'Aide',
        about: 'À propos',
        quit: 'Quitter',
      },
      'es-ES': {
        edit: 'Editar',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navegación',
        back: 'Atrás',
        forward: 'Adelante',
        refresh: 'Actualizar',
        devTools: 'Herramientas de desarrollador',
        help: 'Ayuda',
        about: 'Acerca de',
        quit: 'Salir',
      },
      'pt-BR': {
        edit: 'Editar',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navegação',
        back: 'Voltar',
        forward: 'Avançar',
        refresh: 'Atualizar',
        devTools: 'Ferramentas de desenvolvedor',
        help: 'Ajuda',
        about: 'Sobre',
        quit: 'Sair',
      },
      'ru-RU': {
        edit: 'Правка',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Навигация',
        back: 'Назад',
        forward: 'Вперёд',
        refresh: 'Обновить',
        devTools: 'Инструменты разработчика',
        help: 'Справка',
        about: 'О программе',
        quit: 'Выход',
      },
    };

    return translations[resolveDesktopLanguageCode(this.currentLanguage, 'en-US')] || translations['en-US'];
  }
}
