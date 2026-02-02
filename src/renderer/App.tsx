import { useState, useEffect } from 'react';

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
    };
  }
}

type ServerStatus = 'running' | 'stopped' | 'error';

function App() {
  const [version, setVersion] = useState<string>('');
  const [serverStatus, setServerStatus] = useState<ServerStatus>('stopped');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get app version
    window.electronAPI.getAppVersion().then(setVersion);

    // Get initial server status
    window.electronAPI.getServerStatus().then((status) => {
      setServerStatus(status);
      setLoading(false);
    });

    // Listen for server status changes
    const unsubscribe = window.electronAPI.onServerStatusChange((status) => {
      setServerStatus(status);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleStartServer = async () => {
    const success = await window.electronAPI.startServer();
    if (success) {
      setServerStatus('running');
    }
  };

  const handleStopServer = async () => {
    const success = await window.electronAPI.stopServer();
    if (success) {
      setServerStatus('stopped');
    }
  };

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'text-green-500';
      case 'stopped':
        return 'text-gray-500';
      case 'error':
        return 'text-red-500';
    }
  };

  const getStatusText = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'stopped':
        return 'Stopped';
      case 'error':
        return 'Error';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/30">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Hagico Desktop
          </h1>
          {version && (
            <p className="text-gray-400 flex items-center justify-center gap-2">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Version {version} - Running Successfully
            </p>
          )}
        </div>

        {/* Server Status Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-gray-700 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Server Status
          </h2>
          {loading ? (
            <div className="flex items-center gap-3 text-gray-400">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <p>Loading server status...</p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full ${
                  serverStatus === 'running' ? 'bg-green-500 animate-pulse' :
                  serverStatus === 'stopped' ? 'bg-gray-500' :
                  'bg-red-500 animate-pulse'
                }`}></div>
                <div>
                  <div className={`text-2xl font-bold ${getStatusColor(serverStatus)}`}>
                    {getStatusText(serverStatus)}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {serverStatus === 'running' ? 'Server is operational' :
                     serverStatus === 'stopped' ? 'Server is not running' :
                     'Failed to connect to server'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {serverStatus === 'stopped' || serverStatus === 'error' ? (
                  <button
                    onClick={handleStartServer}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg transition-all shadow-lg hover:shadow-green-500/25 flex items-center gap-2 font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start Server
                  </button>
                ) : (
                  <button
                    onClick={handleStopServer}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-lg hover:shadow-red-500/25 flex items-center gap-2 font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Stop Server
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-semibold">Quick Start</h3>
            </div>
            <p className="text-sm text-gray-400">Configure your server settings and start managing your Hagico instance.</p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="font-semibold">Secure</h3>
            </div>
            <p className="text-sm text-gray-400">Built with security in mind. Your data stays on your machine.</p>
          </div>
        </div>

        {/* Settings Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
              <span className="text-gray-300">Server Host</span>
              <code className="text-sm bg-gray-700 px-3 py-1 rounded">localhost</code>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
              <span className="text-gray-300">Server Port</span>
              <code className="text-sm bg-gray-700 px-3 py-1 rounded">3000</code>
            </div>
            <p className="text-sm text-gray-500 mt-4">More settings coming soon...</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>© 2025 Hagico Desktop. Built with ❤️ using Electron + React + TypeScript.</p>
          <p className="mt-2 text-xs">Test application - Development build</p>
        </div>
      </div>
    </div>
  );
}

export default App;
