/**
 * BookLoop Phase 0 Main Application Controller
 */
import { CONFIG } from './config.js';
import { api } from './api.js';
import { themeManager } from './theme.js';
import { router } from './router.js';

class BookLoopApp {
  constructor() {
    this.pollTimer = null;
    this.initElements();
    this.initEventListeners();
    this.initRouting();
  }

  initElements() {
    // Buttons & Toggles
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');
    this.pingBtn = document.getElementById('ping-btn');
    this.testRootBtn = document.getElementById('test-root-btn');
    this.copyDiagBtn = document.getElementById('copy-diag-btn');

    // Status Display Elements
    this.navStatusPill = document.getElementById('nav-status-pill');
    this.navStatusText = document.getElementById('nav-status-text');
    this.navStatusPulse = document.getElementById('nav-status-pulse');

    this.serverStatusVal = document.getElementById('server-status-val');
    this.serverLatencyVal = document.getElementById('server-latency-val');
    this.serverVersionVal = document.getElementById('server-version-val');
    this.serverEnvVal = document.getElementById('server-env-val');

    this.dbStatusPill = document.getElementById('db-status-pill');
    this.dbTargetEngine = document.getElementById('db-target-engine');
    this.dbTargetUrl = document.getElementById('db-target-url');
    this.dbStatusMsg = document.getElementById('db-status-msg');
    this.dbErrorBlock = document.getElementById('db-error-block');
    this.dbErrorText = document.getElementById('db-error-text');

    this.jsonDiagBox = document.getElementById('json-diag-box');
    this.lastCheckedText = document.getElementById('last-checked-text');
    this.toastContainer = document.getElementById('toast-container');
  }

  initEventListeners() {
    // Theme Switcher
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => {
        const newTheme = themeManager.toggle();
        this.updateThemeButton(newTheme);
        this.showToast(`Theme switched to ${newTheme} mode`);
      });
      this.updateThemeButton(themeManager.currentTheme);
    }

    // Interactive Health Ping
    if (this.pingBtn) {
      this.pingBtn.addEventListener('click', async () => {
        this.pingBtn.disabled = true;
        this.pingBtn.innerHTML = `<span>⏳ Checking...</span>`;
        await this.checkHealth();
        this.pingBtn.disabled = false;
        this.pingBtn.innerHTML = `<span>⚡ Ping Backend Now</span>`;
      });
    }

    // Root Endpoint Test
    if (this.testRootBtn) {
      this.testRootBtn.addEventListener('click', async () => {
        const res = await api.getRoot();
        if (res.ok) {
          this.showToast(`Root endpoint connected: ${res.data.project}`);
        } else {
          this.showToast(`Root endpoint error: ${res.error}`, 'error');
        }
      });
    }

    // Copy Diagnostics
    if (this.copyDiagBtn) {
      this.copyDiagBtn.addEventListener('click', () => {
        if (this.jsonDiagBox) {
          navigator.clipboard.writeText(this.jsonDiagBox.innerText);
          this.showToast('Diagnostics copied to clipboard!');
        }
      });
    }
  }

  initRouting() {
    router.register('/', () => {
      // Main foundation view
    });

    // Handle future phase routes gracefully
    const futureRoutes = ['/home', '/discover', '/sell', '/communities', '/profile', '/admin'];
    futureRoutes.forEach(r => {
      router.register(r, () => {
        this.showToast(`Navigated to ${r} (Scheduled for subsequent phases)`);
      });
    });
  }

  updateThemeButton(theme) {
    if (!this.themeToggleBtn) return;
    this.themeToggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    this.themeToggleBtn.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }

  async checkHealth() {
    const res = await api.getHealth();
    this.lastCheckedText.innerText = `Last ping: ${new Date().toLocaleTimeString()}`;

    // Raw JSON inspection
    this.jsonDiagBox.innerText = JSON.stringify(res, null, 2);

    if (!res.ok) {
      // Server is offline or unreachable
      this.updateNavStatus('offline', 'Backend Offline');
      this.serverStatusVal.innerHTML = `<span class="badge badge-rose">Offline (0)</span>`;
      this.serverLatencyVal.innerText = `${res.latencyMs} ms`;
      this.serverVersionVal.innerText = '—';
      this.serverEnvVal.innerText = '—';

      this.dbStatusPill.className = 'badge badge-rose';
      this.dbStatusPill.innerText = 'Disconnected';
      this.dbTargetEngine.innerText = 'PostgreSQL';
      this.dbTargetUrl.innerText = 'Unavailable';
      this.dbStatusMsg.innerText = res.error;
      this.dbErrorBlock.style.display = 'block';
      this.dbErrorText.innerText = 'FastAPI server is not responding. Start backend with `python run.py`.';
      return;
    }

    const data = res.data;

    // FastAPI Server is responding
    this.serverLatencyVal.innerText = `${res.latencyMs} ms`;
    this.serverVersionVal.innerText = `v${data.version}`;
    this.serverEnvVal.innerText = data.environment;

    if (data.status === 'online') {
      this.updateNavStatus('online', 'API & DB Online');
      this.serverStatusVal.innerHTML = `<span class="badge badge-emerald">Online (200 OK)</span>`;
    } else {
      this.updateNavStatus('degraded', 'API Degraded (DB Offline)');
      this.serverStatusVal.innerHTML = `<span class="badge badge-amber">Degraded (API Up, DB Issue)</span>`;
    }

    // Database Status Details
    const db = data.database || {};
    this.dbTargetEngine.innerText = db.target_engine || 'PostgreSQL';
    this.dbTargetUrl.innerText = db.target_url || 'postgresql://...';
    this.dbStatusMsg.innerText = db.message || 'No message provided';

    if (db.connected) {
      this.dbStatusPill.className = 'badge badge-emerald';
      this.dbStatusPill.innerText = 'Connected';
      this.dbErrorBlock.style.display = 'none';
    } else {
      this.dbStatusPill.className = 'badge badge-rose';
      this.dbStatusPill.innerText = 'Disconnected';
      this.dbErrorBlock.style.display = 'block';
      this.dbErrorText.innerText = db.error || 'Server unreachable or connection rejected.';
    }
  }

  updateNavStatus(status, text) {
    if (!this.navStatusPulse || !this.navStatusText) return;
    this.navStatusText.innerText = text;

    if (status === 'online') {
      this.navStatusPulse.className = 'pulse-indicator pulse-green';
    } else if (status === 'degraded') {
      this.navStatusPulse.className = 'pulse-indicator pulse-amber';
    } else {
      this.navStatusPulse.className = 'pulse-indicator pulse-red';
    }
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? '⚠️' : '✨';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  start() {
    this.checkHealth();
    this.pollTimer = setInterval(() => this.checkHealth(), CONFIG.HEALTH_CHECK_INTERVAL);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new BookLoopApp();
  app.start();
});
