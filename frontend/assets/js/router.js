/**
 * BookLoop Lightweight Client-Side Router
 */

export class SimpleRouter {
  constructor() {
    this.routes = {};
    this.currentRoute = '';
    
    window.addEventListener('hashchange', () => this.handleRouteChange());
    window.addEventListener('load', () => this.handleRouteChange());
  }

  register(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  navigate(path) {
    window.location.hash = path.startsWith('#') ? path : `#${path}`;
  }

  handleRouteChange() {
    const rawHash = window.location.hash || '#/';
    const cleanPath = rawHash.replace(/^#/, '') || '/';
    this.currentRoute = cleanPath;

    const handler = this.routes[cleanPath] || this.routes['/'] || null;
    if (typeof handler === 'function') {
      handler(cleanPath);
    }

    window.dispatchEvent(new CustomEvent('routeChanged', { detail: { path: cleanPath } }));
  }
}

export const router = new SimpleRouter();
