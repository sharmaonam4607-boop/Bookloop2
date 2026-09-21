/**
 * BookLoop API Communication Layer
 * Supports JWT authentication headers and Phase 2 Auth/Profile endpoints.
 */
import { CONFIG } from './config.js';
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
        error: response.ok ? null : ((data && data.detail) || `HTTP ${response.status}`)
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
}

export const api = new ApiClient(CONFIG.API_BASE_URL);
