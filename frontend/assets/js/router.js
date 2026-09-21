/**
 * BookLoop Client-Side Router
 * Hash-based navigation (#/home, #/discover, #/communities, #/profile)
 */
export class Router {
  static ROUTES = ['home', 'discover', 'communities', 'profile'];
  static DEFAULT = 'home';

  constructor(onNavigate) {
    this._onNavigate = onNavigate;
    this._current = null;
    window.addEventListener('hashchange', () => this._resolve());
    window.addEventListener('load', () => this._resolve());
  }

  /** Programmatically navigate to a route */
  navigate(route) {
    window.location.hash = `/${route}`;
  }

  /** Get current route name */
  get current() { return this._current; }

  _resolve() {
    const hash = window.location.hash.replace('#/', '').split('?')[0].trim();
    const route = Router.ROUTES.includes(hash) ? hash : Router.DEFAULT;

    if (route === this._current) return;
    const prev = this._current;
    this._current = route;

    // Deactivate old view
    if (prev) {
      document.getElementById(`view-${prev}`)?.classList.remove('view-active');
      document.querySelector(`.nav-item[data-route="${prev}"]`)?.classList.remove('active');
    }

    // Activate new view
    const viewEl = document.getElementById(`view-${route}`);
    if (viewEl) {
      viewEl.classList.add('view-active');
    } else {
      // Ensure correct hash if no view exists
      window.location.hash = `/${Router.DEFAULT}`;
      return;
    }

    document.querySelector(`.nav-item[data-route="${route}"]`)?.classList.add('active');

    if (this._onNavigate) this._onNavigate(route, prev);
  }
}
