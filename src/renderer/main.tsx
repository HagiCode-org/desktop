import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from './components/ui/sonner';
import { store } from './store';
import i18n from './i18n';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <App />
        <Toaster />
      </I18nextProvider>
    </Provider>
  </React.StrictMode>
);
