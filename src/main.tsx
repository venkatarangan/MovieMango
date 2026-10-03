import '@fontsource-variable/inter';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { pruneCache } from './db';
import { startSync } from './sync/sync';

registerSW({ immediate: true });
void pruneCache();
void startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
