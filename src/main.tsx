import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { inIframe } from './lib/env';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: 홈 화면에 추가하면 앱처럼 열리고, 한 번 연 뒤에는 인터넷 없이도 열림
if (!__SINGLE__ && !inIframe && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
