/**
 * BookLoop Client-Side Hash Router
 */

export class SimpleRouter {
  constructor() {
    this.routes = {};
    this.currentRoute = 'home';

    window.addEventListener('hashchange', () => this.handleRouteChange());
    window.addEventListener('load', () => this.handleRouteChange());
  }

  register(route, handler) {
    this.routes[route] = handler;
    return this;
  }

  navigate(route) {
    window.location.hash = `#/${route.replace(/^#?\/?/, '')}`;
  }

  handleRouteChange() {
    const rawHash = window.location.hash || '#/home';
    const cleanRoute = rawHash.replace(/^#\/?/, '').split('/')[0] || 'home';
    this.currentRoute = cleanRoute;

    // Execute registered handler or fallback to home
    const handler = this.routes[cleanRoute] || this.routes['home'];
    if (typeof handler === 'function') {
      handler(cleanRoute);
    }

    // Switch active view container
    document.querySelectorAll('.app-view').forEach(view => {
      view.classList.remove('view-active');
    });
    const targetView = document.getElementById(`view-${cleanRoute}`);
    if (targetView) {
      targetView.classList.add('view-active');
    } else {
      const defaultView = document.getElementById('view-home');
      if (defaultView) defaultView.classList.add('view-active');
    }

    // Update active nav links
    document.querySelectorAll('[data-nav-route]').forEach(link => {
      const routeAttr = link.getAttribute('data-nav-route');
      if (routeAttr === cleanRoute) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.dispatchEvent(new CustomEvent('routeChanged', { detail: { route: cleanRoute } }));
  }
}

export const router = new SimpleRouter();
