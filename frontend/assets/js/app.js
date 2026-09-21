/**
 * BookLoop Main Application Controller — Phase 1
 */
import { CONFIG } from './config.js';
import { api } from './api.js';
import { themeManager } from './theme.js';
import { router } from './router.js';
import { modal } from './components/modal.js';
import { renderBookCard, renderBookSkeleton } from './components/book-card.js';
import { MOCK_BOOKS, MOCK_CATEGORIES } from './data/mock-books.js';

class BookLoopApp {
  constructor() {
    this.books = [...MOCK_BOOKS];
    this.currentCategory = 'all';
    this.currentListingType = 'all';
    this.currentCondition = 'all';
    this.searchQuery = '';
    this.sortBy = 'nearest';
    this.isShowingSkeletons = false;

    this.initElements();
    this.initEventListeners();
    this.initCategoriesBar();
    this.renderAllViews();
    this.initSplash();
  }

  initElements() {
    // Splash
    this.splashScreen = document.getElementById('splash-screen');

    // Grids
    this.homeBooksGrid = document.getElementById('home-books-grid');
    this.discoverBooksGrid = document.getElementById('discover-books-grid');
    this.wishlistBooksGrid = document.getElementById('wishlist-books-grid');
    this.categoriesBar = document.getElementById('category-chips-bar');
    this.discoverEmptyState = document.getElementById('discover-empty-state');

    // Search & Filters
    this.heroSearchForm = document.getElementById('hero-search-form');
    this.heroSearchInput = document.getElementById('hero-search-input');
    this.discoverSearchInput = document.getElementById('discover-search-input');
    this.filterTypeSelect = document.getElementById('filter-type-select');
    this.filterCategorySelect = document.getElementById('filter-category-select');
    this.filterConditionSelect = document.getElementById('filter-condition-select');
    this.sortBySelect = document.getElementById('sort-by-select');
    this.resetFiltersBtn = document.getElementById('reset-filters-btn');
    this.toggleSkeletonBtn = document.getElementById('toggle-skeleton-btn');

    // Modals & Triggers
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');
    this.openLoginBtn = document.getElementById('open-login-btn');
    this.openSignupBtn = document.getElementById('open-signup-btn');
    this.bookDetailContent = document.getElementById('book-detail-content');
    this.detailCategoryBadge = document.getElementById('detail-category-badge');

    // Auth Tabs
    this.authTabLogin = document.getElementById('auth-tab-login');
    this.authTabSignup = document.getElementById('auth-tab-signup');
    this.loginForm = document.getElementById('login-form');
    this.signupForm = document.getElementById('signup-form');

    // Developer Indicator & Drawer
    this.floatingDevBadge = document.getElementById('floating-dev-badge');
    this.floatingStatusPulse = document.getElementById('floating-status-pulse');
    this.floatingStatusText = document.getElementById('floating-status-text');
    this.devServerStatus = document.getElementById('dev-server-status');
    this.devServerLatency = document.getElementById('dev-server-latency');
    this.devDbStatus = document.getElementById('dev-db-status');
    this.devJsonBox = document.getElementById('dev-json-box');
    this.devPingBtn = document.getElementById('dev-ping-btn');
    this.toastContainer = document.getElementById('toast-container');
  }

  initSplash() {
    if (this.splashScreen) {
      setTimeout(() => {
        this.splashScreen.classList.add('fade-out');
      }, 550);
    }
  }

  initCategoriesBar() {
    if (!this.categoriesBar) return;
    this.categoriesBar.innerHTML = MOCK_CATEGORIES.map(cat => `
      <button class="category-chip ${cat.id === 'all' ? 'active' : ''}" data-category-id="${cat.id}">
        <span>${cat.icon}</span>
        <span>${cat.name}</span>
      </button>
    `).join('');
  }

  initEventListeners() {
    // Theme Switcher
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => {
        const newTheme = themeManager.toggle();
        this.updateThemeButton(newTheme);
        this.showToast(`Theme switched to ${newTheme} mode`);
      });
      this.updateThemeButton(themeManager.currentTheme);
    }

    // Hero Search Form
    if (this.heroSearchForm) {
      this.heroSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = this.heroSearchInput.value.trim();
        this.searchQuery = query;
        if (this.discoverSearchInput) this.discoverSearchInput.value = query;
        router.navigate('discover');
        this.renderDiscover();
      });
    }

    // Hero Type Filter Pills
    document.querySelectorAll('[data-type-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-type-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentListingType = btn.getAttribute('data-type-filter');
        if (this.filterTypeSelect) this.filterTypeSelect.value = this.currentListingType;
        this.renderHome();
      });
    });

    // Category Chips
    if (this.categoriesBar) {
      this.categoriesBar.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-category-id]');
        if (chip) {
          document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.currentCategory = chip.getAttribute('data-category-id');
          if (this.filterCategorySelect) this.filterCategorySelect.value = this.currentCategory;
          this.renderHome();
        }
      });
    }

    // Discover Filter Selects
    if (this.discoverSearchInput) {
      this.discoverSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderDiscover();
      });
    }

    if (this.filterTypeSelect) {
      this.filterTypeSelect.addEventListener('change', (e) => {
        this.currentListingType = e.target.value;
        this.renderDiscover();
      });
    }

    if (this.filterCategorySelect) {
      this.filterCategorySelect.addEventListener('change', (e) => {
        this.currentCategory = e.target.value;
        this.renderDiscover();
      });
    }

    if (this.filterConditionSelect) {
      this.filterConditionSelect.addEventListener('change', (e) => {
        this.currentCondition = e.target.value;
        this.renderDiscover();
      });
    }

    if (this.sortBySelect) {
      this.sortBySelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.renderDiscover();
      });
    }

    if (this.resetFiltersBtn) {
      this.resetFiltersBtn.addEventListener('click', () => {
        this.searchQuery = '';
        this.currentCategory = 'all';
        this.currentListingType = 'all';
        this.currentCondition = 'all';
        this.sortBy = 'nearest';

        if (this.discoverSearchInput) this.discoverSearchInput.value = '';
        if (this.filterTypeSelect) this.filterTypeSelect.value = 'all';
        if (this.filterCategorySelect) this.filterCategorySelect.value = 'all';
        if (this.filterConditionSelect) this.filterConditionSelect.value = 'all';
        if (this.sortBySelect) this.sortBySelect.value = 'nearest';

        this.renderDiscover();
        this.showToast('Filters reset to default');
      });
    }

    // Toggle Skeleton Loader Preview
    if (this.toggleSkeletonBtn) {
      this.toggleSkeletonBtn.addEventListener('click', () => {
        this.isShowingSkeletons = !this.isShowingSkeletons;
        this.renderDiscover();
        this.showToast(this.isShowingSkeletons ? 'Showing Shimmer Skeletons' : 'Restored Book Cards');
      });
    }

    // Auth Modals
    if (this.openLoginBtn) {
      this.openLoginBtn.addEventListener('click', () => {
        this.switchAuthTab('login');
        modal.openModal('auth-modal');
      });
    }

    if (this.openSignupBtn) {
      this.openSignupBtn.addEventListener('click', () => {
        this.switchAuthTab('signup');
        modal.openModal('auth-modal');
      });
    }

    if (this.authTabLogin) {
      this.authTabLogin.addEventListener('click', () => this.switchAuthTab('login'));
    }

    if (this.authTabSignup) {
      this.authTabSignup.addEventListener('click', () => this.switchAuthTab('signup'));
    }

    // Form Submissions
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        modal.closeModal('auth-modal');
        this.showToast('Welcome back, Amanpreet! Logged in.');
      });
    }

    if (this.signupForm) {
      this.signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        modal.closeModal('auth-modal');
        this.showToast('Account created! Welcome to BookLoop.');
      });
    }

    // Book Click & Wishlist Delegations
    document.addEventListener('click', (e) => {
      // Wishlist Toggle
      const wishBtn = e.target.closest('.wishlist-btn');
      if (wishBtn) {
        e.stopPropagation();
        const bookId = wishBtn.getAttribute('data-book-id');
        this.toggleWishlist(bookId);
        return;
      }

      // Open Book Details Modal
      const card = e.target.closest('.book-card') || e.target.closest('.view-book-btn');
      if (card && !card.classList.contains('skeleton-card')) {
        const bookId = card.getAttribute('data-book-id');
        this.openBookDetails(bookId);
      }
    });

    // Developer Floating Badge Drawer
    if (this.floatingDevBadge) {
      this.floatingDevBadge.addEventListener('click', () => {
        modal.openModal('dev-drawer-modal');
      });
    }

    if (this.devPingBtn) {
      this.devPingBtn.addEventListener('click', async () => {
        this.devPingBtn.disabled = true;
        this.devPingBtn.innerText = 'Pinging...';
        await this.checkBackendHealth();
        this.devPingBtn.disabled = false;
        this.devPingBtn.innerText = 'Ping Again';
      });
    }
  }

  switchAuthTab(tab) {
    if (tab === 'login') {
      this.authTabLogin.classList.add('active');
      this.authTabSignup.classList.remove('active');
      this.loginForm.style.display = 'block';
      this.signupForm.style.display = 'none';
    } else {
      this.authTabSignup.classList.add('active');
      this.authTabLogin.classList.remove('active');
      this.signupForm.style.display = 'block';
      this.loginForm.style.display = 'none';
    }
  }

  toggleWishlist(bookId) {
    const book = this.books.find(b => b.id === bookId);
    if (book) {
      book.isWishlisted = !book.isWishlisted;
      this.showToast(book.isWishlisted ? `Added "${book.title}" to Wishlist` : `Removed from Wishlist`);
      this.renderAllViews();
    }
  }

  openBookDetails(bookId) {
    const book = this.books.find(b => b.id === bookId);
    if (!book || !this.bookDetailContent) return;

    this.detailCategoryBadge.innerText = `${book.category.toUpperCase()} • ${book.courseCode}`;

    let actionButtonText = 'Request Book';
    if (book.listingType === 'sell') actionButtonText = `Buy for ₹${book.price}`;
    if (book.listingType === 'exchange') actionButtonText = 'Propose Book Exchange';
    if (book.listingType === 'donate') actionButtonText = 'Request Free Donation';
    if (book.listingType === 'lend') actionButtonText = `Borrow (₹${book.price}${book.priceUnit || ''})`;

    this.bookDetailContent.innerHTML = `
      <div style="display: flex; gap: var(--space-5); flex-wrap: wrap; margin-bottom: var(--space-5);">
        <div style="width: 140px; height: 190px; border-radius: var(--radius-md); background: ${book.coverGradient}; padding: var(--space-3); color: white; display: flex; flex-direction: column; justify-content: space-between; flex-shrink: 0; box-shadow: var(--shadow-md);">
          <span style="font-size: 0.625rem; text-transform: uppercase; font-weight: 700; opacity: 0.8;">${book.edition}</span>
          <div>
            <h4 style="font-size: 0.875rem; font-weight: 800; line-height: 1.2;">${book.title}</h4>
            <p style="font-size: 0.6875rem; opacity: 0.85; margin-top: 4px;">${book.author}</p>
          </div>
        </div>

        <div style="flex: 1; min-width: 240px;">
          <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-primary);">${book.title}</h3>
          <p style="font-size: 0.9375rem; color: var(--text-secondary); margin-bottom: var(--space-3);">by ${book.author} &bull; ${book.edition}</p>

          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4);">
            <span class="badge badge-indigo">${book.listingTypeLabel}</span>
            <span class="badge badge-emerald">${book.conditionLabel}</span>
            <span class="badge badge-outline">ISBN: ${book.isbn}</span>
          </div>

          <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin-bottom: var(--space-2);">
            ${book.listingType === 'sell' ? `₹${book.price} <span style="font-size: 0.875rem; font-weight: 400; text-decoration: line-through; color: var(--text-muted);">₹${book.originalPrice}</span>` : ''}
            ${book.listingType === 'exchange' ? '⇄ Direct Student Swap' : ''}
            ${book.listingType === 'donate' ? '🎁 Free Community Donation' : ''}
            ${book.listingType === 'lend' ? `₹${book.price}${book.priceUnit || ''}` : ''}
          </div>

          ${book.exchangeWish ? `
            <div style="font-size: 0.8125rem; padding: 8px 12px; background: var(--type-exchange-bg); border-radius: var(--radius-sm); color: var(--type-exchange); margin-bottom: var(--space-3);">
              <strong>Wanted in Exchange:</strong> ${book.exchangeWish}
            </div>
          ` : ''}
        </div>
      </div>

      <div style="padding: var(--space-4); background: var(--bg-surface-subtle); border-radius: var(--radius-md); margin-bottom: var(--space-5);">
        <h5 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Book Condition & Notes:</h5>
        <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">${book.description}</p>
      </div>

      <!-- Seller Profile -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: var(--space-5);">
        <div style="display: flex; align-items: center; gap: var(--space-3);">
          <span style="font-size: 2rem;">${book.seller.avatar}</span>
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${book.seller.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${book.seller.college} &bull; ${book.seller.year}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="color: var(--color-warning); font-weight: 700;">⭐ ${book.seller.trustScore.toFixed(1)}</div>
          <div style="font-size: 0.6875rem; color: var(--text-muted);">${book.seller.reviewsCount} verified reviews</div>
        </div>
      </div>

      <div style="display: flex; gap: var(--space-3);">
        <button class="btn btn-primary" style="flex: 2;" onclick="alert('Transaction request sent to student seller! (Chat integration scheduled for Phase 6)')">
          ${actionButtonText}
        </button>
        <button class="btn btn-outline" style="flex: 1;" onclick="alert('Student Chat scheduled for Phase 6!')">
          💬 Chat with Student
        </button>
      </div>
    `;

    modal.openModal('book-detail-modal');
  }

  filterBooks() {
    return this.books.filter(book => {
      // Query filter
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchTitle = book.title.toLowerCase().includes(q);
        const matchAuthor = book.author.toLowerCase().includes(q);
        const matchCode = (book.courseCode || '').toLowerCase().includes(q);
        const matchCourse = (book.course || '').toLowerCase().includes(q);
        const matchIsbn = (book.isbn || '').includes(q);
        if (!matchTitle && !matchAuthor && !matchCode && !matchCourse && !matchIsbn) {
          return false;
        }
      }

      // Listing type filter
      if (this.currentListingType !== 'all' && book.listingType !== this.currentListingType) {
        return false;
      }

      // Category filter
      if (this.currentCategory !== 'all' && book.category !== this.currentCategory) {
        return false;
      }

      // Condition filter
      if (this.currentCondition !== 'all' && book.condition !== this.currentCondition) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (this.sortBy === 'price-low') return a.price - b.price;
      if (this.sortBy === 'price-high') return b.price - a.price;
      if (this.sortBy === 'rating') return b.seller.trustScore - a.seller.trustScore;
      return a.distanceKm - b.distanceKm; // Default nearest
    });
  }

  renderHome() {
    if (!this.homeBooksGrid) return;
    const filtered = this.filterBooks();
    this.homeBooksGrid.innerHTML = filtered.slice(0, 6).map(renderBookCard).join('');
  }

  renderDiscover() {
    if (!this.discoverBooksGrid) return;

    if (this.isShowingSkeletons) {
      this.discoverBooksGrid.innerHTML = Array(6).fill(0).map(renderBookSkeleton).join('');
      if (this.discoverEmptyState) this.discoverEmptyState.style.display = 'none';
      return;
    }

    const filtered = this.filterBooks();

    if (filtered.length === 0) {
      this.discoverBooksGrid.innerHTML = '';
      if (this.discoverEmptyState) this.discoverEmptyState.style.display = 'block';
    } else {
      if (this.discoverEmptyState) this.discoverEmptyState.style.display = 'none';
      this.discoverBooksGrid.innerHTML = filtered.map(renderBookCard).join('');
    }
  }

  renderWishlist() {
    if (!this.wishlistBooksGrid) return;
    const wishlisted = this.books.filter(b => b.isWishlisted);
    if (wishlisted.length === 0) {
      this.wishlistBooksGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🔖</div>
          <h4 class="empty-title">No books in wishlist</h4>
          <p class="empty-desc">Click the bookmark icon on any book card to save it to your library.</p>
        </div>
      `;
    } else {
      this.wishlistBooksGrid.innerHTML = wishlisted.map(renderBookCard).join('');
    }
  }

  renderAllViews() {
    this.renderHome();
    this.renderDiscover();
    this.renderWishlist();
  }

  updateThemeButton(theme) {
    if (!this.themeToggleBtn) return;
    this.themeToggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    this.themeToggleBtn.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }

  async checkBackendHealth() {
    const res = await api.getHealth();

    if (!res.ok) {
      if (this.floatingStatusPulse) this.floatingStatusPulse.className = 'pulse-indicator pulse-red';
      if (this.floatingStatusText) this.floatingStatusText.innerText = 'Backend: Offline';
      if (this.devServerStatus) this.devServerStatus.innerHTML = '<span class="badge badge-rose">Offline</span>';
      if (this.devServerLatency) this.devServerLatency.innerText = `${res.latencyMs} ms`;
      if (this.devDbStatus) this.devDbStatus.innerHTML = '<span class="badge badge-rose">Disconnected</span>';
      if (this.devJsonBox) this.devJsonBox.innerText = JSON.stringify(res, null, 2);
      return;
    }

    const data = res.data;
    const db = data.database || {};

    if (data.status === 'online') {
      if (this.floatingStatusPulse) this.floatingStatusPulse.className = 'pulse-indicator pulse-green';
      if (this.floatingStatusText) this.floatingStatusText.innerText = `Backend: Online (${res.latencyMs}ms)`;
      if (this.devServerStatus) this.devServerStatus.innerHTML = '<span class="badge badge-emerald">Online (200 OK)</span>';
    } else {
      if (this.floatingStatusPulse) this.floatingStatusPulse.className = 'pulse-indicator pulse-amber';
      if (this.floatingStatusText) this.floatingStatusText.innerText = `Backend: API Up, DB Offline`;
      if (this.devServerStatus) this.devServerStatus.innerHTML = '<span class="badge badge-amber">Degraded</span>';
    }

    if (this.devServerLatency) this.devServerLatency.innerText = `${res.latencyMs} ms`;
    if (this.devDbStatus) {
      this.devDbStatus.innerHTML = db.connected
        ? '<span class="badge badge-emerald">PostgreSQL Connected</span>'
        : '<span class="badge badge-rose">PostgreSQL Offline</span>';
    }
    if (this.devJsonBox) this.devJsonBox.innerText = JSON.stringify(data, null, 2);
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? '⚠️' : '✨';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  start() {
    this.checkBackendHealth();
    setInterval(() => this.checkBackendHealth(), CONFIG.HEALTH_CHECK_INTERVAL);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new BookLoopApp();
  app.start();
});
