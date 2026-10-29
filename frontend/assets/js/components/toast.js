/**
 * BookLoop Toast Notification System — Compact, Temporary, Dismissible & Non-blocking
 *
 * Requirements:
 * - Display compact toast notifications at the bottom-right of the screen on desktop.
 * - Responsive position on mobile safely positioned above navigation.
 * - Display a maximum of three notifications at a time and queue additional messages.
 * - Automatically dismiss success and informational notifications after approximately 3–4 seconds.
 * - Keep error notifications visible for approximately 5–6 seconds, with manual dismissal.
 * - Prevent duplicate messages caused by repeated event handlers or API responses.
 * - Non-blocking pointer events on container so UI buttons/forms are never obstructed.
 */
export class ToastManager {
  constructor() {
    this._container = document.getElementById('toast-container');
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.id = 'toast-container';
      this._container.className = 'toast-container';
      document.body.appendChild(this._container);
    }
    this._maxVisible = 3;
    this._queue = [];
    this._activeToasts = [];
    this._recentMessages = new Map();

    // Expose globally for components
    window.toast = this;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} type
   * @param {number|null} duration
   */
  show(message, type = 'info', duration = null) {
    if (!message || typeof message !== 'string') return;
    const cleanMsg = message.trim();
    if (!cleanMsg) return;

    const now = Date.now();
    const dedupeKey = `${type}:${cleanMsg.toLowerCase()}`;

    // Deduplication check: prevent identical notifications within 3.5 seconds
    if (this._recentMessages.has(dedupeKey) && (now - this._recentMessages.get(dedupeKey) < 3500)) {
      return;
    }

    // Check if an identical message is already actively visible
    const alreadyActive = this._activeToasts.some(t => {
      const msgEl = t.querySelector('.toast-msg');
      return msgEl && msgEl.textContent.trim().toLowerCase() === cleanMsg.toLowerCase();
    });
    if (alreadyActive) return;

    // Check if an identical message is already queued
    const alreadyQueued = this._queue.some(q => q.message.trim().toLowerCase() === cleanMsg.toLowerCase());
    if (alreadyQueued) return;

    this._recentMessages.set(dedupeKey, now);

    // Periodically prune stale dedupe keys
    if (this._recentMessages.size > 30) {
      for (const [key, timestamp] of this._recentMessages.entries()) {
        if (now - timestamp > 7000) this._recentMessages.delete(key);
      }
    }

    // Default durations: 3.5s for info/success/warning, 5.5s for errors
    if (duration == null) {
      duration = (type === 'error') ? 5500 : 3500;
    }

    const toastItem = { message: cleanMsg, type, duration };

    if (this._activeToasts.length < this._maxVisible) {
      this._renderToast(toastItem);
    } else {
      this._queue.push(toastItem);
    }
  }

  _renderToast({ message, type, duration }) {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = icons[type] || 'ℹ️';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close-btn';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.innerHTML = '&times;';

    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    toast.appendChild(closeBtn);

    this._container.appendChild(toast);
    this._activeToasts.push(toast);

    let dismissed = false;
    let timerId = null;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timerId) clearTimeout(timerId);

      toast.classList.add('toast-exit');

      const removeElement = () => {
        if (toast.parentNode) {
          toast.remove();
        }
        const index = this._activeToasts.indexOf(toast);
        if (index !== -1) {
          this._activeToasts.splice(index, 1);
        }
        // Dequeue next toast if available
        if (this._queue.length > 0 && this._activeToasts.length < this._maxVisible) {
          const nextToast = this._queue.shift();
          this._renderToast(nextToast);
        }
      };

      // Guaranteed removal with animation listener + safety fallback
      toast.addEventListener('animationend', removeElement, { once: true });
      setTimeout(removeElement, 250);
    };

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });

    timerId = setTimeout(dismiss, duration);
  }

  /** Clear all active and queued toasts */
  clearAll() {
    this._queue = [];
    [...this._activeToasts].forEach(toast => {
      const closeBtn = toast.querySelector('.toast-close-btn');
      if (closeBtn) closeBtn.click();
      else toast.remove();
    });
    this._activeToasts = [];
  }
}
