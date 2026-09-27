import { api } from '../api.js?v=5';
import { auth } from '../auth.js';

export class ChatView {
  constructor(router) {
    this.router = router;
    this.container = document.getElementById('chat-view-content');
    this.selectedId = null;
    this.loading = false;
    this.container?.addEventListener('submit', event => {
      if (event.target.matches('#chat-message-form')) {
        event.preventDefault();
        this.sendCurrentMessage();
      }
    });
  }

  async openForBook(bookId) {
    await this.openConversation({ book_id: bookId });
  }

  async openForRequest(requestId) {
    await this.openConversation({ request_id: requestId });
  }

  async select(conversationId) {
    this.selectedId = conversationId;
    this.router.navigate('chats');
    await this.render();
  }

  async openConversation(context) {
    if (!auth.isAuthenticated) {
      document.getElementById('open-login-btn')?.click();
      window.toast?.show('Log in to start a conversation.', 'info');
      return;
    }
    const response = await api.createConversation(context);
    if (!response.ok) {
      window.toast?.show(response.error || 'Could not open this conversation.', 'error');
      return;
    }
    this.selectedId = response.data.id;
    this.router.navigate('chats');
    await this.render();
  }

  async render() {
    if (!this.container) return;
    if (!auth.isAuthenticated) {
      this.container.innerHTML = '<div class="empty-state"><h2>Student account required</h2><p>Log in to view and send messages.</p><button class="btn btn-primary btn-sm" data-chat-login>Log in</button></div>';
      this.container.querySelector('[data-chat-login]')?.addEventListener('click', () => document.getElementById('open-login-btn')?.click());
      return;
    }
    if (this.loading) return;
    this.loading = true;
    this.container.innerHTML = '<p class="text-secondary">Loading conversations...</p>';
    const response = await api.getConversations();
    this.loading = false;
    if (!response.ok) {
      this.container.innerHTML = `<div class="empty-state">${escapeHtml(response.error || 'Could not load conversations.')}</div>`;
      return;
    }
    const conversations = response.data || [];
    if (!conversations.some(item => item.id === this.selectedId)) this.selectedId = conversations[0]?.id || null;
    this.container.innerHTML = `
      <div class="chat-layout">
        <aside class="chat-sidebar" aria-label="Conversations">
          <h2>Conversations</h2>
          <div class="chat-conversation-list">${conversations.length ? conversations.map(item => `
            <button type="button" class="chat-conversation${item.id === this.selectedId ? ' active' : ''}" data-conversation-id="${escapeHtml(item.id)}">
              <span class="chat-avatar">${escapeHtml(initials(item.other_user_name))}</span>
              <span class="chat-conversation-copy"><strong>${escapeHtml(item.other_user_name)}</strong><span>${escapeHtml(item.book_title || 'BookLoop chat')}</span><small>${escapeHtml(item.latest_message || 'Start the conversation')}</small></span>
              ${item.unread_count ? `<span class="unread-count">${item.unread_count}</span>` : ''}
            </button>
          `).join('') : '<p class="text-secondary">No conversations yet. Start one from a book or request.</p>'}</div>
        </aside>
        <section class="chat-thread" aria-label="Message thread">
          <div class="chat-thread-content">${this.selectedId ? '<p class="text-secondary">Loading messages...</p>' : '<div class="empty-state">Select a conversation to view messages.</div>'}</div>
        </section>
      </div>
    `;
    this.container.querySelectorAll('[data-conversation-id]').forEach(button => button.addEventListener('click', () => {
      this.selectedId = button.dataset.conversationId;
      this.render();
    }));
    if (this.selectedId) await this.renderThread(this.selectedId);
  }

  async renderThread(conversationId) {
    const target = this.container?.querySelector('.chat-thread-content');
    if (!target) return;
    const response = await api.getConversation(conversationId);
    if (!response.ok) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(response.error || 'Could not load this conversation.')}</div>`;
      return;
    }
    const conversation = response.data;
    this.container.querySelector(`[data-conversation-id="${CSS.escape(conversationId)}"] .unread-count`)?.remove();
    target.innerHTML = `
      <header class="chat-thread-header"><div><h2>${escapeHtml(conversation.other_user_name)}</h2><p>${escapeHtml(conversation.book_title || 'BookLoop conversation')}${conversation.request_id ? ' · Request linked' : ''}</p></div><span class="badge badge-emerald">Private conversation</span></header>
      <div class="chat-messages" aria-live="polite">${conversation.messages.length ? conversation.messages.map(message => `
        <article class="chat-message${message.sender_id === auth.user?.id ? ' own' : ''}">
          <p>${escapeHtml(message.body)}</p><small>${escapeHtml(message.sender_name)} · <time datetime="${escapeHtml(message.created_at)}">${formatTime(message.created_at)}</time>${message.sender_id === auth.user?.id && message.read_at ? ' · Read' : ''}</small>
        </article>
      `).join('') : '<div class="empty-state">No messages yet. Say hello to begin.</div>'}</div>
      <form id="chat-message-form" class="chat-composer"><label class="sr-only" for="chat-message-input">Message</label><textarea id="chat-message-input" class="form-input" rows="2" maxlength="4000" placeholder="Write a message..." required></textarea><button type="submit" class="btn btn-primary">Send</button></form>
    `;
    const messages = target.querySelector('.chat-messages');
    messages.scrollTop = messages.scrollHeight;
    window.dispatchEvent(new CustomEvent('notificationsChanged'));
  }

  async sendCurrentMessage() {
    const form = this.container?.querySelector('#chat-message-form');
    const input = form?.querySelector('textarea');
    const body = input?.value.trim();
    if (!this.selectedId || !body) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const response = await api.sendMessage(this.selectedId, body);
    button.disabled = false;
    if (!response.ok) {
      window.toast?.show(response.error || 'Message could not be sent.', 'error');
      return;
    }
    await this.render();
    window.dispatchEvent(new CustomEvent('notificationsChanged'));
  }
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}