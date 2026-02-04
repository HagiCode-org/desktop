import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

interface WebViewProps {
  src: string;
}

export default function WebView({ src }: WebViewProps) {
  const { t } = useTranslation('common');
  const webViewRef = useRef<Electron.WebviewTag>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const webServiceStatus = useSelector((state: RootState) => state.webService.status);

  useEffect(() => {
    const webView = webViewRef.current;

    if (!webView) return;

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleLoadStop = () => {
      setIsLoading(false);
    };

    const handleDidFinishLoad = () => {
      setIsLoading(false);
      setError(null);
    };

    const handleDidFailLoad = (event: any) => {
      if (event.isTopLevel) {
        setIsLoading(false);
        setError(t('webView.loadFailed', { reason: event.errorDescription || 'Unknown error' }));
      }
    };

    const handleCrashed = () => {
      setIsLoading(false);
      setError(t('webView.crashed'));
    };

    webView.addEventListener('did-start-loading', handleLoadStart);
    webView.addEventListener('did-stop-loading', handleLoadStop);
    webView.addEventListener('did-finish-load', handleDidFinishLoad);
    webView.addEventListener('did-fail-load', handleDidFailLoad);
    webView.addEventListener('crashed', handleCrashed);

    // Listen for navigation commands from menu
    const handleNavigate = (event: any, direction: 'back' | 'forward' | 'refresh') => {
      if (!webView) return;

      switch (direction) {
        case 'back':
          if (canGoBack) webView.goBack();
          break;
        case 'forward':
          if (canGoForward) webView.goForward();
          break;
        case 'refresh':
          webView.reload();
          break;
      }
    };

    const handleDevTools = () => {
      if (webView) {
        webView.openDevTools();
      }
    };

    window.addEventListener('webview-navigate', handleNavigate);
    window.addEventListener('webview-devtools', handleDevTools);

    return () => {
      webView.removeEventListener('did-start-loading', handleLoadStart);
      webView.removeEventListener('did-stop-loading', handleLoadStop);
      webView.removeEventListener('did-finish-load', handleDidFinishLoad);
      webView.removeEventListener('did-fail-load', handleDidFailLoad);
      webView.removeEventListener('crashed', handleCrashed);
      window.removeEventListener('webview-navigate', handleNavigate);
      window.removeEventListener('webview-devtools', handleDevTools);
    };
  }, [canGoBack, canGoForward, t]);

  const handleNavigateBack = () => {
    const webView = webViewRef.current;
    if (webView && canGoBack) {
      webView.goBack();
    }
  };

  const handleNavigateForward = () => {
    const webView = webViewRef.current;
    if (webView && canGoForward) {
      webView.goForward();
    }
  };

  const handleRefresh = () => {
    const webView = webViewRef.current;
    if (webView) {
      webView.reload();
    }
  };

  const handleOpenInBrowser = () => {
    const { shell } = require('electron');
    shell.openExternal(src);
  };

  // Show service not running message
  if (webServiceStatus !== 'running') {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700 shadow-xl max-w-md">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">{t('webView.serviceNotRunning')}</h2>
            <p className="text-gray-400 mb-6">{t('webView.serviceNotRunningDesc')}</p>
            <button
              onClick={() => window.electronAPI.switchView('system')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-lg hover:shadow-blue-500/25 font-medium"
            >
              {t('webView.backToSystem')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Navigation Toolbar */}
      <div className="bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleNavigateBack}
            disabled={!canGoBack}
            className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title={t('webView.back')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNavigateForward}
            disabled={!canGoForward}
            className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title={t('webView.forward')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title={t('webView.refresh')}
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex-1 bg-gray-900/50 rounded-lg px-4 py-2">
          <div className="text-sm text-gray-400 font-mono">{src}</div>
        </div>

        <button
          onClick={handleOpenInBrowser}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all flex items-center gap-2 text-sm"
          title={t('webView.openInBrowser')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          {t('webView.openInBrowser')}
        </button>
      </div>

      {/* WebView Container */}
      <div className="flex-1 relative">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700 shadow-xl max-w-md">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-2">{t('webView.error')}</h2>
                <p className="text-gray-400 mb-6">{error}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRefresh}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-lg hover:shadow-blue-500/25 font-medium"
                  >
                    {t('webView.retry')}
                  </button>
                  <button
                    onClick={() => window.electronAPI.switchView('system')}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all font-medium"
                  >
                    {t('webView.backToSystem')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <webview
          ref={webViewRef}
          src={src}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
          // Security settings
          nodeintegration="false"
          contextisolation="true"
          partition="persist:webview"
          disablewebsecurity="false"
        />
      </div>
    </div>
  );
}
