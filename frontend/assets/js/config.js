/**
 * BookLoop Frontend Configuration
 */
function resolveApiBaseUrl() {
  if (typeof window === 'undefined') return "http://127.0.0.1:8000";
  if (window.__BOOKLOOP_API_BASE__) return window.__BOOKLOOP_API_BASE__;
  if (window.location.protocol === 'file:') return "http://127.0.0.1:8000";
  // If running on separate local dev server (e.g. Live Server on 5500, Vite on 3000/5173)
  if (['5500', '3000', '5173'].includes(window.location.port)) {
    return "http://127.0.0.1:8000";
  }
  // When served via FastAPI (/app) or deployed to Render / custom domain
  return window.location.origin;
}

export const CONFIG = {
  APP_NAME: "BookLoop",
  TAGLINE: "Giving Books a Second Chance",
  CURRENT_PHASE: "Phase 11 — Integration & Testing",
  
  // FastAPI Backend Configuration — auto-detected for local and production
  API_BASE_URL: resolveApiBaseUrl(),
  API_V1_PREFIX: "/api/v1",
  
  // Endpoints
  ENDPOINTS: {
    ROOT: "/",
    HEALTH: "/api/v1/health",
    DOCS: "/api/v1/docs"
  },
  
  // Polling intervals in ms
  HEALTH_CHECK_INTERVAL: 10000,
  REQUEST_TIMEOUT: 6000
};

