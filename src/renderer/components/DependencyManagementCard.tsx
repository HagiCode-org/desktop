import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectDependencies,
  selectDependenciesLoading,
  selectDependencyInstalling,
  DependencyType,
} from '../store/slices/dependencySlice';

declare global {
  interface Window {
    electronAPI: {
      checkDependencies: () => Promise<any[]>;
      installDependency: (type: DependencyType) => Promise<boolean>;
    };
  }
}

function DependencyManagementCard() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const dependencies = useSelector(selectDependencies);
  const loading = useSelector(selectDependenciesLoading);
  const installing = useSelector(selectDependencyInstalling);

  useEffect(() => {
    // Fetch dependencies on mount
    dispatch({ type: 'dependency/fetchDependencies' });
  }, [dispatch]);

  const handleRefresh = () => {
    dispatch({ type: 'dependency/fetchDependencies' });
  };

  const handleInstall = (dependencyType: DependencyType) => {
    dispatch({ type: 'dependency/installDependency', payload: dependencyType });
  };

  const handleDownload = (downloadUrl: string) => {
    window.open(downloadUrl, '_blank');
  };

  const getStatusIcon = (item: any) => {
    if (item.installed && !item.versionMismatch) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    } else if (item.installed && item.versionMismatch) {
      return (
        <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    } else {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
  };

  const getStatusText = (item: any) => {
    if (item.installed && !item.versionMismatch) {
      return t('dependencyManagement.status.installed');
    } else if (item.installed && item.versionMismatch) {
      return t('dependencyManagement.status.versionMismatch');
    } else {
      return t('dependencyManagement.status.notInstalled');
    }
  };

  const getStatusColor = (item: any) => {
    if (item.installed && !item.versionMismatch) {
      return 'text-green-500';
    } else if (item.installed && item.versionMismatch) {
      return 'text-yellow-500';
    } else {
      return 'text-red-500';
    }
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-gray-700 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          {t('dependencyManagement.title')}
        </h2>
        <button
          onClick={handleRefresh}
          disabled={loading || installing}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('dependencyManagement.actions.refresh')}
        >
          <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <p className="text-gray-400 text-sm mb-4">
        {t('dependencyManagement.description')}
      </p>

      {loading && dependencies.length === 0 ? (
        <div className="flex items-center gap-3 text-gray-400">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          <p>{t('dependencyManagement.status.checking')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dependencies.map((item, index) => (
            <div key={index} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(item)}
                  <div>
                    <h3 className="font-semibold text-white">{item.name}</h3>
                    <p className={`text-sm ${getStatusColor(item)}`}>
                      {getStatusText(item)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-gray-400 mb-3">
                {item.version && (
                  <div>
                    <span className="text-gray-500">{t('dependencyManagement.details.currentVersion')}:</span>{' '}
                    <span className="text-gray-300">{item.version}</span>
                  </div>
                )}
                {item.requiredVersion && (
                  <div>
                    <span className="text-gray-500">{t('dependencyManagement.details.requiredVersion')}:</span>{' '}
                    <span className="text-gray-300">{`>= ${item.requiredVersion}`}</span>
                  </div>
                )}
              </div>

              {item.description && (
                <p className="text-sm text-gray-500 mb-3">{item.description}</p>
              )}

              {!item.installed || item.versionMismatch ? (
                <div className="flex gap-2">
                  {item.installCommand && (
                    <button
                      onClick={() => handleInstall(item.type)}
                      disabled={installing}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
                    >
                      {installing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
                  {item.downloadUrl && (
                    <button
                      onClick={() => handleDownload(item.downloadUrl)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {t('dependencyManagement.actions.visitWebsite')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm text-green-500 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('dependencyManagement.status.ready')}
                </div>
              )}
            </div>
          ))}

          {dependencies.length === 0 && !loading && (
            <div className="text-center text-gray-500 py-8">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p>{t('dependencyManagement.noDependencies')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DependencyManagementCard;
