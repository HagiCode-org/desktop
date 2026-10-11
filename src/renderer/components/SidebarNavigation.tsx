import { useEffect, useMemo, useState, type ComponentType, type ReactElement } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useTheme } from '@/components/providers/theme-provider';
import {
  AlertCircle,
  BadgeCheck,
  Calculator,
  Cpu,
  ExternalLink,
  Globe as GlobeIcon,
  Info,
  Layers,
  LayoutDashboard,
  LoaderCircle,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { DistributionModeState } from '../../types/distribution-mode';
import type { DesktopVersionInfoPayload } from '../../types/version-info';
import { useSidebarLayout } from '../hooks/useSidebarLayout';
import { isDesktopTheme } from '../lib/desktop-theme';
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
import { cn } from '../lib/utils';

type NavigationEmphasis = 'default' | 'sponsor' | 'turboengine';

interface NavigationItem {
  id: ViewType | 'official-website' | 'cost-calculator';
  labelKey: string;
  descriptionKey?: string;
  icon: ComponentType<{ className?: string }>;
  url?: string;
  emphasis: NavigationEmphasis;
}

const primaryNavigationItems: NavigationItem[] = [
  { id: 'system', labelKey: 'sidebar.dashboard', icon: LayoutDashboard, emphasis: 'default' },
  { id: 'version', labelKey: 'sidebar.versionManagement', icon: Layers, emphasis: 'default' },
  { id: 'diagnostic', labelKey: 'sidebar.diagnostic', icon: Stethoscope, emphasis: 'default' },
  { id: 'dependency-management', labelKey: 'sidebar.dependencyManagement', icon: PackageOpen, emphasis: 'default' },
];

const settingsNavigationItem: NavigationItem = {
  id: 'settings',
  labelKey: 'sidebar.settings',
  icon: Settings,
  emphasis: 'default',
};

const officialWebsiteItem: NavigationItem = {
  id: 'official-website',
  labelKey: 'navigation.officialWebsite',
  descriptionKey: 'navigation.officialWebsiteDesc',
  icon: GlobeIcon,
  url: 'https://hagicode.com/',
  emphasis: 'default',
};

const subscriptionNavigationItem: NavigationItem = {
  id: 'subscription',
  labelKey: 'sidebar.subscription',
  icon: BadgeCheck,
  emphasis: 'sponsor',
};

const turboEngineNavigationItem: NavigationItem = {
  id: 'turboengine',
  labelKey: 'sidebar.turboEngine',
  icon: Cpu,
  emphasis: 'turboengine',
};

const featuredNavigationItems: NavigationItem[] = [
  subscriptionNavigationItem,
  turboEngineNavigationItem,
];

const remainingExternalLinkItems: NavigationItem[] = [
  {
    id: 'cost-calculator',
    labelKey: 'navigation.costCalculator',
    url: 'https://cost.hagicode.com',
    icon: Calculator,
    emphasis: 'default',
  },
];

interface SidebarNavigationProps {
  distributionState: DistributionModeState;
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

function getFeaturedNavigationPalette(
  emphasis: Exclude<NavigationEmphasis, 'default'>,
  isDarkTheme: boolean,
) {
  if (emphasis === 'sponsor') {
    return {
      button: 'text-foreground hover:bg-transparent',
      iconClass: isDarkTheme
        ? 'text-[#f1cb71] drop-shadow-[0_0_14px_rgba(241,203,113,0.38)] transition-all duration-300 group-hover:scale-110 group-hover:text-[#ffe09a]'
        : 'text-[#6e4304] transition-all duration-300 group-hover:scale-110 group-hover:text-[#4d2d00]',
      activeIconClass: isDarkTheme ? 'text-[#ffe8b8]' : 'text-[#4d2d00]',
      labelClass: isDarkTheme
        ? 'bg-[linear-gradient(90deg,#f7d882,#fff1c8,#e0a93a)] bg-clip-text text-transparent'
        : 'bg-[linear-gradient(90deg,#a06b18_0%,#171717_48%,#171717_52%,#a06b18_100%)] bg-clip-text text-transparent',
      activeLabelClass: isDarkTheme
        ? 'bg-[linear-gradient(90deg,#ffe5a2,#fff6da,#f0bb52)] bg-clip-text text-transparent'
        : 'bg-[linear-gradient(90deg,#7d4f0d_0%,#050505_48%,#050505_52%,#7d4f0d_100%)] bg-clip-text text-transparent',
      focus: 'focus-visible:ring-[#f0cf80]/45',
    };
  }

  return {
    button: 'text-foreground hover:bg-transparent',
    iconClass: isDarkTheme
      ? 'text-[#ffbe57] drop-shadow-[0_0_14px_rgba(255,190,87,0.38)] transition-all duration-300 group-hover:scale-110 group-hover:text-[#ffd48c]'
      : 'text-[#8a4300] transition-all duration-300 group-hover:scale-110 group-hover:text-[#682700]',
    activeIconClass: isDarkTheme ? 'text-[#ffe0a2]' : 'text-[#682700]',
    labelClass: isDarkTheme
      ? 'bg-[linear-gradient(90deg,#ffca6e,#ffe6a8,#e89b2f)] bg-clip-text text-transparent'
      : 'bg-[linear-gradient(90deg,#b46112_0%,#171717_48%,#171717_52%,#b46112_100%)] bg-clip-text text-transparent',
    activeLabelClass: isDarkTheme
      ? 'bg-[linear-gradient(90deg,#ffe0a2,#fff0c8,#f5b246)] bg-clip-text text-transparent'
      : 'bg-[linear-gradient(90deg,#8b4308_0%,#050505_48%,#050505_52%,#8b4308_100%)] bg-clip-text text-transparent',
    focus: 'focus-visible:ring-[#ffc86b]/45',
  };
}

// The left inset centres the 18px icon in the 64px rail. The right inset is only kept
// symmetrical there; when expanded it shrinks to give long labels more room. Rows are a minimum
// height, not a fixed one, so a label that still does not fit (ru-RU, ja-JP) wraps instead of being cut.
const NAV_ROW_CLASS =
  'group relative flex min-h-10 w-full items-center gap-3 overflow-hidden rounded-lg py-1.5 pl-[15px] text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2';

/** Collapsed rows only show an icon, so the label moves into a tooltip. */
function CollapsedTooltip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactElement;
}) {
  if (!enabled) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function SidebarNavigation({ distributionState }: SidebarNavigationProps) {
  const { t, i18n } = useTranslation('common');
  const { resolvedTheme } = useTheme();
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const activeTheme = isDesktopTheme(resolvedTheme) ? resolvedTheme : 'light';
  const isDarkTheme = activeTheme === 'dark';
  const isFusionMode = distributionState.fusionMode;
  const visibleNavigationItems = useMemo(() => {
    const baseItems = isFusionMode
      ? primaryNavigationItems.filter((item) => item.id !== 'version')
      : primaryNavigationItems;

    return [...baseItems, ...featuredNavigationItems, settingsNavigationItem];
  }, [isFusionMode]);
  // Settings is pinned to the footer, so the scrolling list only holds the other two groups.
  const workspaceItems = visibleNavigationItems.filter(
    (item) => item.emphasis === 'default' && item.id !== settingsNavigationItem.id,
  );
  const featuredItems = visibleNavigationItems.filter((item) => item.emphasis !== 'default');
  const aboutLocale = useMemo(
    () => normalizeSidebarAboutLocale(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const bundledAboutModel = useMemo(() => loadBundledSidebarAbout(aboutLocale), [aboutLocale]);

  const { collapsed, toggleCollapsed } = useSidebarLayout();
  const [versionInfo, setVersionInfo] = useState<DesktopVersionInfoPayload | null>(null);
  const [webVersion, setWebVersion] = useState<string | null>(null);
  const [aboutModel, setAboutModel] = useState<SidebarAboutModel | null>(bundledAboutModel);
  const [aboutFetchState, setAboutFetchState] = useState<SidebarAboutFetchState>(
    createLoadingSidebarAboutFetchState(),
  );
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const nextVersionInfo = typeof window.electronAPI.getVersionInfo === 'function'
          ? await window.electronAPI.getVersionInfo()
          : {
              desktopVersion: await window.electronAPI.getAppVersion(),
              windowsStoreVersion: null,
            };

        setVersionInfo(nextVersionInfo);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };

    void fetchVersion();
  }, []);

  useEffect(() => {
    if (!isFusionMode) {
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
  }, [isFusionMode]);

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
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleCollapsed]);

  const resolvedWebVersion = webVersion && webVersion !== 'unknown'
    ? webVersion
    : t('sidebar.unknownVersion');
  const appVersion = versionInfo?.desktopVersion ?? '';
  const windowsStoreVersion = versionInfo?.windowsStoreVersion ?? null;

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
  const collapseLabel = collapsed ? t('sidebar.expand') : t('sidebar.collapse');
  const navRowClass = cn(NAV_ROW_CLASS, collapsed ? 'pr-[15px]' : 'pr-2');

  const renderNavItem = (item: NavigationItem) => {
    const Icon = item.icon;
    const isActive = isNavActive(item);
    const featuredPalette = item.emphasis === 'default'
      ? null
      : getFeaturedNavigationPalette(item.emphasis, isDarkTheme);
    const isFeatured = featuredPalette !== null;
    const label = t(item.labelKey);

    return (
      <CollapsedTooltip key={item.id} label={label} enabled={collapsed}>
        <motion.button
          type="button"
          onClick={() => void handleNavClick(item)}
          aria-label={collapsed ? label : undefined}
          aria-current={isActive ? 'page' : undefined}
          whileHover={isFeatured ? { x: 0, y: -2 } : { x: 0 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            navRowClass,
            isActive
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            isFeatured
              ? cn(featuredPalette?.button, featuredPalette?.focus)
              : 'focus-visible:ring-primary/35',
          )}
        >
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isFeatured
                ? cn(
                  featuredPalette?.iconClass,
                  isActive && featuredPalette?.activeIconClass,
                )
                : isActive && 'text-primary',
            )}
          />

          {!collapsed ? (
            <span
              className={cn(
                'min-w-0 flex-1 break-words leading-5',
                isFeatured
                  ? cn(
                    'font-semibold tracking-[0.01em]',
                    featuredPalette?.labelClass,
                    isActive && featuredPalette?.activeLabelClass,
                  )
                  : 'font-medium',
              )}
            >
              {label}
            </span>
          ) : null}
        </motion.button>
      </CollapsedTooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen min-h-0 flex-col border-r border-border/80 bg-sidebar/92 backdrop-blur-sm',
          'transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-border/80',
            collapsed ? 'justify-center px-2' : 'gap-3 px-4',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted text-foreground">
            <span className="text-base font-semibold">H</span>
          </div>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-sm font-semibold text-foreground">Hagicode</h1>
              <p className="text-xs text-muted-foreground">Desktop</p>
            </div>
          ) : null}
        </div>

        {/*
          The whole list scrolls as one region between the pinned header and footer, so no row can end up
          hidden behind the footer on a short window. The inset lives inside the viewport so focus rings
          are not clipped, and the viewport's inner table wrapper is made a block so wide content
          (official card, about icons) is laid out against the sidebar width instead of widening past it.
        */}
        <nav className="min-h-0 flex-1">
          <ScrollArea
            className="h-full"
            type="auto"
            scrollBarClassName="w-1.5 p-0.5"
            scrollThumbClassName="bg-border/65"
            viewportClassName="[&>div]:block!"
          >
            <div className="px-2 py-3">
              <div className="space-y-0.5">{workspaceItems.map(renderNavItem)}</div>

              {featuredItems.length > 0 ? (
                <>
                  <div role="separator" className="mx-2 my-2 border-t border-border/70" />
                  <div className="space-y-0.5">{featuredItems.map(renderNavItem)}</div>
                </>
              ) : null}

              <div role="separator" className="mx-2 my-2 border-t border-border/70" />

              <div className="space-y-2">
                <CollapsedTooltip label={t(officialWebsiteItem.labelKey)} enabled={collapsed}>
                  <motion.button
                    type="button"
                    onClick={() => void handleNavClick(officialWebsiteItem)}
                    title={collapsed ? undefined : t(officialWebsiteItem.descriptionKey ?? '')}
                    aria-label={collapsed ? t(officialWebsiteItem.labelKey) : undefined}
                    whileTap={{ scale: 0.98 }}
                    className={collapsed
                      ? cn(navRowClass, 'text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-primary/35')
                      : 'group relative w-full overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35'}
                  >
                    <div className={collapsed ? 'flex items-center' : 'flex items-start gap-3'}>
                      <div className={collapsed
                        ? 'flex shrink-0 items-center justify-center'
                        : 'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80'}>
                        <OfficialWebsiteIcon className={collapsed ? 'h-[18px] w-[18px]' : 'h-5 w-5 text-foreground'} />
                      </div>

                      {!collapsed ? (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                              {t(officialWebsiteItem.labelKey)}
                            </p>
                            <ExternalLink className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {t(officialWebsiteItem.descriptionKey ?? '')}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </motion.button>
                </CollapsedTooltip>

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

                {remainingExternalLinkItems.map((item) => {
                  const Icon = item.icon;
                  const label = t(item.labelKey);

                  return (
                    <CollapsedTooltip key={item.id} label={label} enabled={collapsed}>
                      <motion.button
                        type="button"
                        onClick={() => void handleNavClick(item)}
                        title={item.descriptionKey ? t(item.descriptionKey) : undefined}
                        aria-label={collapsed ? label : undefined}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          navRowClass,
                          'text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-primary/35',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed ? (
                          <>
                            <span className="min-w-0 flex-1 break-words font-medium leading-5">{label}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
                          </>
                        ) : null}
                      </motion.button>
                    </CollapsedTooltip>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </nav>

        <div className="shrink-0 border-t border-border bg-background">
          <div className="px-2 pt-2">{renderNavItem(settingsNavigationItem)}</div>

          {!collapsed && appVersion ? (
            <div className={isFusionMode ? 'flex items-start gap-2 px-4 py-2' : 'flex items-center gap-2 px-4 py-1.5'}>
              <Info className={`h-4 w-4 shrink-0 text-muted-foreground ${isFusionMode ? 'mt-0.5' : ''}`} />
              {isFusionMode ? (
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('sidebar.desktopVersion')}
                    </p>
                    <p className="break-all text-xs text-foreground">
                      {appVersion}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('sidebar.webVersion')}
                    </p>
                    <p className="break-all text-xs text-foreground">
                      {resolvedWebVersion}
                    </p>
                  </div>
                  {windowsStoreVersion ? (
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        {t('sidebar.windowsStoreVersion')}
                      </p>
                      <p className="break-all text-xs text-foreground">
                        {windowsStoreVersion}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  v{appVersion}
                </span>
              )}
            </div>
          ) : null}

          <div
            className={cn(
              'flex gap-2 p-2',
              collapsed ? 'flex-col items-center' : 'items-center px-3',
            )}
          >
            <LanguageToggle />
            <ThemeToggle />
            <CollapsedTooltip label={collapseLabel} enabled={collapsed}>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapseLabel}
                aria-expanded={!collapsed}
                title={collapsed ? undefined : collapseLabel}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                  !collapsed && 'ml-auto',
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-[18px] w-[18px]" />
                ) : (
                  <PanelLeftClose className="h-[18px] w-[18px]" />
                )}
              </button>
            </CollapsedTooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
