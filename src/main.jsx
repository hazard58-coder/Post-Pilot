import React from 'react';
import ReactDOM from 'react-dom/client';
import PostPilotApp from './App.jsx';
import './index.css';

window.onerror = (msg, src, line, _col, err) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;background:#1e1e1e;color:#f87171;min-height:100vh">
    <h2>App Crash</h2>
    <p><b>${msg}</b></p>
    <p>${src} line ${line}</p>
    <pre style="white-space:pre-wrap;font-size:12px">${err?.stack || ''}</pre>
  </div>`;
};

window.onunhandledrejection = (e) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;background:#1e1e1e;color:#f87171;min-height:100vh">
    <h2>Unhandled Promise Rejection</h2>
    <pre style="white-space:pre-wrap;font-size:12px">${e.reason?.stack || e.reason}</pre>
  </div>`;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PostPilotApp />
  </React.StrictMode>
);
