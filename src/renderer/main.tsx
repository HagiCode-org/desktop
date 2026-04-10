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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider defaultTheme="dark" storageKey="hagicode-desktop-theme" attribute="class" enableSystem>
          <App />
          <Toaster />
        </ThemeProvider>
      </I18nextProvider>
    </Provider>
  </React.StrictMode>
);

// Remove loading container after React app mounts
const loadingContainer = document.getElementById('loading-container');
if (loadingContainer) {
  loadingContainer.remove();
}
