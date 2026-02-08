import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { switchView } from '../store/slices/viewSlice';
import type { RootState } from '../store';
import type { ViewType } from '../store/slices/viewSlice';
import { ThemeToggle } from './ui/theme-toggle';
import { LanguageToggle } from './ui/language-toggle';

// Lucide 图标
import { Settings, Globe as GlobeIcon, Package, FileText, ChevronLeft, ChevronRight, Users, Star, ExternalLink, Info, Key } from 'lucide-react';

interface NavigationItem {
  id: ViewType | 'official-website' | 'tech-support' | 'github-project';
  labelKey: string;
  descriptionKey?: string;
  icon: React.ComponentType<{ className?: string }>;
  url?: string;
}

const navigationItems: NavigationItem[] = [
  { id: 'system', labelKey: 'sidebar.dashboard', icon: Settings },
  { id: 'version', labelKey: 'sidebar.versionManagement', icon: FileText },
  { id: 'license', labelKey: 'sidebar.licenseManagement', icon: Key },
];

const externalLinkItems: NavigationItem[] = [
  {
    id: 'official-website',
    labelKey: 'navigation.officialWebsite',
    descriptionKey: 'navigation.officialWebsiteDesc',
    icon: GlobeIcon,
    url: 'https://hagicode.com/',
  },
  {
    id: 'tech-support',
    labelKey: 'navigation.techSupport',
    descriptionKey: 'navigation.techSupportDesc',
    icon: Users,
    url: 'https://qm.qq.com/q/FoalgKjYOI',
  },
  {
    id: 'github-project',
    labelKey: 'navigation.githubProject',
    descriptionKey: 'navigation.githubProjectDesc',
    icon: Star,
    url: 'https://github.com/HagiCode-org/site',
  },
];

export default function SidebarNavigation() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);

  // 侧边栏折叠状态
  const [collapsed, setCollapsed] = useState(false);

  // 应用版本号
  const [appVersion, setAppVersion] = useState<string>('');

  // 获取应用版本号
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };
    fetchVersion();
  }, []);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setCollapsed(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleNavClick = async (item: NavigationItem) => {
    // Check if this is an external link
    if (item.url) {
      // Open external link
      try {
        const result = await window.electronAPI.openExternal(item.url);
        if (!result.success) {
          console.error('Failed to open external link:', result.error);
        }
      } catch (error) {
        console.error('Failed to open external link:', error);
      }
      return;
    }

    // Handle view navigation
    const viewId = item.id as ViewType;
    dispatch(switchView(viewId));
  };

  const isNavActive = (item: NavigationItem) => {
    // External links are never active
    if (item.url) return false;
    const viewId = item.id as ViewType;
    return currentView === viewId;
  };

  const isExternalLink = (item: NavigationItem) => {
    return !!item.url;
  };

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen bg-background border-border border-r
        transition-all duration-300 ease-in-out z-40
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Logo 区域 */}
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
                  Hagico
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

      {/* 导航项列表 */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navigationItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = isNavActive(item);

          return (
            <motion.button
              key={item.id}
              onClick={() => handleNavClick(item)}
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
              {/* Active background with gradient */}
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

              {/* Hover background for non-active items */}
              {!isActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-accent/50"
                />
              )}

              {/* Glow effect for active item */}
              {isActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 bg-primary/30 blur-md"
                />
              )}

              {/* Left active indicator */}
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

        {/* 分隔线 */}
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="my-2 border-t border-border"
          />
        )}

        {/* 外部链接菜单项 */}
        {externalLinkItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = isNavActive(item);
          const isExternal = isExternalLink(item);
          const description = item.descriptionKey ? t(item.descriptionKey) : '';

          return (
            <motion.button
              key={item.id}
              onClick={() => handleNavClick(item)}
              title={description}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.3 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className={`
                relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                overflow-hidden group
                ${isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-accent-foreground'
                }
              `}
            >
              {/* Hover background */}
              <motion.div
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-accent/50"
              />

              <Icon className={`w-5 h-5 flex-shrink-0 relative z-10 group-hover:scale-110 transition-transform duration-200`} />

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

              {/* 外部链接指示符 */}
              <AnimatePresence mode="wait">
                {!collapsed && isExternal && (
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

              {/* Tooltip for collapsed state */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                  {t(item.labelKey)}
                </div>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* 底部版本信息和折叠按钮 */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-border">
        {/* 版本信息 */}
        <AnimatePresence mode="wait">
          {!collapsed && appVersion && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Info className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                v{appVersion}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 折叠按钮 */}
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
