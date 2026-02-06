import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface DependencyCheckResult {
  name: string;
  type: string;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string;
  downloadUrl?: string;
  description?: string;
}

declare global {
  interface Window {
    electronAPI: {
      getPackageDependencies: () => Promise<DependencyCheckResult[]>;
      refreshPackageDependencies: () => Promise<DependencyCheckResult[]>;
      installPackageDependency: (dependencyType: string) => Promise<boolean>;
      onPackageDependenciesUpdated: (callback: (deps: DependencyCheckResult[]) => void) => void;
    };
  }
}

export default function DependencyCheckCard() {
  const { t } = useTranslation('pages');
  const [dependencies, setDependencies] = useState<DependencyCheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    fetchDependencies();

    const unsubscribe = window.electronAPI.onPackageDependenciesUpdated((updatedDeps) => {
      setDependencies(updatedDeps);
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const fetchDependencies = async () => {
    try {
      setLoading(true);
      const deps = await window.electronAPI.getPackageDependencies();
      setDependencies(deps);
    } catch (error) {
      console.error('Failed to fetch dependencies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchDependencies();
  };

  const handleInstall = async (dep: DependencyCheckResult) => {
    if (installing) return;

    try {
      setInstalling(dep.type);
      const success = await window.electronAPI.installPackageDependency(dep.type);

      if (!success) {
        console.error('Failed to install dependency:', dep.name);
      }
    } catch (error) {
      console.error('Error installing dependency:', error);
    } finally {
      setInstalling(null);
    }
  };

  const getStatusBadge = (dep: DependencyCheckResult) => {
    if (dep.installed && !dep.versionMismatch) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-700">
          {t('dependencyManagement.status.installed')}
        </span>
      );
    }

    if (dep.installed && dep.versionMismatch) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-700">
          {t('dependencyManagement.status.versionMismatch')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/50 text-red-400 border border-red-700">
        {t('dependencyManagement.status.notInstalled')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('dependencyManagement.title')}
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (dependencies.length === 0) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('dependencyManagement.title')}
        </h2>
        <div className="text-center py-8 text-gray-400">
          <p>{t('dependencyManagement.noPackageInstalled')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('dependencyManagement.title')}
        </h2>
        <button
          onClick={handleRefresh}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('dependencyManagement.actions.refresh')}
        </button>
      </div>

      <div className="space-y-3">
        {dependencies.map((dep, index) => (
          <div
            key={index}
            className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-200">{dep.name}</h3>
                  {getStatusBadge(dep)}
                </div>
                {dep.description && (
                  <p className="text-sm text-gray-400 mb-1">{dep.description}</p>
                )}
                {dep.version && (
                  <p className="text-xs text-gray-500">
                    {t('dependencyManagement.installedVersion')}: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-green-400">{dep.version}</code>
                  </p>
                )}
                {dep.requiredVersion && (
                  <p className="text-xs text-gray-500">
                    {t('dependencyManagement.requiredVersion')}: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">{dep.requiredVersion}</code>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 ml-4">
                {!dep.installed && dep.installCommand && (
                  <button
                    onClick={() => handleInstall(dep)}
                    disabled={installing === dep.type}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {installing === dep.type ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        {t('dependencyManagement.actions.installing')}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {t('dependencyManagement.actions.install')}
                      </>
                    )}
                  </button>
                )}
                {!dep.installed && dep.downloadUrl && (
                  <a
                    href={dep.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t('dependencyManagement.actions.download')}
                  </a>
                )}
              </div>
            </div>

            {dep.installCommand && !dep.installed && (
              <div className="mt-2 pt-2 border-t border-gray-700/50">
                <code className="text-xs bg-gray-800 px-2 py-1 rounded text-yellow-400 block">
                  {dep.installCommand}
                </code>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
