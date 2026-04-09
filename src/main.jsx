import React from 'react';
import ReactDOM from 'react-dom/client';
import PostPilotApp from './App.jsx';
import { initSentry } from './config/sentry.js';
import './index.css';

// Initialize error tracking before mounting the app
initSentry();

// Sanitize a string for safe insertion into innerHTML (prevents XSS in error screens)
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

window.onerror = (msg, src, line, _col, err) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;background:#1e1e1e;color:#f87171;min-height:100vh">
    <h2>App Crash</h2>
    <p><b>${esc(msg)}</b></p>
    <p>${esc(src)} line ${esc(line)}</p>
    <pre style="white-space:pre-wrap;font-size:12px">${esc(err?.stack || '')}</pre>
  </div>`;
};

window.onunhandledrejection = (e) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;background:#1e1e1e;color:#f87171;min-height:100vh">
    <h2>Unhandled Promise Rejection</h2>
    <pre style="white-space:pre-wrap;font-size:12px">${esc(e.reason?.stack || String(e.reason ?? ''))}</pre>
  </div>`;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PostPilotApp />
  </React.StrictMode>
);
