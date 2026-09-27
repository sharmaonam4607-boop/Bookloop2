/**
 * BookLoop API Communication Layer
 * Supports JWT authentication headers and Phase 2 Auth/Profile endpoints.
 */
import { CONFIG } from './config.js?v=5';
import { auth }   from './auth.js';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Safe fetch with configurable timeout, latency measurement, and JWT authorization headers.
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    // Attach JWT Bearer token if user is authenticated
    if (auth.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${auth.token}`;
    }

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);
      
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      return {
        ok: response.ok,
        status: response.status,
        latencyMs,
        data,
        error: response.ok ? null : this._formatError(data?.detail || `HTTP ${response.status}`)
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);
      const isTimeout = err.name === 'AbortError';

      return {
        ok: false,
        status: 0,
        latencyMs,
        data: null,
        error: isTimeout
          ? 'Request timed out. Ensure the FastAPI backend server is running on http://127.0.0.1:8000.'
          : 'Backend unreachable. Failed to fetch from FastAPI server.'
      };
    }
  }

  _formatError(error) {
    if (Array.isArray(error)) return error.map(item => item.msg || item.message || String(item)).join(', ');
    return typeof error === 'string' ? error : JSON.stringify(error);
  }

  /* ──────────────────────────────── HEALTH ──────────────────────────────── */

  async getHealth() {
    return this.request(CONFIG.ENDPOINTS.HEALTH);
  }

  async getRoot() {
    return this.request(CONFIG.ENDPOINTS.ROOT);
  }

  /* ──────────────────────────────── AUTHENTICATION ──────────────────────────────── */

  async signup(payload) {
    return this.request('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async login(email, password) {
    return this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async getMe() {
    return this.request('/api/v1/auth/me');
  }

  async passwordResetRequest(email) {
    return this.request('/api/v1/auth/password-reset-request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async passwordResetConfirm(email, reset_token, new_password) {
    return this.request('/api/v1/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ email, reset_token, new_password })
    });
  }

  /* ──────────────────────────────── PROFILE ──────────────────────────────── */

  async getMyProfile() {
    return this.request('/api/v1/profile/me');
  }

  async updateMyProfile(payload) {
    return this.request('/api/v1/profile/me', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async getPublicProfile(userId) {
    return this.request(`/api/v1/profile/${userId}`);
  }

  async getBooks(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== 'all') query.set(key, value);
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/v1/books${suffix}`);
  }

  async getBook(bookId) {
    return this.request(`/api/v1/books/${encodeURIComponent(bookId)}`);
  }

  async createListing(payload) {
    return this.request('/api/v1/books', { method: 'POST', body: JSON.stringify(payload) });
  }

  async getMyListings() {
    return this.request('/api/v1/books/mine');
  }

  async updateListing(bookId, payload) {
    return this.request(`/api/v1/books/${encodeURIComponent(bookId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteListing(bookId) {
    return this.request(`/api/v1/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
  }

  async getWishlist() {
    return this.request('/api/v1/wishlist');
  }

  async addToWishlist(bookId) {
    return this.request(`/api/v1/wishlist/${encodeURIComponent(bookId)}`, { method: 'POST' });
  }

  async removeFromWishlist(bookId) {
    return this.request(`/api/v1/wishlist/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
  }

  async getRequests() {
    return this.request('/api/v1/requests');
  }

  async createBookRequest(bookId, message) {
    return this.request(`/api/v1/books/${encodeURIComponent(bookId)}/requests`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async updateRequest(requestId, status) {
    return this.request(`/api/v1/requests/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async getLibrary() {
    return this.request('/api/v1/library');
  }

  async getConversations() {
    return this.request('/api/v1/conversations');
  }

  async createConversation(context) {
    return this.request('/api/v1/conversations', { method: 'POST', body: JSON.stringify(context) });
  }

  async getConversation(conversationId) {
    return this.request(`/api/v1/conversations/${encodeURIComponent(conversationId)}`);
  }

  async sendMessage(conversationId, body) {
    return this.request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async getNotifications() {
    return this.request('/api/v1/notifications');
  }

  async markNotificationRead(notificationId) {
    return this.request(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead() {
    return this.request('/api/v1/notifications/read-all', { method: 'POST' });
  }

  async getCommunities(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== 'all') query.set(key, value);
    });
    return this.request(`/api/v1/communities${query.size ? `?${query}` : ''}`);
  }

  async createCommunity(payload) {
    return this.request('/api/v1/communities', { method: 'POST', body: JSON.stringify(payload) });
  }

  async getCommunity(communityId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}`);
  }

  async joinCommunity(communityId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/join`, { method: 'POST' });
  }

  async leaveCommunity(communityId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/leave`, { method: 'DELETE' });
  }

  async getCommunityMembers(communityId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/members`);
  }

  async getCommunityBooks(communityId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/books`);
  }

  async addCommunityBook(communityId, bookId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/books/${encodeURIComponent(bookId)}`, { method: 'POST' });
  }

  async getCommunityPosts(communityId) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/posts`);
  }

  async createCommunityPost(communityId, payload) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/posts`, { method: 'POST', body: JSON.stringify(payload) });
  }

  async addCommunityComment(communityId, postId, content) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async reactToCommunityPost(communityId, postId, reacted) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/posts/${encodeURIComponent(postId)}/reactions`, {
      method: reacted ? 'DELETE' : 'POST',
    });
  }

  async reportCommunityItem(communityId, payload) {
    return this.request(`/api/v1/communities/${encodeURIComponent(communityId)}/reports`, { method: 'POST', body: JSON.stringify(payload) });
  }

  async getMapConfig() {
    return this.request('/api/v1/maps/config');
  }

  async getMapPoints() {
    return this.request('/api/v1/maps/points');
  }

  async getEligibleReviews() {
    return this.request('/api/v1/reviews/eligible');
  }

  async createReview(payload) {
    return this.request('/api/v1/reviews', { method: 'POST', body: JSON.stringify(payload) });
  }

  async getUserReviews(userId) {
    return this.request(`/api/v1/reviews/users/${encodeURIComponent(userId)}`);
  }

  async getGlobalImpact() {
    return this.request('/api/v1/impact');
  }

  async getMyImpact() {
    return this.request('/api/v1/impact/me');
  }
}

export const api = new ApiClient(CONFIG.API_BASE_URL);
