import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import SystemManagementView from './components/SystemManagementView';
import WebView from './components/WebView';
import { switchView } from './store/slices/viewSlice';
import type { RootState } from './store';

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
      switchView: (view: 'system' | 'web') => Promise<{ success: boolean; reason?: string; url?: string }>;
      getCurrentView: () => Promise<string>;
      onViewChange: (callback: (view: 'system' | 'web') => void) => () => void;
    };
  }
}

function App() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const webServiceUrl = useSelector((state: RootState) => state.view.webServiceUrl);

  useEffect(() => {
    // Listen for view change events from menu
    const unsubscribeViewChange = window.electronAPI.onViewChange((view: 'system' | 'web') => {
      dispatch(switchView(view));
    });

    return () => {
      if (typeof unsubscribeViewChange === 'function') {
        unsubscribeViewChange();
      }
    };
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {currentView === 'system' && <SystemManagementView />}
      {currentView === 'web' && <WebView src={webServiceUrl || 'http://localhost:36556'} />}
    </div>
  );
}

export default App;
