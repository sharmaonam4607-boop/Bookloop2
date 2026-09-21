/**
 * BookLoop Frontend Configuration
 * Phase 1 — Premium UI Foundation
 */
export const CONFIG = {
  APP_NAME: "BookLoop",
  TAGLINE: "Giving Books a Second Chance",
  TAGLINE_SHORT: "Share • Discover • Grow",
  CURRENT_PHASE: "Phase 1 — Premium UI Foundation",

  // FastAPI Backend Configuration
  API_BASE_URL: (() => {
    // Detect if opened via file:// or via the dev server
    if (window.location.protocol === 'file:') return 'http://127.0.0.1:8000';
    return window.location.origin;
  })(),
  API_V1_PREFIX: "/api/v1",

  ENDPOINTS: {
    ROOT:   "/",
    HEALTH: "/api/v1/health",
    DOCS:   "/api/v1/docs"
  },

  // Timing
  HEALTH_CHECK_INTERVAL: 15000,  // ms between backend health polls
  REQUEST_TIMEOUT:        6000,  // fetch timeout
  SPLASH_DURATION:        1800,  // ms before splash exits

  // Scroll reveal IntersectionObserver threshold
  REVEAL_THRESHOLD: 0.12,
};
