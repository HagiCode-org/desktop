import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import SidebarNavigation from './components/SidebarNavigation';
import SystemManagementView from './components/SystemManagementView';
import WebView from './components/WebView';
import VersionManagementPage from './components/VersionManagementPage';
import LicenseManagementPage from './components/LicenseManagementPage';
import InstallConfirmDialog from './components/InstallConfirmDialog';
import DependencyStartConfirmDialog from './components/DependencyStartConfirmDialog';
import { DependencyInstallConfirmDialog } from './components/DependencyInstallConfirmDialog';
import { switchView } from './store/slices/viewSlice';
import type { RootState } from './store';
import { ThemeProvider } from './components/providers/theme-provider';

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      onServerStatusChange: (callback: (status: 'running' | 'stopped' | 'error') => void) => void;
      startServer: () => Promise<boolean>;
      stopServer: () => Promise<boolean>;
      getServerStatus: () => Promise<'running' | 'stopped' | 'error'>;
      switchView: (view: 'system' | 'web' | 'version' | 'license') => Promise<{ success: boolean; reason?: string; url?: string }>;
      getCurrentView: () => Promise<string>;
      onViewChange: (callback: (view: 'system' | 'web' | 'version' | 'license') => void) => () => void;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

function App() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const webServiceUrl = useSelector((state: RootState) => state.view.webServiceUrl);

  useEffect(() => {
    console.log('[App] Setting up view change listener');

    // Listen for view change events from menu (kept for backward compatibility)
    const unsubscribeViewChange = window.electronAPI.onViewChange((view: 'system' | 'web' | 'version' | 'license') => {
      console.log('[App] View change event received:', view);
      dispatch(switchView(view));
    });

    console.log('[App] View change listener set up successfully');

    return () => {
      console.log('[App] Cleaning up view change listener');
      if (typeof unsubscribeViewChange === 'function') {
        unsubscribeViewChange();
      }
    };
  }, [dispatch]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="hagicode-desktop-theme" attribute="class" enableSystem>
      <div className="min-h-screen bg-background text-foreground overflow-hidden">
        {/* Animated background gradient */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        </div>

        {/* Sidebar Navigation */}
        <SidebarNavigation />

        {/* Main Content Area */}
        <div className="ml-64 transition-all duration-500 ease-out">
          <div className="container mx-auto px-4 py-8 min-h-screen">
            {currentView === 'system' && <SystemManagementView />}
            {currentView === 'web' && <WebView src={webServiceUrl || 'http://localhost:36556'} />}
            {currentView === 'version' && <VersionManagementPage />}
            {currentView === 'license' && <LicenseManagementPage />}
          </div>
        </div>

        {/* Global Dialogs */}
        <InstallConfirmDialog />
        <DependencyStartConfirmDialog />
        <DependencyInstallConfirmDialog />
      </div>
    </ThemeProvider>
  );
}

export default App;
