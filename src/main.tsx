import '@fontsource-variable/inter';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { pruneCache } from './db';

registerSW({ immediate: true });
void pruneCache();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
