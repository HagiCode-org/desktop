import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from './components/providers/theme-provider';
import { Toaster } from './components/ui/sonner';
import { store } from './store';
import i18n from './i18n';
import App from './App';
import 'driver.js/dist/driver.css';
import './index.css';

const loadingContainer = document.getElementById('loading-container');
const rootElement = document.getElementById('root');

function removeLoadingContainer(): void {
  loadingContainer?.remove();
}

function hideLoadingContainer(): void {
  if (!loadingContainer) {
    return;
  }

  loadingContainer.classList.add('loading-container-hidden');
  loadingContainer.setAttribute('aria-hidden', 'true');
}

if (!rootElement) {
  throw new Error('Renderer root element #root is missing');
}

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Provider store={store}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider defaultTheme="dark" storageKey="hagicode-desktop-theme" attribute="class" enableSystem>
            <App
              onRendererMounted={hideLoadingContainer}
              onShellReady={removeLoadingContainer}
              onBootstrapErrorVisible={hideLoadingContainer}
            />
            <Toaster />
          </ThemeProvider>
        </I18nextProvider>
      </Provider>
    </React.StrictMode>
  );
} catch (error) {
  hideLoadingContainer();
  console.error('[Renderer] Failed to mount Desktop app shell:', error);
  rootElement.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #020617; color: #e2e8f0; font-family: 'Segoe UI', sans-serif;">
      <div style="max-width: 560px; padding: 32px; border: 1px solid rgba(248,113,113,0.35); border-radius: 24px; background: rgba(15,23,42,0.96);">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Desktop shell failed to mount</h1>
        <p style="margin: 0; color: #cbd5e1;">Open the Desktop logs folder from the system log location and reload the application after the renderer error is resolved.</p>
      </div>
    </div>
  `;
}
