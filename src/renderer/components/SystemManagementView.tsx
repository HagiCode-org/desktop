import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '../hooks/useNavigate';
import { motion, AnimatePresence } from 'motion/react';
import { Package, CheckCircle, AlertCircle, Activity } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'sonner';
import WebServiceStatusCard from './WebServiceStatusCard';
import BlogFeedCard from './BlogFeedCard';
import { selectWebServiceInfo } from '../store/slices/webServiceSlice';
import { resetOnboarding, checkOnboardingTrigger } from '../store/thunks/onboardingThunks';
import type { RootState } from '../store';
import hagicodeIcon from '../assets/hagicode-icon.png';

interface InstalledVersion {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'installed-incomplete';
  dependencies: any[];
  isActive: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      versionGetActive: () => Promise<InstalledVersion | null>;
      onActiveVersionChanged: (callback: (version: InstalledVersion | null) => void) => void;
    };
  }
}

type ServerStatus = 'running' | 'stopped' | 'error';

export default function SystemManagementView() {
  const { t } = useTranslation('common');
  const { navigateTo } = useNavigate();
  const dispatch = useDispatch();
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));

  const [activeVersion, setActiveVersion] = useState<InstalledVersion | null>(null);

  useEffect(() => {
    // Get active version
    window.electronAPI.versionGetActive().then(setActiveVersion);

    // Listen for active version changes
    const unsubscribeVersion = window.electronAPI.onActiveVersionChanged((version) => {
      setActiveVersion(version);
    });

    return () => {
      if (typeof unsubscribeVersion === 'function') {
        unsubscribeVersion();
      }
    };
  }, []);

  // Get server status from Redux store
  const serverStatus: ServerStatus =
    webServiceInfo.status === 'starting' || webServiceInfo.status === 'stopping'
      ? 'running'
      : webServiceInfo.status;

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'text-primary';
      case 'stopped':
        return 'text-muted-foreground';
      case 'error':
        return 'text-destructive';
    }
  };

  const getStatusText = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return t('status.running');
      case 'stopped':
        return t('status.stopped');
      case 'error':
        return t('status.error');
    }
  };

  const getStatusBgColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'bg-primary';
      case 'stopped':
        return 'bg-muted-foreground';
      case 'error':
        return 'bg-destructive';
    }
  };

  const getStatusGlowColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'shadow-primary/50';
      case 'stopped':
        return 'shadow-muted-foreground/30';
      case 'error':
        return 'shadow-destructive/50';
    }
  };

  const handleStartWizard = async () => {
    try {
      // Reset onboarding state to allow it to show again
      await dispatch(resetOnboarding()).unwrap();
      // Check trigger condition to activate onboarding
      const result = await dispatch(checkOnboardingTrigger()).unwrap();
      if (result.shouldShow) {
        toast.success(t('versionManagement.toast.onboardingStarted'));
      } else {
        toast.error(t('versionManagement.toast.onboardingFailed') + `: ${result.reason || 'Unknown reason'}`);
      }
    } catch (error) {
      console.error('Failed to start onboarding:', error);
      toast.error(t('versionManagement.toast.onboardingFailed'));
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center mb-12"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-4"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-linear-to-br from-primary to-primary/70 rounded-2xl mb-4 shadow-lg shadow-primary/30 relative overflow-hidden">
            <motion.div
              animate={{
                background: [
                  'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
                  'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.15) 0%, transparent 50%)',
                  'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0"
            />
            <img src={hagicodeIcon} alt="Hagicode" className="w-12 h-12 relative z-10" />
          </div>
        </motion.div>

        {/* Service Status Indicator */}
        <AnimatePresence mode="wait">
          <motion.div
            key={serverStatus}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              className={`
                inline-flex items-center gap-3 px-6 py-3 rounded-full
                shadow-lg ${getStatusGlowColor(serverStatus)}
                border border-border/50
                backdrop-blur-sm
                cursor-pointer transition-all
                ${serverStatus === 'running' ? 'bg-primary/10' :
                  serverStatus === 'error' ? 'bg-destructive/10' :
                  'bg-muted/50'}
              `}
            >
              <motion.div
                animate={
                  serverStatus === 'running' ? {
                    scale: [1, 1.1, 1],
                    opacity: [1, 0.8, 1],
                  } : {}
                }
                transition={{ duration: 2, repeat: Infinity }}
                className={`
                  w-3 h-3 rounded-full ${getStatusBgColor(serverStatus)}
                  ${serverStatus === 'running' ? 'shadow-lg shadow-primary/50' : ''}
                `}
              />
              <Activity className={`w-4 h-4 ${serverStatus === 'running' ? 'text-primary' : serverStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
              <span className={`font-semibold ${serverStatus === 'running' ? 'text-primary' : serverStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {getStatusText(serverStatus)}
              </span>
              {serverStatus === 'running' && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-primary/70 ml-1"
                >
                  • Hagicode 服务在线
                </motion.span>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Embedded Web Service Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <WebServiceStatusCard />
      </motion.div>

      {/* Blog Feed Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="mt-6"
      >
        <BlogFeedCard />
      </motion.div>

      {/* Active Version Card */}
      <AnimatePresence>
        {activeVersion && (
          <motion.div
            key="version-card"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-6 bg-card rounded-xl p-6 border border-border relative overflow-hidden group"
          >
            {/* Subtle gradient background */}
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <motion.h2
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-xl font-semibold flex items-center gap-2"
                >
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                  >
                    <Package className="w-6 h-6 text-primary" />
                  </motion.div>
                  {t('common.version')}
                </motion.h2>
                <motion.button
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => navigateTo('version')}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.95 }}
                  className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                >
                  管理版本
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
                  >
                    →
                  </motion.span>
                </motion.button>
              </div>

              <div className="space-y-3">
                {[
                  { label: '版本', value: activeVersion.packageFilename },
                  { label: t('common.platform'), value: activeVersion.platform },
                  {
                    label: '安装于',
                    value: new Date(activeVersion.installedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
                  },
                ].map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + index * 0.05 }}
                    whileHover={{ x: 4 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-default"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-medium">{item.value}</span>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                  whileHover={{ x: 4 }}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-default"
                >
                  <span className="text-muted-foreground">状态</span>
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    >
                      <CheckCircle className="w-5 h-5 text-primary" />
                    </motion.div>
                    <span className="text-primary">✅ 就绪</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Version State */}
      <AnimatePresence mode="wait">
        {!activeVersion && (
          <motion.div
            key="no-version"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-6 bg-card rounded-xl p-8 border border-border text-center relative overflow-hidden"
          >
            {/* Animated background elements */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute inset-0 bg-linear-to-br from-primary/10 to-transparent"
            />

            <div className="relative z-10">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center"
                >
                  <Package className="w-8 h-8 text-muted-foreground" />
                </motion.div>
              </motion.div>

              <motion.h3
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.55 }}
                className="text-lg font-semibold text-foreground mb-2"
              >
                {t('system.noVersionInstalled.title')}
              </motion.h3>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-muted-foreground mb-6"
              >
                {t('system.noVersionInstalled.description')}
              </motion.p>

              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.65 }}
                whileHover={{ scale: 1.05, boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)' }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartWizard}
                className="px-6 py-2.5 bg-linear-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-lg transition-all shadow-lg shadow-primary/20"
              >
                {t('system.noVersionInstalled.startWizard')}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-12 text-center"
      >
        <motion.p
          className="text-muted-foreground text-sm"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          {t('footer.copyright')}
        </motion.p>
        <motion.p
          className="mt-2 text-xs text-muted-foreground/70"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          {t('footer.testBuild')}
        </motion.p>
      </motion.div>
    </div>
  );
}
