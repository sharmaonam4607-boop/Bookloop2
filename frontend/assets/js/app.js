/**
 * BookLoop — Main Application Controller
 * Phase 1: Premium UI Foundation
 *
 * Orchestrates: Splash → Aurora → Nav → Views → Router → Health polling
 */

import { CONFIG }                  from './config.js';
import { api }                     from './api.js';
import { ThemeManager }            from './theme.js';
import { Router }                  from './router.js';
import { ModalController }         from './components/modal.js';
import { ToastManager }            from './components/toast.js';
import { createBookCard, createSkeletonCard } from './components/book-card.js';
import { MOCK_BOOKS, MOCK_CATEGORIES, MOCK_COMMUNITIES } from './data/mock-books.js';

/* ────────────────────────────────────────────────────────────────
   SPLASH CONTROLLER
   ──────────────────────────────────────────────────────────────── */

class SplashController {
  constructor() {
    this._el        = document.getElementById('splash');
    this._logoWrap  = this._el?.querySelector('.splash-logo-wrap');
    this._dots      = this._el?.querySelector('.splash-dots');
  }

  async run() {
    if (!this._el) return;

    // STEP 1 — ambient screen visible immediately (just the dark background + aurora)
    await this._wait(400);

    // STEP 2 — brand reveal
    this._logoWrap?.classList.add('visible');
    this._dots?.classList.add('visible');
    await this._wait(CONFIG.SPLASH_DURATION);

    // STEP 3 — transition into app
    this._el.classList.add('exit');
    await this._wait(850);
    this._el.classList.add('done');
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}

/* ────────────────────────────────────────────────────────────────
   AURORA CONTROLLER
   ──────────────────────────────────────────────────────────────── */

class AuroraController {
  activate() {
    document.querySelectorAll('.aurora-blob').forEach((blob, i) => {
      setTimeout(() => blob.classList.add('visible'), i * 200);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
   SCROLL REVEAL
   ──────────────────────────────────────────────────────────────── */

class ScrollReveal {
  constructor() {
    this._io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); this._io.unobserve(e.target); } }),
      { threshold: CONFIG.REVEAL_THRESHOLD }
    );
  }

  observe(el) { this._io.observe(el); }

  observeAll(selector, scope = document) {
    scope.querySelectorAll(selector).forEach(el => this._io.observe(el));
  }
}

/* ────────────────────────────────────────────────────────────────
   STATUS DOT
   ──────────────────────────────────────────────────────────────── */

class StatusDot {
  constructor() {
    this._el    = document.getElementById('status-dot');
    this._ind   = this._el?.querySelector('.status-indicator');
    this._label = this._el?.querySelector('.status-label');
  }

  setStatus(status, text) {
    if (!this._el) return;
    this._ind?.setAttribute('class', `status-indicator ${status}`);
    if (this._label) this._label.textContent = text;
  }
}

/* ────────────────────────────────────────────────────────────────
   HOME VIEW
   ──────────────────────────────────────────────────────────────── */

class HomeView {
  constructor(modal, reveal) {
    this._modal   = modal;
    this._reveal  = reveal;
    this._grid    = document.getElementById('home-books-grid');
    this._domReady = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    this._renderSkeletons();
    // Simulate async load
    setTimeout(() => this._loadBooks(), 650);
  }

  _renderSkeletons() {
    if (!this._grid) return;
    this._grid.innerHTML = '';
    for (let i = 0; i < 4; i++) this._grid.appendChild(createSkeletonCard());
  }

  _loadBooks() {
    if (!this._grid) return;
    this._grid.innerHTML = '';
    // Show first 4 books on homepage
    MOCK_BOOKS.slice(0, 4).forEach((book, i) => {
      const card = createBookCard(
        book,
        (id, wishlisted) => window.toast?.show(wishlisted ? '❤️ Added to wishlist' : '🤍 Removed from wishlist', 'success'),
        (b, action) => this._modal.openBook(b, action)
      );
      card.classList.add(`reveal-delay-${(i % 5) + 1}`);
      this._grid.appendChild(card);
      this._reveal.observe(card);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
   DISCOVER VIEW
   ──────────────────────────────────────────────────────────────── */

class DiscoverView {
  constructor(modal, reveal) {
    this._modal  = modal;
    this._reveal = reveal;
    this._grid   = document.getElementById('discover-grid');
    this._search = document.getElementById('discover-search-input');
    this._sort   = document.getElementById('discover-sort');
    this._pillsContainer = document.getElementById('discover-pills');
    this._resultInfo     = document.getElementById('discover-result-info');

    this._activeFilter = 'all';
    this._searchTerm   = '';
    this._domReady = false;
    this._books = [...MOCK_BOOKS];
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    this._renderPills();
    this._bindSearch();
    this._bindSort();
    this._renderSkeletons();
    setTimeout(() => this._renderBooks(), 500);
  }

  _renderPills() {
    if (!this._pillsContainer) return;
    this._pillsContainer.innerHTML = '';
    MOCK_CATEGORIES.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = `filter-pill${cat.id === this._activeFilter ? ' active' : ''}`;
      pill.setAttribute('data-cat', cat.id);
      pill.setAttribute('aria-pressed', cat.id === this._activeFilter);
      pill.innerHTML = `${cat.icon} ${cat.name}`;
      pill.addEventListener('click', () => this._setFilter(cat.id));
      this._pillsContainer.appendChild(pill);
    });
  }

  _setFilter(catId) {
    this._activeFilter = catId;
    this._pillsContainer.querySelectorAll('.filter-pill').forEach(p => {
      const active = p.dataset.cat === catId;
      p.classList.toggle('active', active);
      p.setAttribute('aria-pressed', active);
    });
    this._renderBooks();
  }

  _bindSearch() {
    this._search?.addEventListener('input', (e) => {
      this._searchTerm = e.target.value.toLowerCase().trim();
      this._renderBooks();
    });
  }

  _bindSort() {
    this._sort?.addEventListener('change', () => this._renderBooks());
  }

  _getFiltered() {
    let books = [...MOCK_BOOKS];

    // Category filter
    if (this._activeFilter !== 'all') books = books.filter(b => b.category === this._activeFilter);

    // Search
    if (this._searchTerm) {
      books = books.filter(b =>
        b.title.toLowerCase().includes(this._searchTerm) ||
        b.author.toLowerCase().includes(this._searchTerm) ||
        b.course.toLowerCase().includes(this._searchTerm) ||
        b.courseCode.toLowerCase().includes(this._searchTerm)
      );
    }

    // Sort
    const sortVal = this._sort?.value || 'newest';
    if (sortVal === 'price-asc')  books.sort((a, b) => a.price - b.price);
    if (sortVal === 'price-desc') books.sort((a, b) => b.price - a.price);
    if (sortVal === 'nearest')    books.sort((a, b) => a.distanceKm - b.distanceKm);

    return books;
  }

  _renderSkeletons() {
    if (!this._grid) return;
    this._grid.innerHTML = '';
    for (let i = 0; i < 6; i++) this._grid.appendChild(createSkeletonCard());
  }

  _renderBooks() {
    if (!this._grid) return;
    const books = this._getFiltered();

    if (this._resultInfo) {
      this._resultInfo.innerHTML = `Showing <span>${books.length}</span> listing${books.length !== 1 ? 's' : ''} · <span class="badge badge-demo" style="vertical-align:middle;">⚠️ Demo data</span>`;
    }

    this._grid.innerHTML = '';

    if (books.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.gridColumn = '1 / -1';
      empty.innerHTML = `
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">No books found</div>
        <p class="empty-state-desc">Try adjusting your search or filters. New listings are added regularly!</p>
        <button class="btn btn-glass" onclick="document.getElementById('discover-search-input').value='';window.discoverView._searchTerm='';window.discoverView._setFilter('all');">Clear filters</button>
      `;
      this._grid.appendChild(empty);
      return;
    }

    books.forEach((book, i) => {
      const card = createBookCard(
        book,
        (id, wishlisted) => window.toast?.show(wishlisted ? '❤️ Added to wishlist' : '🤍 Removed from wishlist', 'success'),
        (b, action) => this._modal.openBook(b, action)
      );
      card.classList.add(`reveal-delay-${(i % 5) + 1}`);
      this._grid.appendChild(card);
      this._reveal.observe(card);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
   COMMUNITIES VIEW
   ──────────────────────────────────────────────────────────────── */

class CommunitiesView {
  constructor(reveal) {
    this._reveal  = reveal;
    this._list    = document.getElementById('communities-list');
    this._domReady = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    if (!this._list) return;
    this._list.innerHTML = '';
    MOCK_COMMUNITIES.forEach((comm, i) => {
      const card = document.createElement('article');
      card.className = 'community-card reveal';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'article');
      card.innerHTML = `
        <div class="community-icon" aria-hidden="true">${comm.icon}</div>
        <div class="community-info">
          <div class="community-name">${escapeHtml(comm.name)}</div>
          <div class="community-tagline">${escapeHtml(comm.tagline)}</div>
          <div style="margin-top:6px;">
            <span class="badge badge-primary">${comm.badge}</span>
          </div>
        </div>
        <div class="community-stats">
          <span class="community-stat-val">${comm.membersCount.toLocaleString()}</span>
          <span class="community-stat-lbl">members</span>
        </div>
      `;
      card.addEventListener('click', () => window.toast?.show(`📖 ${comm.name} — full community view in Phase 2!`, 'info'));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
      this._list.appendChild(card);
      setTimeout(() => this._reveal.observe(card), i * 60);
    });

    // Join placeholder card
    const joinCard = document.createElement('div');
    joinCard.className = 'card reveal card-elevated flex-center flex-col';
    joinCard.style.cssText = 'padding:var(--space-8);text-align:center;gap:var(--space-4);cursor:pointer;';
    joinCard.innerHTML = `
      <div style="font-size:2rem;">🌟</div>
      <div style="font-family:var(--font-display);font-weight:600;color:var(--text-primary);">Create a Community</div>
      <p style="font-size:var(--text-sm);color:var(--text-tertiary);">Start your own student book-sharing community and grow together.</p>
      <button class="btn btn-outline">+ Create Community</button>
    `;
    joinCard.addEventListener('click', () => window.toast?.show('Community creation coming in Phase 2! 🚀', 'info'));
    this._list.appendChild(joinCard);
    this._reveal.observe(joinCard);
  }
}

/* ────────────────────────────────────────────────────────────────
   PROFILE VIEW
   ──────────────────────────────────────────────────────────────── */

class ProfileView {
  constructor(modal, reveal) {
    this._modal = modal;
    this._reveal = reveal;
    this._domReady = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    // Profile is rendered statically in HTML; just trigger reveals
    setTimeout(() => this._reveal.observeAll('.reveal', document.getElementById('view-profile')), 200);
  }
}

/* ────────────────────────────────────────────────────────────────
   HEALTH POLLER
   ──────────────────────────────────────────────────────────────── */

class HealthPoller {
  constructor(statusDot) {
    this._statusDot = statusDot;
  }

  async poll() {
    try {
      const result = await api.getHealth();
      if (result.ok && result.data) {
        const connected = result.data.database?.connected;
        if (connected) {
          this._statusDot.setStatus('ok', 'API + DB');
        } else {
          this._statusDot.setStatus('degraded', 'API Up');
        }
      } else {
        this._statusDot.setStatus('error', 'API Down');
      }
    } catch {
      this._statusDot.setStatus('error', 'Offline');
    }
  }

  start() {
    this.poll();
    setInterval(() => this.poll(), CONFIG.HEALTH_CHECK_INTERVAL);
  }
}

/* ────────────────────────────────────────────────────────────────
   NAV HIDE ON SCROLL DOWN
   ──────────────────────────────────────────────────────────────── */

function initNavScroll() {
  const nav = document.getElementById('nav-pill');
  let lastY = 0;
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > lastY + 10 && y > 120) {
          nav?.classList.add('hidden');
        } else if (y < lastY - 5) {
          nav?.classList.remove('hidden');
        }
        lastY = y;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

/* ────────────────────────────────────────────────────────────────
   HERO CATEGORY PILL CLICK → NAVIGATE TO DISCOVER
   ──────────────────────────────────────────────────────────────── */

function initHeroPills(router) {
  document.querySelectorAll('[data-hero-pill]').forEach(pill => {
    pill.addEventListener('click', () => {
      router.navigate('discover');
    });
  });
}

/* ────────────────────────────────────────────────────────────────
   HERO SEARCH → DISCOVER + POPULATE
   ──────────────────────────────────────────────────────────────── */

function initHeroSearch(router) {
  const form = document.getElementById('hero-search-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('hero-search-input')?.value?.trim();
    if (val) {
      const discoverInput = document.getElementById('discover-search-input');
      if (discoverInput) { discoverInput.value = val; discoverInput.dispatchEvent(new Event('input')); }
    }
    router.navigate('discover');
  });
}

/* ────────────────────────────────────────────────────────────────
   AUTH BUTTON WIRING
   ──────────────────────────────────────────────────────────────── */

function initAuthButtons(modal) {
  document.querySelectorAll('[data-auth-login]').forEach(el => {
    el.addEventListener('click', () => modal.openAuth('login'));
  });
  document.querySelectorAll('[data-auth-signup]').forEach(el => {
    el.addEventListener('click', () => modal.openAuth('signup'));
  });
}

/* ────────────────────────────────────────────────────────────────
   THEME TOGGLE BUTTON
   ──────────────────────────────────────────────────────────────── */

function initThemeToggle(themeManager) {
  const btn = document.getElementById('theme-toggle');
  const update = () => { if (btn) btn.textContent = themeManager.current === 'dark' ? '☀️' : '🌙'; };
  btn?.addEventListener('click', () => { themeManager.toggle(); update(); });
  update();
}

/* ────────────────────────────────────────────────────────────────
   STATUS DOT CLICK → HEALTH INFO TOAST
   ──────────────────────────────────────────────────────────────── */

function initStatusDotClick() {
  document.getElementById('status-dot')?.addEventListener('click', async () => {
    window.toast?.show('Checking backend health…', 'info', 1500);
    const result = await api.getHealth();
    if (result.ok) {
      const db = result.data?.database;
      window.toast?.show(
        db?.connected ? `✅ API + DB connected (${result.latencyMs}ms)` : `⚠️ API up, DB offline — ${result.latencyMs}ms`,
        db?.connected ? 'success' : 'warning'
      );
    } else {
      window.toast?.show('❌ Backend unreachable. Is FastAPI running?', 'error');
    }
  });
}

/* ────────────────────────────────────────────────────────────────
   MAIN ENTRY POINT
   ──────────────────────────────────────────────────────────────── */

async function main() {
  // Init core services immediately
  const theme  = new ThemeManager();
  const toast  = new ToastManager();
  const reveal = new ScrollReveal();
  const aurora = new AuroraController();
  const splash = new SplashController();

  // Activate aurora blobs
  aurora.activate();

  // Init modals
  const modal = new ModalController();

  // Init views (lazy, render on first activation)
  const homeView        = new HomeView(modal, reveal);
  const discoverView    = new DiscoverView(modal, reveal);
  const communitiesView = new CommunitiesView(reveal);
  const profileView     = new ProfileView(modal, reveal);

  // Expose discoverView globally for clear-filters button in empty state
  window.discoverView = discoverView;

  // Init router
  const router = new Router((route) => {
    switch (route) {
      case 'home':        homeView.render(); break;
      case 'discover':    discoverView.render(); break;
      case 'communities': communitiesView.render(); break;
      case 'profile':     profileView.render(); break;
    }
    // Scroll to top on route change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Wire up nav items
  document.querySelectorAll('.nav-item[data-route]').forEach(item => {
    item.addEventListener('click', () => router.navigate(item.dataset.route));
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } });
  });

  // Wire hero search & pills
  initHeroSearch(router);
  initHeroPills(router);
  initAuthButtons(modal);
  initThemeToggle(theme);
  initNavScroll();
  initStatusDotClick();

  // Observe static home reveals
  setTimeout(() => reveal.observeAll('.reveal', document.getElementById('view-home')), 100);

  // Run splash animation
  await splash.run();

  // Reveal app
  const appEl = document.getElementById('app');
  appEl?.classList.add('visible');

  // Force router resolve after splash (navigates to current hash or #/home)
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#/home';
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  // Render home by default
  homeView.render();

  // Start backend health polling
  const statusDot = new StatusDot();
  const poller = new HealthPoller(statusDot);
  poller.start();

  console.log(`%cBookLoop ✦ ${CONFIG.CURRENT_PHASE}`, 'color:#818cf8;font-weight:700;font-size:14px;');
  console.log('%cFastAPI backend: ' + CONFIG.API_BASE_URL, 'color:#67e8f9;');
  console.log('%cDemo data is clearly labelled — real data coming in Phase 2.', 'color:#facc15;');
}

main().catch(console.error);

/* Utility */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
