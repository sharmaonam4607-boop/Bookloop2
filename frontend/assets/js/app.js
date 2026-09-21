/**
 * BookLoop — Main Application Controller
 * Phase 2: Authentication & User Profile
 */

import { CONFIG }                     from './config.js';
import { api }                        from './api.js';
import { auth }                       from './auth.js';
import { ThemeManager }               from './theme.js';
import { Router }                     from './router.js';
import { ModalController }            from './components/modal.js';
import { createBookCard, createSkeletonCard } from './components/book-card.js';
import { MOCK_BOOKS, MOCK_CATEGORIES, MOCK_COMMUNITIES } from './data/mock-books.js';

/* ────────────────────────────────────────────────────────────────
   HEADER AUTH STATE CONTROLLER
   ──────────────────────────────────────────────────────────────── */

class HeaderAuthController {
  constructor(modal) {
    this._modal = modal;
    this._guestActions = document.getElementById('nav-guest-actions');
    this._userActions  = document.getElementById('nav-user-actions');
    this._userName     = document.getElementById('nav-user-name');
    this._userAvatar   = document.getElementById('nav-user-avatar');
    this._logoutBtn    = document.getElementById('nav-logout-btn');

    this._bindEvents();
    this.updateUI(auth.user, auth.isAuthenticated);
  }

  _bindEvents() {
    document.getElementById('open-login-btn')?.addEventListener('click', () => this._modal.openAuth('login'));
    document.getElementById('open-signup-btn')?.addEventListener('click', () => this._modal.openAuth('signup'));
    this._logoutBtn?.addEventListener('click', () => {
      auth.logout();
      window.toast?.show('Logged out successfully.', 'info');
    });

    auth.onChange((user, isAuth) => this.updateUI(user, isAuth));
  }

  updateUI(user, isAuthenticated) {
    if (isAuthenticated && user) {
      if (this._guestActions) this._guestActions.style.display = 'none';
      if (this._userActions)  this._userActions.style.display  = 'flex';
      
      const profile = user.profile || {};
      if (this._userName)   this._userName.textContent   = profile.full_name || 'Student';
      if (this._userAvatar) this._userAvatar.textContent = profile.avatar_emoji || '👨‍🎓';
    } else {
      if (this._guestActions) this._guestActions.style.display = 'flex';
      if (this._userActions)  this._userActions.style.display  = 'none';
    }
  }
}

/* ────────────────────────────────────────────────────────────────
   HOME VIEW
   ──────────────────────────────────────────────────────────────── */

class HomeView {
  constructor(modal) {
    this._modal = modal;
    this._grid  = document.getElementById('home-books-grid');
    this._pillsContainer = document.getElementById('home-category-pills');
    this._domReady = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    this._renderPills();
    this._renderSkeletons();
    setTimeout(() => this._loadBooks(), 300);
  }

  _renderPills() {
    if (!this._pillsContainer) return;
    this._pillsContainer.innerHTML = '';
    MOCK_CATEGORIES.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'pill';
      pill.innerHTML = `${cat.icon} ${cat.name}`;
      pill.addEventListener('click', () => {
        window.location.hash = '#/discover';
      });
      this._pillsContainer.appendChild(pill);
    });
  }

  _renderSkeletons() {
    if (!this._grid) return;
    this._grid.innerHTML = '';
    for (let i = 0; i < 4; i++) this._grid.appendChild(createSkeletonCard());
  }

  _loadBooks() {
    if (!this._grid) return;
    this._grid.innerHTML = '';
    MOCK_BOOKS.slice(0, 4).forEach(book => {
      const card = createBookCard(
        book,
        (id, wishlisted) => window.toast?.show(wishlisted ? '❤️ Added to wishlist' : '🤍 Removed from wishlist', 'success'),
        (b, action) => this._modal.openBook(b, action)
      );
      this._grid.appendChild(card);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
   DISCOVER VIEW
   ──────────────────────────────────────────────────────────────── */

class DiscoverView {
  constructor(modal) {
    this._modal  = modal;
    this._grid   = document.getElementById('discover-books-grid');
    this._search = document.getElementById('discover-search-input');
    this._typeFilter = document.getElementById('discover-type-filter');
    this._sortFilter = document.getElementById('discover-sort-filter');
    this._domReady = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    this._bindEvents();
    this._renderBooks();
  }

  _bindEvents() {
    this._search?.addEventListener('input', () => this._renderBooks());
    this._typeFilter?.addEventListener('change', () => this._renderBooks());
    this._sortFilter?.addEventListener('change', () => this._renderBooks());
  }

  _getFiltered() {
    let books = [...MOCK_BOOKS];
    const q = this._search?.value?.toLowerCase().trim() || '';
    const type = this._typeFilter?.value || 'all';
    const sort = this._sortFilter?.value || 'newest';

    if (type !== 'all') {
      books = books.filter(b => b.listingType === type);
    }

    if (q) {
      books = books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.course.toLowerCase().includes(q) ||
        b.courseCode.toLowerCase().includes(q)
      );
    }

    if (sort === 'price-low')  books.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') books.sort((a, b) => b.price - a.price);
    if (sort === 'nearest')    books.sort((a, b) => a.distanceKm - b.distanceKm);

    return books;
  }

  _renderBooks() {
    if (!this._grid) return;
    const books = this._getFiltered();
    this._grid.innerHTML = '';

    if (books.length === 0) {
      this._grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-tertiary);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📚</div>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 1.1rem;">No matching textbooks found</div>
          <p style="font-size: 0.8125rem; margin-top: 4px;">Try searching for another title, course code, or clearing filters.</p>
        </div>
      `;
      return;
    }

    books.forEach(book => {
      const card = createBookCard(
        book,
        (id, wishlisted) => window.toast?.show(wishlisted ? '❤️ Added to wishlist' : '🤍 Removed from wishlist', 'success'),
        (b, action) => this._modal.openBook(b, action)
      );
      this._grid.appendChild(card);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
   COMMUNITIES VIEW
   ──────────────────────────────────────────────────────────────── */

class CommunitiesView {
  constructor() {
    this._container = document.getElementById('communities-grid');
    this._domReady  = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    if (!this._container) return;

    this._container.innerHTML = '';
    MOCK_COMMUNITIES.forEach(comm => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = 'var(--space-5)';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
          <div style="font-size:2rem;width:48px;height:48px;border-radius:var(--radius-md);background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;">${comm.icon}</div>
          <div>
            <h3 style="font-size:1rem;font-weight:700;color:var(--text-primary);">${escapeHtml(comm.name)}</h3>
            <span class="badge badge-indigo">${comm.badge}</span>
          </div>
        </div>
        <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:var(--space-4);">${escapeHtml(comm.tagline)}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--text-tertiary);border-top:1px solid var(--border-light);padding-top:var(--space-3);">
          <span>👥 ${comm.membersCount} members</span>
          <span>📚 ${comm.booksShared} shared</span>
        </div>
      `;
      this._container.appendChild(card);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
   PROFILE VIEW (Dynamic Auth State)
   ──────────────────────────────────────────────────────────────── */

class ProfileView {
  constructor(modal) {
    this._modal     = modal;
    this._container = document.getElementById('profile-container');
    auth.onChange(() => this.render(true));
  }

  render(force = false) {
    if (!this._container) return;
    if (!force && this._rendered) return;
    this._rendered = true;

    this._container.innerHTML = '';

    if (auth.isAuthenticated && auth.user) {
      const user = auth.user;
      const profile = user.profile || {};

      const profileCard = document.createElement('div');
      profileCard.className = 'card';
      profileCard.style.padding = 'var(--space-6)';
      profileCard.style.marginBottom = 'var(--space-6)';

      profileCard.innerHTML = `
        <div style="display:flex;gap:var(--space-5);align-items:flex-start;flex-wrap:wrap;">
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--color-primary),var(--color-secondary));display:flex;align-items:center;justify-content:center;font-size:2.5rem;flex-shrink:0;">
            ${profile.avatar_emoji || '👨‍🎓'}
          </div>
          <div style="flex:1;min-width:220px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;margin-bottom:6px;">
              <h1 style="font-size:1.4rem;font-weight:700;color:var(--text-primary);">${escapeHtml(profile.full_name || 'Student')}</h1>
              <button id="edit-profile-btn" class="btn btn-outline btn-sm">✏️ Edit Profile</button>
            </div>
            <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:4px;">${escapeHtml(profile.university || 'University')} · ${escapeHtml(profile.location || 'Campus')}</p>
            <p style="font-size:0.8125rem;color:var(--text-tertiary);margin-bottom:12px;">${escapeHtml(profile.course || 'Degree')} (${escapeHtml(profile.year || '3rd Year')})</p>
            
            ${profile.bio ? `<p style="font-size:0.8125rem;color:var(--text-secondary);background:var(--bg-surface);padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-light);">${escapeHtml(profile.bio)}</p>` : ''}
          </div>
        </div>

        <div class="stat-grid" style="margin-top:var(--space-6);">
          <div class="stat-tile">
            <span class="stat-label">Trust Score</span>
            <span class="stat-value" style="color:var(--color-warning);">★ ${(profile.trust_score || 5.0).toFixed(1)}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Books Shared</span>
            <span class="stat-value">${profile.books_shared || 0}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Exchanges</span>
            <span class="stat-value">${profile.books_exchanged || 0}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Donations</span>
            <span class="stat-value">${profile.books_donated || 0}</span>
          </div>
        </div>
      `;

      profileCard.querySelector('#edit-profile-btn')?.addEventListener('click', () => {
        this._modal.openEditProfile();
      });

      this._container.appendChild(profileCard);
    } else {
      // Guest state view
      const guestCard = document.createElement('div');
      guestCard.className = 'card';
      guestCard.style.cssText = 'padding:var(--space-10);text-align:center;max-width:560px;margin:0 auto;';
      guestCard.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:var(--space-4);">👨‍🎓</div>
        <h2 style="font-size:1.3rem;font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2);">Student Account Required</h2>
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:var(--space-6);line-height:1.5;">
          Log in or create a student account to manage your listings, view saved books, and track your campus book sharing history.
        </p>
        <div style="display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary btn-md" onclick="document.getElementById('open-login-btn').click()">Student Login</button>
          <button class="btn btn-outline btn-md" onclick="document.getElementById('open-signup-btn').click()">Create Account</button>
        </div>
      `;
      this._container.appendChild(guestCard);
    }
  }
}

/* ────────────────────────────────────────────────────────────────
   HEALTH & DEV BADGE MONITOR
   ──────────────────────────────────────────────────────────────── */

class HealthPoller {
  async poll() {
    const pulse = document.getElementById('floating-status-pulse');
    const text  = document.getElementById('floating-status-text');

    try {
      const res = await api.getHealth();
      if (res.ok && res.data) {
        const dbConnected = res.data.database?.connected;
        if (pulse) pulse.className = dbConnected ? 'pulse-indicator pulse-green' : 'pulse-indicator pulse-amber';
        if (text)  text.textContent  = dbConnected ? `Backend: Online (${res.latencyMs}ms)` : `Backend: API Up (${res.latencyMs}ms)`;
      } else {
        if (pulse) pulse.className = 'pulse-indicator pulse-red';
        if (text)  text.textContent  = 'Backend: Offline';
      }
    } catch {
      if (pulse) pulse.className = 'pulse-indicator pulse-red';
      if (text)  text.textContent  = 'Backend: Offline';
    }
  }

  start() {
    this.poll();
    setInterval(() => this.poll(), CONFIG.HEALTH_CHECK_INTERVAL);
  }
}

/* ────────────────────────────────────────────────────────────────
   MAIN ENTRY POINT
   ──────────────────────────────────────────────────────────────── */

async function main() {
  const theme = new ThemeManager();
  const modal = new ModalController();
  const headerAuth = new HeaderAuthController(modal);

  const homeView        = new HomeView(modal);
  const discoverView    = new DiscoverView(modal);
  const communitiesView = new CommunitiesView();
  const profileView     = new ProfileView(modal);

  const router = new Router((route) => {
    switch (route) {
      case 'home':        homeView.render(); break;
      case 'discover':    discoverView.render(); break;
      case 'communities': communitiesView.render(); break;
      case 'profile':     profileView.render(); break;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Home search wiring
  document.getElementById('home-search-btn')?.addEventListener('click', () => {
    const q = document.getElementById('home-search-input')?.value?.trim();
    if (q) {
      const discoverSearch = document.getElementById('discover-search-input');
      if (discoverSearch) { discoverSearch.value = q; discoverSearch.dispatchEvent(new Event('input')); }
    }
    router.navigate('discover');
  });

  // Execute initial view render
  homeView.render();

  // Start health poller
  const poller = new HealthPoller();
  poller.start();

  console.log(`%cBookLoop ✦ ${CONFIG.CURRENT_PHASE}`, 'color:#818cf8;font-weight:700;font-size:14px;');
}

main().catch(console.error);

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
