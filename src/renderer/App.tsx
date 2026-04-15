import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import SidebarNavigation from './components/SidebarNavigation';
import SystemManagementView from './components/SystemManagementView';
import SystemDiagnosticPage from './components/SystemDiagnosticPage';
import WebView from './components/WebView';
import VersionManagementPage from './components/VersionManagementPage';
import SettingsPage from './components/SettingsPage';
import InstallConfirmDialog from './components/InstallConfirmDialog';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import { switchView } from './store/slices/viewSlice';
import { restartOnboardingFlow } from './store/slices/onboardingSlice';
import { selectWebServiceInfo } from './store/slices/webServiceSlice';
import type { RootState } from './store';
import type { AgentCliType } from '../types/agent-cli';
import { buildAccessUrl, DEFAULT_WEB_SERVICE_HOST, DEFAULT_WEB_SERVICE_PORT } from '../types/web-service-network';
import type { DistributionMode } from '../types/distribution-mode';

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      getDistributionMode: () => Promise<DistributionMode>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      onServerStatusChange: (callback: (status: 'running' | 'stopped' | 'error') => void) => void;
      startServer: () => Promise<boolean>;
      stopServer: () => Promise<boolean>;
      getServerStatus: () => Promise<'running' | 'stopped' | 'error'>;
      switchView: (view: 'system' | 'web' | 'version' | 'diagnostic' | 'settings') => Promise<{ success: boolean; reason?: string; url?: string }>;
      getCurrentView: () => Promise<string>;
      onViewChange: (callback: (view: 'system' | 'web' | 'version' | 'diagnostic' | 'settings') => void) => () => void;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      openHagicodeInApp: (url: string) => Promise<{ success: boolean; error?: string }>;
      onOnboardingSwitchToWeb: (callback: (data: { versionId: string }) => void) => () => void;
      onOnboardingOpenHagicode: (callback: (data: { url: string; versionId: string }) => void) => () => void;
      resetOnboarding: () => Promise<{ success: boolean; error?: string }>;
      onOnboardingShow: (callback: () => void) => () => void;
      agentCliSave: (data: { cliType: AgentCliType }) => Promise<{ success: boolean }>;
      agentCliLoad: () => Promise<{ cliType: AgentCliType | null; isSkipped: boolean; selectedAt: string | null }>;
      agentCliSkip: () => Promise<{ success: boolean }>;
      agentCliGetSelected: () => Promise<AgentCliType | null>;
    };
  }
}

function App() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const webServiceUrl = useSelector((state: RootState) => state.view.webServiceUrl);
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const fallbackWebServiceUrl = buildAccessUrl(
    webServiceInfo.host || DEFAULT_WEB_SERVICE_HOST,
    webServiceInfo.port || DEFAULT_WEB_SERVICE_PORT
  );
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('normal');
  const [modeLoaded, setModeLoaded] = useState(false);

  useEffect(() => {
    // Listen for view change events from menu (kept for backward compatibility)
    const unsubscribeViewChange = window.electronAPI.onViewChange((view: 'system' | 'web' | 'version' | 'diagnostic' | 'settings') => {
      dispatch(switchView(view));
    });

    // Listen for onboarding show event
    const unsubscribeOnboardingShow = window.electronAPI.onOnboardingShow(() => {
      dispatch(restartOnboardingFlow());
    });

    // Listen for onboarding completion - open Hagicode
    const unsubscribeOnboardingOpenHagicode = window.electronAPI.onOnboardingOpenHagicode(async (data) => {
      // Open Hagicode in app window
      try {
        await window.electronAPI.openHagicodeInApp(data.url);
      } catch (error) {
        console.error('[App] Failed to open Hagicode:', error);
      }
    });

    return () => {
      if (typeof unsubscribeViewChange === 'function') {
        unsubscribeViewChange();
      }
      if (typeof unsubscribeOnboardingShow === 'function') {
        unsubscribeOnboardingShow();
      }
      if (typeof unsubscribeOnboardingOpenHagicode === 'function') {
        unsubscribeOnboardingOpenHagicode();
      }
    };
  }, [dispatch]);

  useEffect(() => {
    let disposed = false;

    const loadDistributionMode = async () => {
      try {
        const mode = await window.electronAPI.getDistributionMode();
        if (!disposed) {
          setDistributionMode(mode);
        }
      } catch (error) {
        console.error('[App] Failed to load distribution mode:', error);
        if (!disposed) {
          setDistributionMode('normal');
        }
      } finally {
        if (!disposed) {
          setModeLoaded(true);
        }
      }
    };

    void loadDistributionMode();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (distributionMode === 'steam' && currentView === 'version') {
      dispatch(switchView('system'));
    }
  }, [currentView, dispatch, distributionMode]);

  if (!modeLoaded) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      {/* Sidebar Navigation */}
      <SidebarNavigation distributionMode={distributionMode} />

      {/* Main Content Area */}
      <div className="ml-64 transition-all duration-500 ease-out">
        <div className="container mx-auto px-4 py-8 min-h-screen">
          {currentView === 'system' && <SystemManagementView distributionMode={distributionMode} />}
          {currentView === 'web' && <WebView src={webServiceUrl || fallbackWebServiceUrl} />}
          {currentView === 'version' && <VersionManagementPage distributionMode={distributionMode} />}
          {currentView === 'diagnostic' && <SystemDiagnosticPage />}
          {currentView === 'settings' && <SettingsPage distributionMode={distributionMode} />}
        </div>
      </div>

      {/* Global Dialogs */}
      <InstallConfirmDialog />

      {/* Onboarding Wizard - shown when active */}
      <OnboardingWizard />
    </div>
  );
}

export default App;
