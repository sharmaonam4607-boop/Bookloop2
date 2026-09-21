/**
 * BookLoop API Communication Layer
 */
import { CONFIG } from './config.js';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Safe fetch with configurable timeout and latency measurement.
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);
      const data = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        latencyMs,
        data,
        error: response.ok ? null : (data.detail || `HTTP ${response.status}`)
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

  /**
   * Health-check endpoint call.
   */
  async getHealth() {
    return this.request(CONFIG.ENDPOINTS.HEALTH);
  }

  /**
   * Root endpoint call.
   */
  async getRoot() {
    return this.request(CONFIG.ENDPOINTS.ROOT);
  }
}

export const api = new ApiClient(CONFIG.API_BASE_URL);
