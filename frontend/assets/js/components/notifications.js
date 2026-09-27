import { api } from '../api.js?v=5';
import { auth } from '../auth.js';

export class NotificationCenter {
  constructor() {
    this.dialog = document.getElementById('notifications-modal');
    this.list = document.getElementById('notifications-list');
    this.count = document.getElementById('notification-count');
    document.getElementById('open-notifications-btn')?.addEventListener('click', () => this.open());
    document.getElementById('mark-all-notifications-read')?.addEventListener('click', () => this.markAllRead());
    this.dialog?.querySelectorAll('[data-notifications-close]').forEach(button => button.addEventListener('click', () => this.dialog.close()));
    window.addEventListener('notificationsChanged', () => this.refreshCount());
    auth.onChange(() => this.refreshCount());
  }

  async refreshCount() {
    if (!auth.isAuthenticated) {
      if (this.count) {
        this.count.hidden = true;
        this.count.textContent = '0';
      }
      return;
    }
    const response = await api.getNotifications();
    if (!response.ok || !this.count) return;
    this.count.textContent = response.data.unread_count > 99 ? '99+' : String(response.data.unread_count);
    this.count.hidden = response.data.unread_count === 0;
    window.dispatchEvent(new CustomEvent('unreadCountChanged', { detail: response.data.unread_count }));
  }

  async open() {
    if (!auth.isAuthenticated) {
      document.getElementById('open-login-btn')?.click();
      window.toast?.show('Log in to view notifications.', 'info');
      return;
    }
    if (this.dialog && !this.dialog.open) this.dialog.showModal();
    const response = await api.getNotifications();
    if (!this.list) return;
    if (!response.ok) {
      this.list.innerHTML = `<p class="text-secondary">${escapeHtml(response.error || 'Could not load notifications.')}</p>`;
      return;
    }
    this.list.innerHTML = response.data.items.length ? response.data.items.map(item => `
      <button type="button" class="notification-item${item.is_read ? '' : ' unread'}" data-notification-id="${escapeHtml(item.id)}" data-conversation-id="${escapeHtml(item.conversation_id || '')}">
        <span class="notification-dot" aria-hidden="true"></span><span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span><small>${formatTime(item.created_at)}</small></span>
      </button>
    `).join('') : '<div class="empty-state">You are all caught up.</div>';
    this.list.querySelectorAll('[data-notification-id]').forEach(button => button.addEventListener('click', async () => {
      const conversationId = button.dataset.conversationId;
      if (!button.classList.contains('unread')) {
        if (conversationId) this.openConversation(conversationId);
        return;
      }
      await api.markNotificationRead(button.dataset.notificationId);
      this.refreshCount();
      if (conversationId) this.openConversation(conversationId);
      else this.open();
    }));
  }

  async markAllRead() {
    const response = await api.markAllNotificationsRead();
    if (response.ok) {
      await this.open();
      this.refreshCount();
    }
  }

  openConversation(conversationId) {
    this.dialog?.close();
    window.bookloopChat?.select(conversationId);
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}