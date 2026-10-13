import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/800.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya/500.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya/400-italic.css';
import './theme.css';
import { App } from './App';
import { applyThemeMode } from './themeMode';
import { getLang } from './i18n';
import { listConnections } from './api/connections';
import { removeOrphanRecordings } from './recorder/webStore';

async function start() {
  applyThemeMode();
  // Statusleiste in tinte (Markenhandbuch); nur in der Android-App
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    StatusBar.setBackgroundColor({ color: '#17313b' }).catch(() => undefined);
    StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  }
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { installMockFetch } = await import('./mocks/installMockFetch');
    installMockFetch({ lang: getLang() });
  } else {
    // Musterkampagne „Ohne Server ausprobieren“: ihr Server lebt in der App und muss vor dem ersten Aufruf bereitstehen
    const { restoreMuster } = await import('./api/musterRuntime');
    await restoreMuster().catch(() => undefined);
  }
  // Aufnahmen im Browser, deren Verbindung es nicht mehr gibt, kann niemand mehr hochladen: nicht liegen lassen
  removeOrphanRecordings(listConnections().map((c) => c.id)).catch(() => undefined);
  // Web-Fassung: installierbar auf dem Startbildschirm (Service Worker nur für die eigenen Dateien)
  if (import.meta.env.VITE_DIST === 'web' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

start();
