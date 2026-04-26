import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe as GlobeIcon,
  Info,
  LoaderCircle,
  Network,
  PackageOpen,
  Settings,
  Stethoscope,
} from 'lucide-react';
import { switchView } from '../store/slices/viewSlice';
import type { RootState } from '../store';
import type { ViewType } from '../store/slices/viewSlice';
import { ThemeToggle } from './ui/theme-toggle';
import { LanguageToggle } from './ui/language-toggle';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import type { DistributionMode } from '../../types/distribution-mode';
import {
  createLoadingSidebarAboutFetchState,
  hasSidebarAboutEntries,
  loadBundledSidebarAbout,
  normalizeSidebarAboutLocale,
  refreshSidebarAboutModel,
  type SidebarAboutEntry,
  type SidebarAboutFetchState,
  type SidebarAboutModel,
  type SidebarAboutSectionId,
} from '../lib/about-sidebar';

interface NavigationItem {
  id: ViewType | 'official-website' | 'cost-calculator';
  labelKey: string;
  descriptionKey?: string;
  icon: ComponentType<{ className?: string }>;
  url?: string;
}

const navigationItems: NavigationItem[] = [
  { id: 'system', labelKey: 'sidebar.dashboard', icon: Settings },
  { id: 'version', labelKey: 'sidebar.versionManagement', icon: FileText },
  { id: 'diagnostic', labelKey: 'sidebar.diagnostic', icon: Stethoscope },
  { id: 'npm-management', labelKey: 'sidebar.npmManagement', icon: PackageOpen },
  { id: 'omniroute', labelKey: 'sidebar.omniroute', icon: Network },
  { id: 'settings', labelKey: 'sidebar.settings', icon: Settings },
];

const officialWebsiteItem: NavigationItem = {
  id: 'official-website',
  labelKey: 'navigation.officialWebsite',
  descriptionKey: 'navigation.officialWebsiteDesc',
  icon: GlobeIcon,
  url: 'https://hagicode.com/',
};

const remainingExternalLinkItems: NavigationItem[] = [
  {
    id: 'cost-calculator',
    labelKey: 'navigation.costCalculator',
    url: 'https://cost.hagicode.com',
    icon: Calculator,
  },
];

interface SidebarNavigationProps {
  distributionMode: DistributionMode;
}

const ABOUT_BRAND_DOMAIN_OVERRIDES: Partial<Record<SidebarAboutEntry['id'], string>> = {
  'product-hunt': 'producthunt.com',
  'qq-group': 'qq.com',
  'feishu-group': 'feishu.cn',
  'douyin-account': 'douyin.com',
  'douyin-qr': 'douyin.com',
  'wechat-account': 'weixin.qq.com',
};

function normalizeAboutBrandDomain(hostname: string): string {
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./, '');

  if (normalizedHostname.endsWith('.qq.com')) {
    return 'qq.com';
  }

  if (normalizedHostname.endsWith('.feishu.cn')) {
    return 'feishu.cn';
  }

  return normalizedHostname;
}

function getAboutBrandDomain(entry: SidebarAboutEntry): string | null {
  const explicitDomain = ABOUT_BRAND_DOMAIN_OVERRIDES[entry.id];
  if (explicitDomain) {
    return explicitDomain;
  }

  if (!entry.href) {
    return null;
  }

  try {
    return normalizeAboutBrandDomain(new URL(entry.href).hostname);
  } catch {
    return null;
  }
}

function getAboutEntryMonogram(label: string): string {
  const latin = Array.from(label.matchAll(/[A-Za-z0-9]/g))
    .map((match) => match[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (latin.length > 0) {
    return latin;
  }

  return Array.from(label.replace(/\s+/g, '')).slice(0, 2).join('');
}

function getAboutEntryHint(entry: SidebarAboutEntry): string {
  if (entry.value) {
    return entry.value;
  }

  return entry.detail;
}

function AboutBrandLogo({ entry }: { entry: SidebarAboutEntry }) {
  const [imageFailed, setImageFailed] = useState(false);
  const domain = getAboutBrandDomain(entry);

  if (!imageFailed && domain) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        aria-hidden
        className="h-6 w-6 rounded-md object-contain"
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/70"
    >
      {getAboutEntryMonogram(entry.label)}
    </span>
  );
}

export default function SidebarNavigation({ distributionMode }: SidebarNavigationProps) {
  const { t, i18n } = useTranslation('common');
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const isPortableMode = distributionMode === 'steam';
  const visibleNavigationItems = isPortableMode
    ? navigationItems.filter((item) => item.id !== 'version')
    : navigationItems;
  const aboutLocale = useMemo(
    () => normalizeSidebarAboutLocale(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const bundledAboutModel = useMemo(() => loadBundledSidebarAbout(aboutLocale), [aboutLocale]);

  const [collapsed, setCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [webVersion, setWebVersion] = useState<string | null>(null);
  const [aboutModel, setAboutModel] = useState<SidebarAboutModel | null>(bundledAboutModel);
  const [aboutFetchState, setAboutFetchState] = useState<SidebarAboutFetchState>(
    createLoadingSidebarAboutFetchState(),
  );

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };

    void fetchVersion();
  }, []);

  useEffect(() => {
    if (!isPortableMode) {
      setWebVersion(null);
      return;
    }

    const fetchWebVersion = async () => {
      try {
        const version = await window.electronAPI.getWebServiceVersion();
        setWebVersion(version);
      } catch (error) {
        console.error('Failed to fetch web service version:', error);
        setWebVersion('unknown');
      }
    };

    void fetchWebVersion();
  }, [isPortableMode]);

  useEffect(() => {
    setAboutModel(bundledAboutModel);
    setAboutFetchState(createLoadingSidebarAboutFetchState());

    let cancelled = false;

    void refreshSidebarAboutModel(aboutLocale, bundledAboutModel).then((result) => {
      if (cancelled) {
        return;
      }

      setAboutModel(result.model);
      setAboutFetchState(result.fetchState);
    });

    return () => {
      cancelled = true;
    };
  }, [aboutLocale, bundledAboutModel]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const resolvedWebVersion = webVersion && webVersion !== 'unknown'
    ? webVersion
    : t('sidebar.unknownVersion');

  const hasAboutContent = hasSidebarAboutEntries(aboutModel);

  const openExternalUrl = async (url: string) => {
    try {
      const result = await window.electronAPI.openExternal(url);
      if (!result.success) {
        console.error('Failed to open external link:', result.error);
      }
    } catch (error) {
      console.error('Failed to open external link:', error);
    }
  };

  const handleNavClick = async (item: NavigationItem) => {
    if (item.url) {
      await openExternalUrl(item.url);
      return;
    }

    const viewId = item.id as ViewType;
    dispatch(switchView(viewId));
  };

  const isNavActive = (item: NavigationItem) => {
    if (item.url) {
      return false;
    }

    const viewId = item.id as ViewType;
    return currentView === viewId;
  };

  const renderAboutSectionTitle = (sectionId: SidebarAboutSectionId) => (
    <p className="px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/90">
      {t(`navigation.about.sections.${sectionId}`)}
    </p>
  );

  const renderAboutEntryIcon = (entry: SidebarAboutEntry) => {
    const actionable = Boolean(entry.href);
    const hint = getAboutEntryHint(entry);
    const accessibleLabel = hint ? `${entry.label} · ${hint}` : entry.label;
    const iconButton = (
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background/80 shadow-sm transition-colors group-hover:border-primary/40 group-hover:bg-accent/50 group-focus-visible:border-primary/40 group-focus-visible:bg-accent/50">
        <AboutBrandLogo entry={entry} />
        {actionable ? (
          <span className="absolute -right-1 -top-1 rounded-full border border-background bg-background p-0.5 shadow-sm">
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        ) : null}
      </div>
    );

    if (entry.imageUrl) {
      return (
        <Popover key={entry.id}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={accessibleLabel}
              title={accessibleLabel}
              className="group flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              {iconButton}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3" align="start">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{entry.label}</p>
              <p className="text-xs text-muted-foreground">{t(`navigation.about.types.${entry.type}`)}</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-2">
              <img
                src={entry.imageUrl}
                alt={entry.alt}
                className="mx-auto max-h-52 w-auto rounded-lg object-contain"
                loading="lazy"
              />
            </div>

            {hint ? (
              <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
            ) : null}

            {entry.href ? (
              <button
                type="button"
                onClick={() => void openExternalUrl(entry.href!)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/50"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t('button.open')}
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      );
    }

    if (!actionable || !entry.href) {
      return (
        <div
          key={entry.id}
          aria-label={accessibleLabel}
          title={accessibleLabel}
          className="flex items-center justify-center rounded-xl"
        >
          {iconButton}
        </div>
      );
    }

    return (
      <button
        key={entry.id}
        type="button"
        aria-label={accessibleLabel}
        title={accessibleLabel}
        onClick={() => void openExternalUrl(entry.href!)}
        className="group flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        {iconButton}
      </button>
    );
  };

  const OfficialWebsiteIcon = officialWebsiteItem.icon;

  return (
    <aside
      className={`
        fixed left-0 top-0 z-40 flex h-screen min-h-0 flex-col border-r border-border bg-background
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 64 : 256 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex items-center justify-between h-16 px-4 border-b border-border"
      >
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <motion.div
                whileHover={{ scale: 1.05, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20"
              >
                <span className="text-xl font-bold text-primary-foreground">H</span>
              </motion.div>
              <div>
                <motion.h1
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-lg font-bold text-foreground"
                >
                  Hagicode
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-xs text-muted-foreground"
                >
                  Desktop
                </motion.p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20"
            >
              <span className="text-xl font-bold text-primary-foreground">H</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2"
            >
              <LanguageToggle />
              <ThemeToggle />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <nav className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col px-2 py-4">
          <div className="space-y-1">
            {visibleNavigationItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = isNavActive(item);

              return (
                <motion.button
                  key={item.id}
                  onClick={() => void handleNavClick(item)}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  whileHover={{ x: isActive ? 0 : 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                    overflow-hidden group
                    ${isActive
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-accent-foreground'
                    }
                  `}
                >
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-linear-to-br from-primary to-primary/80"
                      />
                    )}
                  </AnimatePresence>

                  {!isActive && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-accent/50"
                    />
                  )}

                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 bg-primary/30 blur-md"
                    />
                  )}

                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 24 }}
                        exit={{ height: 0 }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-primary-foreground rounded-r-full"
                      />
                    )}
                  </AnimatePresence>

                  <Icon className={`w-5 h-5 flex-shrink-0 relative z-10 ${isActive ? 'text-primary-foreground' : ''}`} />

                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="font-medium text-sm whitespace-nowrap relative z-10"
                      >
                        {t(item.labelKey)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="my-2 border-t border-border"
            />
          )}

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <ScrollArea className="h-full" type="always">
              <div className="space-y-2 pb-6">
                <motion.button
                  type="button"
                  onClick={() => void handleNavClick(officialWebsiteItem)}
                  title={t(officialWebsiteItem.descriptionKey ?? '')}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted/10 px-3 py-3 text-left group"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-accent/40"
                  />

                  <div className="relative z-10 flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80">
                      <OfficialWebsiteIcon className="h-5 w-5 text-foreground" />
                    </div>

                    {!collapsed ? (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {t(officialWebsiteItem.labelKey)}
                          </p>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t(officialWebsiteItem.descriptionKey ?? '')}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {collapsed && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                      {t(officialWebsiteItem.labelKey)}
                    </div>
                  )}
                </motion.button>

                {!collapsed ? (
                  <div className="space-y-3 pl-3 pr-2" data-about-source={aboutModel?.source ?? 'none'}>
                    {!bundledAboutModel ? (
                      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">
                        {t('navigation.about.snapshotMissing')}
                      </div>
                    ) : null}

                    {aboutFetchState.status === 'loading' ? (
                      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        <span>{t('navigation.about.loading')}</span>
                      </div>
                    ) : null}

                    {aboutFetchState.status === 'error' ? (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          {bundledAboutModel
                            ? t('navigation.about.refreshFailed')
                            : t('navigation.about.loadFailed')}
                        </span>
                      </div>
                    ) : null}

                    {hasAboutContent && aboutModel ? (
                      aboutModel.sections.map((section) => (
                        <div key={section.id} className="space-y-2">
                          {renderAboutSectionTitle(section.id)}
                          <div className="grid grid-cols-4 gap-2">
                            {section.entries.map((entry) => renderAboutEntryIcon(entry))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">
                        {t('navigation.about.empty')}
                      </div>
                    )}
                  </div>
                ) : null}

                {remainingExternalLinkItems.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <motion.button
                      key={item.id}
                      onClick={() => void handleNavClick(item)}
                      title={item.descriptionKey ? t(item.descriptionKey) : ''}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + index * 0.05, duration: 0.3 }}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg overflow-hidden group text-muted-foreground hover:text-accent-foreground"
                    >
                      <motion.div
                        initial={{ opacity: 0 }}
                        whileHover={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-accent/50"
                      />

                      <Icon className="w-5 h-5 flex-shrink-0 relative z-10 group-hover:scale-110 transition-transform duration-200" />

                      <AnimatePresence mode="wait">
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="font-medium text-sm whitespace-nowrap relative z-10"
                          >
                            {t(item.labelKey)}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      <AnimatePresence mode="wait">
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity relative z-10"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {collapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                          {t(item.labelKey)}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </ScrollArea>
          </motion.div>
        </div>
      </nav>

      <div className="border-t border-border bg-background">
        <AnimatePresence mode="wait">
          {!collapsed && appVersion && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className={isPortableMode ? 'flex items-start gap-2 px-3 py-2' : 'flex items-center gap-2 px-3 py-2'}
            >
              <Info className={`w-4 h-4 text-muted-foreground shrink-0 ${isPortableMode ? 'mt-0.5' : ''}`} />
              {isPortableMode ? (
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('sidebar.desktopVersion')}
                    </p>
                    <p className="text-xs text-foreground break-all">
                      {appVersion}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('sidebar.webVersion')}
                    </p>
                    <p className="text-xs text-foreground break-all">
                      {resolvedWebVersion}
                    </p>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  v{appVersion}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3">
          <motion.button
            onClick={() => setCollapsed(!collapsed)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`
              w-full flex items-center justify-center gap-2 px-3 py-2
              rounded-lg text-muted-foreground hover:text-foreground
              transition-all duration-200 relative overflow-hidden group
            `}
            title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            <motion.div
              className="absolute inset-0 bg-accent/50"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <AnimatePresence mode="wait">
              {collapsed ? (
                <motion.div
                  key="collapsed"
                  initial={{ rotate: -180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 180, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="relative z-10"
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 relative z-10"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span className="text-sm font-medium">{t('sidebar.collapse')}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
