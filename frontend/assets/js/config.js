/**
 * BookLoop Frontend Configuration
 */
export const CONFIG = {
  APP_NAME: "BookLoop",
  TAGLINE: "Giving Books a Second Chance",
  CURRENT_PHASE: "Phase 9 — Trust, Reviews & Impact",
  
  // FastAPI runs separately from the static frontend server.
  API_BASE_URL: "http://127.0.0.1:8000",
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
