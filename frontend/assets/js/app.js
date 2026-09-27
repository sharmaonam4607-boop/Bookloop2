/**
 * BookLoop — Main Application Controller
 * Phase 9: Trust, Reviews & Impact
 */

import { CONFIG }                     from './config.js?v=7';
import { api }                        from './api.js?v=8';
import { auth }                       from './auth.js';
import { ThemeManager }               from './theme.js';
import { ToastManager }               from './components/toast.js';
import { router as appRouter } from './router.js';
import { ModalController }            from './components/modal.js?v=6';
import { ListingFormController }      from './components/listing-form.js';
import { ChatView }                   from './components/chat.js';
import { NotificationCenter }         from './components/notifications.js';
import { CommunitiesView }             from './components/communities.js?v=8';
import { NearbyView }                   from './components/nearby.js?v=6';
import { renderBookCard, renderBookSkeleton } from './components/book-card.js?v=2';
import { MOCK_CATEGORIES }             from './data/mock-books.js';

/* ────────────────────────────────────────────────────────────────
   HEADER AUTH STATE CONTROLLER
   ──────────────────────────────────────────────────────────────── */

class HeaderAuthController {
  constructor(modal, listingForm) {
    this._modal = modal;
    this._listingForm = listingForm;
    // Optional nav wrapper elements (may not exist in current HTML)
    this._guestActions = document.getElementById('nav-guest-actions');
    this._userActions  = document.getElementById('nav-user-actions');
    this._userName     = document.getElementById('nav-user-name');
    this._userAvatar   = document.getElementById('nav-user-avatar');
    this._logoutBtn    = document.getElementById('nav-logout-btn');

    this._loginBtn  = document.getElementById('open-login-btn');
    this._signupBtn = document.getElementById('open-signup-btn');

    this._bindEvents();
    this.updateUI(auth.user, auth.isAuthenticated);
  }

  _bindEvents() {
    this._loginBtn?.addEventListener('click', () => this._modal.openAuth('login'));
    this._signupBtn?.addEventListener('click', () => {
      if (auth.isAuthenticated) this._listingForm.open();
      else this._modal.openAuth('signup');
    });
    this._logoutBtn?.addEventListener('click', () => {
      auth.logout();
      window.toast?.show('Logged out successfully.', 'info');
    });

    auth.onChange((user, isAuth) => this.updateUI(user, isAuth));
  }

  updateUI(user, isAuthenticated) {
    if (isAuthenticated && user) {
      // Keep the listing action available after authentication.
      if (this._loginBtn)  this._loginBtn.style.display  = 'none';
      if (this._signupBtn) {
        this._signupBtn.style.display = '';
        this._signupBtn.querySelector('span').textContent = '+ List a Book';
      }
      if (this._logoutBtn) this._logoutBtn.style.display = 'inline-flex';

      if (this._guestActions) this._guestActions.style.display = 'none';
      if (this._userActions)  this._userActions.style.display  = 'flex';

      const profile = user.profile || {};
      if (this._userName)   this._userName.textContent   = profile.full_name || 'Student';
      if (this._userAvatar) this._userAvatar.textContent = profile.avatar_emoji || '👨‍🎓';
    } else {
      if (this._loginBtn)  this._loginBtn.style.display  = '';
      if (this._signupBtn) {
        this._signupBtn.style.display = '';
        this._signupBtn.querySelector('span').textContent = '+ List a Book';
      }
      if (this._logoutBtn) this._logoutBtn.style.display = 'none';

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
    this._pillsContainer = document.getElementById('category-chips-bar');
    this._domReady = false;
  }

  render() {
    if (this._domReady) return;
    this._domReady = true;
    this._renderPills();
    this._renderSkeletons();
    this._loadImpact();
    setTimeout(() => this._loadBooks(), 300);
  }

  async _loadImpact() {
    const response = await api.getGlobalImpact();
    if (!response.ok) return;
    const values = {
      'global-books-second-chance': response.data.books_given_second_chance,
      'global-completed-handoffs': response.data.completed_interactions,
      'global-students-connected': response.data.students_connected,
      'global-community-books': response.data.community_books_shared,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = Number(value).toLocaleString();
    });
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
    for (let i = 0; i < 4; i++) this._grid.insertAdjacentHTML('beforeend', renderBookSkeleton());
  }

  async _loadBooks() {
    if (!this._grid) return;
    const response = await api.getBooks({ sort: 'nearest', limit: 4 });
    this._grid.innerHTML = '';
    if (!response.ok || !response.data?.items?.length) {
      this._grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">No database listings are available yet.</div>';
      return;
    }
    const books = response.data.items.map(normalizeBook);
    books.forEach(book => {
      const card = renderBookCard(
        book,
        () => {},
        () => this._modal.openBook(book)
      );
      this._grid.insertAdjacentHTML('beforeend', card);
    });
    this._grid.querySelectorAll('.view-book-btn').forEach(button => {
      button.addEventListener('click', () => this._modal.openBook(books.find(book => book.id === button.dataset.bookId)));
    });
    wireWishlistButtons(this._grid);
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
    this._typeFilter = document.getElementById('filter-type-select');
    this._categoryFilter = document.getElementById('filter-category-select');
    this._conditionFilter = document.getElementById('filter-condition-select');
    this._sortFilter = document.getElementById('sort-by-select');
    this._resetButton = document.getElementById('reset-filters-btn');
    this._skeletonButton = document.getElementById('toggle-skeleton-btn');
    this._emptyState = document.getElementById('discover-empty-state');
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
    this._categoryFilter?.addEventListener('change', () => this._renderBooks());
    this._conditionFilter?.addEventListener('change', () => this._renderBooks());
    this._sortFilter?.addEventListener('change', () => this._renderBooks());
    this._resetButton?.addEventListener('click', () => {
      if (this._search) this._search.value = '';
      if (this._typeFilter) this._typeFilter.value = 'all';
      if (this._categoryFilter) this._categoryFilter.value = 'all';
      if (this._conditionFilter) this._conditionFilter.value = 'all';
      if (this._sortFilter) this._sortFilter.value = 'nearest';
      this._renderBooks();
    });
    this._skeletonButton?.addEventListener('click', () => this._renderSkeletons());
  }

  async _renderBooks() {
    if (!this._grid) return;
    const response = await api.getBooks({
      q: this._search?.value?.trim(),
      listing_type: this._typeFilter?.value,
      category: this._categoryFilter?.value,
      condition: this._conditionFilter?.value,
      sort: this._sortFilter?.value || 'nearest',
    });
    const books = response.ok && response.data ? response.data.items.map(normalizeBook) : [];
    this._grid.innerHTML = '';

    if (books.length === 0) {
      if (this._emptyState) this._emptyState.style.display = 'block';
      return;
    }

    books.forEach(book => {
      const card = renderBookCard(
        book,
        () => {},
        () => this._modal.openBook(book)
      );
      this._grid.insertAdjacentHTML('beforeend', card);
    });
    this._grid.querySelectorAll('.view-book-btn').forEach(button => {
      button.addEventListener('click', () => this._modal.openBook(books.find(book => book.id === button.dataset.bookId)));
    });
    wireWishlistButtons(this._grid);
    if (this._emptyState) this._emptyState.style.display = 'none';
  }

  _renderSkeletons() {
    if (!this._grid) return;
    this._grid.innerHTML = '';
    if (this._emptyState) this._emptyState.style.display = 'none';
    for (let i = 0; i < 6; i++) {
      this._grid.insertAdjacentHTML('beforeend', renderBookSkeleton());
    }
    setTimeout(() => this._renderBooks(), 500);
  }
}

/* ────────────────────────────────────────────────────────────────
   PROFILE VIEW (Dynamic Auth State)
   ──────────────────────────────────────────────────────────────── */

class ProfileView {
  constructor(modal, listingForm) {
    this._modal     = modal;
    this._listingForm = listingForm;
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
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--color-primary),var(--color-secondary));display:flex;align-items:center;justify-content:center;font-size:2.5rem;flex-shrink:0;overflow:hidden;">
            ${profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;">` : (profile.avatar_emoji || '👨‍🎓')}
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
            <span class="stat-value" id="phase9-profile-rating">No reviews</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Books Given a Second Chance</span>
            <span class="stat-value" id="phase9-profile-books">—</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Completed Interactions</span>
            <span class="stat-value" id="phase9-profile-interactions">—</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Community Posts</span>
            <span class="stat-value" id="phase9-profile-posts">—</span>
          </div>
        </div>
      `;

      profileCard.querySelector('#edit-profile-btn')?.addEventListener('click', () => {
        this._modal.openEditProfile();
      });

      this._container.appendChild(profileCard);
      this._renderMyListings();
      this._renderPhase5Panels();
      this._renderPhase9Panels(user.id);
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

  async _renderMyListings() {
    const section = document.createElement('section');
    section.innerHTML = `
      <div class="section-header">
        <div class="section-title-wrap"><h2>My Listings</h2><p>Manage availability and listing details</p></div>
        <button type="button" class="btn btn-primary btn-sm" data-create-listing>+ List a Book</button>
      </div>
      <div class="listing-management-list"><p class="text-secondary">Loading your listings...</p></div>
    `;
    this._container.appendChild(section);
    section.querySelector('[data-create-listing]')?.addEventListener('click', () => this._listingForm.open());

    const list = section.querySelector('.listing-management-list');
    const response = await api.getMyListings();
    if (!section.isConnected) return;
    if (!response.ok) {
      list.innerHTML = `<p class="text-secondary">${escapeHtml(response.error || 'Could not load your listings.')}</p>`;
      return;
    }
    if (!response.data?.length) {
      list.innerHTML = '<div class="empty-state">You have not listed a book yet.</div>';
      return;
    }

    const statuses = ['active', 'paused', 'sold', 'exchanged', 'donated', 'lent'];
    list.innerHTML = response.data.map(listing => `
      <article class="card" style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap;padding:var(--space-4);margin-bottom:var(--space-3);">
        <div style="min-width:180px;flex:1;"><h3>${escapeHtml(listing.title)}</h3><p class="text-secondary">${escapeHtml(listing.author)} · ${escapeHtml(listing.listing_type_label)}${listing.is_seed_data ? ' · Demo listing' : ''}</p></div>
        <label class="form-group" style="margin:0;">Status<select class="form-select" data-listing-status="${escapeHtml(listing.id)}">${statuses.map(status => `<option value="${status}"${listing.status === status ? ' selected' : ''}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join('')}</select></label>
        <div style="display:flex;gap:var(--space-2);"><button type="button" class="btn btn-outline btn-sm" data-edit-listing="${escapeHtml(listing.id)}">Edit</button><button type="button" class="btn btn-ghost btn-sm" data-delete-listing="${escapeHtml(listing.id)}" aria-label="Delete ${escapeHtml(listing.title)}">Delete</button></div>
      </article>
    `).join('');

    list.querySelectorAll('[data-edit-listing]').forEach(button => {
      button.addEventListener('click', () => this._listingForm.open(response.data.find(item => item.id === button.dataset.editListing)));
    });
    list.querySelectorAll('[data-delete-listing]').forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this listing? This cannot be undone.')) return;
        const result = await api.deleteListing(button.dataset.deleteListing);
        if (result.ok) {
          window.toast?.show('Listing deleted.', 'success');
          this.render(true);
        } else window.toast?.show(result.error || 'Could not delete listing.', 'error');
      });
    });
    list.querySelectorAll('[data-listing-status]').forEach(select => {
      select.addEventListener('change', async () => {
        const result = await api.updateListing(select.dataset.listingStatus, { status: select.value });
        if (result.ok) window.toast?.show('Listing status updated.', 'success');
        else {
          window.toast?.show(result.error || 'Could not update status.', 'error');
          this.render(true);
        }
      });
    });
  }

  _renderPhase5Panels() {
    const section = document.createElement('section');
    section.className = 'phase5-section';
    this._phase5Section?.remove();
    this._phase5Section = section;
    section.innerHTML = `
      <div class="section-header"><div class="section-title-wrap"><h2>My BookLoop</h2><p>Saved books, requests, and completed book journeys</p></div></div>
      <div class="tabs-nav" role="tablist" aria-label="My books">
        <button class="tab-btn active" type="button" data-phase5-tab="library">My Library</button>
        <button class="tab-btn" type="button" data-phase5-tab="wishlist">Wishlist</button>
        <button class="tab-btn" type="button" data-phase5-tab="requests">Requests</button>
      </div>
      <div data-phase5-content><p class="text-secondary">Loading...</p></div>
    `;
    this._container.appendChild(section);
    const content = section.querySelector('[data-phase5-content]');
    const renderTab = async tab => {
      section.querySelectorAll('[data-phase5-tab]').forEach(button => button.classList.toggle('active', button.dataset.phase5Tab === tab));
      content.innerHTML = '<p class="text-secondary">Loading...</p>';
      const response = tab === 'library' ? await api.getLibrary() : tab === 'wishlist' ? await api.getWishlist() : await api.getRequests();
      if (!section.isConnected) return;
      if (!response.ok) {
        content.innerHTML = `<p class="text-secondary">${escapeHtml(response.error || 'Unable to load this section.')}</p>`;
        return;
      }
      if (tab === 'library') this._renderLibraryItems(content, response.data || []);
      else if (tab === 'wishlist') this._renderWishlistItems(content, response.data || []);
      else this._renderRequestItems(content, response.data || []);
    };
    section.querySelectorAll('[data-phase5-tab]').forEach(button => button.addEventListener('click', () => renderTab(button.dataset.phase5Tab)));
    renderTab('library');
  }

  async _renderPhase9Panels(userId) {
    const section = document.createElement('section');
    section.className = 'phase9-section';
    this._phase9Section?.remove();
    this._phase9Section = section;
    section.innerHTML = `
      <div class="section-header"><div class="section-title-wrap"><h2>Trust, Reviews & Impact</h2><p>Ratings are from completed BookLoop interactions; impact totals come from recorded activity.</p></div></div>
      <div class="phase9-impact" data-personal-impact><p class="text-secondary">Loading your impact...</p></div>
      <div class="phase9-reviews">
        <div class="phase9-review-group"><h3>Reviews to write</h3><div data-eligible-reviews><p class="text-secondary">Loading completed interactions...</p></div></div>
        <div class="phase9-review-group"><h3>Reviews about you</h3><div data-received-reviews><p class="text-secondary">Loading reviews...</p></div></div>
      </div>
    `;
    this._container.appendChild(section);

    const [impactResponse, eligibleResponse, reviewResponse] = await Promise.all([
      api.getMyImpact(),
      api.getEligibleReviews(),
      api.getUserReviews(userId),
    ]);
    if (!section.isConnected) return;

    const trustValue = document.getElementById('phase9-profile-rating');
    const bookValue = document.getElementById('phase9-profile-books');
    const interactionValue = document.getElementById('phase9-profile-interactions');
    const postsValue = document.getElementById('phase9-profile-posts');
    if (reviewResponse.ok) {
      const summary = reviewResponse.data;
      const score = summary.average_rating == null ? 'No reviews' : `★ ${summary.average_rating.toFixed(1)} (${summary.review_count})`;
      if (trustValue) trustValue.textContent = score;
      const reviews = section.querySelector('[data-received-reviews]');
      reviews.innerHTML = summary.reviews.length ? summary.reviews.map(review => `
        <article class="phase9-review-item"><div class="phase9-review-heading"><strong>${escapeHtml(review.reviewer_name)}</strong><span class="phase9-rating">★ ${review.rating}/5</span></div><p>${escapeHtml(review.book_title)} · Completed interaction</p>${review.comment ? `<blockquote>${escapeHtml(review.comment)}</blockquote>` : ''}<small>${formatDate(review.created_at)}</small></article>
      `).join('') : '<div class="empty-state">No reviews received yet. Reviews can be left after a completed handoff.</div>';
    } else {
      if (trustValue) trustValue.textContent = 'Unavailable';
      section.querySelector('[data-received-reviews]').innerHTML = `<p class="text-secondary">${escapeHtml(reviewResponse.error || 'Could not load reviews.')}</p>`;
    }

    if (impactResponse.ok) {
      const impact = impactResponse.data;
      if (bookValue) bookValue.textContent = impact.books_given_second_chance.toLocaleString();
      if (interactionValue) interactionValue.textContent = impact.completed_interactions.toLocaleString();
      if (postsValue) postsValue.textContent = impact.posts_created.toLocaleString();
      section.querySelector('[data-personal-impact]').innerHTML = `
        <div class="stat-grid">
          <div class="stat-tile"><span class="stat-label">Books passed on</span><span class="stat-value">${impact.books_passed_on}</span></div>
          <div class="stat-tile"><span class="stat-label">Books received</span><span class="stat-value">${impact.books_received}</span></div>
          <div class="stat-tile"><span class="stat-label">Sold</span><span class="stat-value">${impact.books_sold}</span></div>
          <div class="stat-tile"><span class="stat-label">Donated</span><span class="stat-value">${impact.books_donated}</span></div>
          <div class="stat-tile"><span class="stat-label">Exchanged</span><span class="stat-value">${impact.books_exchanged}</span></div>
          <div class="stat-tile"><span class="stat-label">Lent</span><span class="stat-value">${impact.books_lent}</span></div>
          <div class="stat-tile"><span class="stat-label">Students connected</span><span class="stat-value">${impact.students_connected}</span></div>
          <div class="stat-tile"><span class="stat-label">Communities joined</span><span class="stat-value">${impact.communities_joined}</span></div>
        </div>
      `;
    } else {
      section.querySelector('[data-personal-impact]').innerHTML = `<p class="text-secondary">${escapeHtml(impactResponse.error || 'Could not load impact totals.')}</p>`;
    }

    const eligibleContainer = section.querySelector('[data-eligible-reviews]');
    if (!eligibleResponse.ok) {
      eligibleContainer.innerHTML = `<p class="text-secondary">${escapeHtml(eligibleResponse.error || 'Could not load completed interactions.')}</p>`;
      return;
    }
    const eligible = eligibleResponse.data || [];
    eligibleContainer.innerHTML = eligible.length ? eligible.map(item => `
      <article class="phase9-review-item">
        <div class="phase9-review-heading"><strong>${escapeHtml(item.other_user_name)}</strong><span>${item.direction === 'provided' ? 'You provided' : 'You received'} · ${escapeHtml(item.book_title)}</span></div>
        <form class="phase9-review-form" data-review-request="${escapeHtml(item.request_id)}">
          <label class="form-group"><span class="form-label">Rating</span><select class="form-select" name="rating" required><option value="">Choose 1–5 stars</option><option value="5">5 · Excellent</option><option value="4">4 · Good</option><option value="3">3 · Okay</option><option value="2">2 · Poor</option><option value="1">1 · Bad</option></select></label>
          <label class="form-group"><span class="form-label">Review (optional)</span><textarea class="form-input" name="comment" rows="2" maxlength="2000" placeholder="Describe your completed exchange."></textarea></label>
          <button class="btn btn-primary btn-sm" type="submit">Submit review</button>
        </form>
      </article>
    `).join('') : '<div class="empty-state">No completed interactions are waiting for your review.</div>';
    eligibleContainer.querySelectorAll('[data-review-request]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton.disabled) return;
      const values = new FormData(form);
      submitButton.disabled = true;
      const result = await api.createReview({
        request_id: form.dataset.reviewRequest,
        rating: Number(values.get('rating')),
        comment: values.get('comment')?.trim() || null,
      });
      if (result.ok) {
        window.toast?.show('Review submitted. Trust score uses submitted ratings.', 'success');
        this.render(true);
      } else {
        submitButton.disabled = false;
        window.toast?.show(result.error || 'Could not submit review.', 'error');
      }
    }));
  }

  _renderLibraryItems(container, items) {
    const categories = ['all', 'owned', 'listed', 'borrowed', 'lent', 'sold', 'donated', 'exchanged'];
    container.innerHTML = `
      <div class="hero-filter-pills" role="group" aria-label="Filter library by lifecycle">
        ${categories.map(category => `<button type="button" class="filter-pill${category === 'all' ? ' active' : ''}" data-library-filter="${category}">${category[0].toUpperCase()}${category.slice(1)}</button>`).join('')}
      </div>
      <div class="library-items" style="margin-top:var(--space-4);"></div>
    `;
    const list = container.querySelector('.library-items');
    const draw = filter => {
      const visible = filter === 'all' ? items : items.filter(item => item.category === filter);
      list.innerHTML = visible.length ? visible.map(item => `
        <article class="card" style="display:flex;justify-content:space-between;gap:var(--space-3);align-items:center;padding:var(--space-4);margin-bottom:var(--space-3);">
          <div><h3>${escapeHtml(item.title)}</h3><p class="text-secondary">${escapeHtml(item.author)} · ${escapeHtml(item.category)} · ${escapeHtml(item.status)}${item.is_seed_data ? ' · Demo data' : ''}</p></div>
          ${item.other_student ? `<span class="text-secondary">With ${escapeHtml(item.other_student)}</span>` : ''}
        </article>
      `).join('') : '<div class="empty-state">No books in this library category yet.</div>';
    };
    container.querySelectorAll('[data-library-filter]').forEach(button => button.addEventListener('click', () => {
      container.querySelectorAll('[data-library-filter]').forEach(option => option.classList.toggle('active', option === button));
      draw(button.dataset.libraryFilter);
    }));
    draw('all');
  }

  _renderWishlistItems(container, items) {
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Your wishlist is empty. Save a book from Discover to keep track of it.</div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <article class="card" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);flex-wrap:wrap;padding:var(--space-4);margin-bottom:var(--space-3);">
        <div><h3>${escapeHtml(item.title)}</h3><p class="text-secondary">${escapeHtml(item.author)} · ${escapeHtml(item.listing_type_label)} · ${item.is_available ? 'Available now' : `Unavailable (${escapeHtml(item.status)})`}${item.is_seed_data ? ' · Demo data' : ''}</p></div>
        <button type="button" class="btn btn-outline btn-sm" data-remove-wishlist="${escapeHtml(item.book_id)}">Remove</button>
      </article>
    `).join('');
    container.querySelectorAll('[data-remove-wishlist]').forEach(button => button.addEventListener('click', async () => {
      const result = await api.removeFromWishlist(button.dataset.removeWishlist);
      if (result.ok) {
        window.toast?.show('Removed from wishlist.', 'success');
        this._renderPhase5Panels();
      } else window.toast?.show(result.error || 'Could not remove this book.', 'error');
    }));
  }

  _renderRequestItems(container, requests) {
    if (!requests.length) {
      container.innerHTML = '<div class="empty-state">No book requests yet.</div>';
      return;
    }
    container.innerHTML = requests.map(request => {
      const actions = request.direction === 'incoming'
        ? request.status === 'pending' ? [['accepted', 'Accept'], ['rejected', 'Reject']] : request.status === 'accepted' ? [['completed', 'Mark completed']] : []
        : ['pending', 'accepted'].includes(request.status) ? [['cancelled', 'Cancel']] : [];
      const person = request.direction === 'incoming' ? request.requester_name : request.owner_name;
      return `
        <article class="card" style="padding:var(--space-4);margin-bottom:var(--space-3);">
          <div style="display:flex;justify-content:space-between;gap:var(--space-3);align-items:flex-start;flex-wrap:wrap;">
            <div><h3>${escapeHtml(request.title)}</h3><p class="text-secondary">${request.direction === 'incoming' ? 'Requested by' : 'Requested from'} ${escapeHtml(person)} · ${escapeHtml(request.listing_type)} · ${escapeHtml(request.status)}</p>${request.message ? `<p>${escapeHtml(request.message)}</p>` : ''}</div>
            <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">${actions.map(([status, label]) => `<button type="button" class="btn ${status === 'rejected' || status === 'cancelled' ? 'btn-outline' : 'btn-primary'} btn-sm" data-request-id="${escapeHtml(request.id)}" data-request-status="${status}">${label}</button>`).join('')}<button type="button" class="btn btn-outline btn-sm" data-request-chat="${escapeHtml(request.id)}">Open chat</button></div>
          </div>
        </article>
      `;
    }).join('');
    container.querySelectorAll('[data-request-id]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await api.updateRequest(button.dataset.requestId, button.dataset.requestStatus);
      if (result.ok) {
        window.toast?.show(`Request ${button.dataset.requestStatus}.`, 'success');
        this._renderPhase5Panels();
        window.dispatchEvent(new CustomEvent('notificationsChanged'));
      } else {
        button.disabled = false;
        window.toast?.show(result.error || 'Could not update request.', 'error');
      }
    }));
    container.querySelectorAll('[data-request-chat]').forEach(button => button.addEventListener('click', () => window.bookloopChat?.openForRequest(button.dataset.requestChat)));
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
  // Fade out initial splash screen
  const splash = document.getElementById('splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('fade-out');
    }, 400);
  }

  const theme = new ThemeManager();
  const themeButton = document.getElementById('theme-toggle-btn');
  const updateThemeButton = () => {
    const isDark = theme.currentTheme === 'dark';
    if (themeButton) {
      themeButton.textContent = isDark ? '☀️' : '🌙';
      themeButton.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }
  };
  themeButton?.addEventListener('click', () => {
    theme.toggle();
    updateThemeButton();
  });
  updateThemeButton();
  const toast = new ToastManager();  // Exposes window.toast globally
  const modal = new ModalController();
  const listingForm = new ListingFormController();
  const chatView = new ChatView(appRouter);
  const notificationCenter = new NotificationCenter();
  window.bookloopChat = chatView;
  const headerAuth = new HeaderAuthController(modal, listingForm);

  if (auth.token) {
    const session = await api.getMe();
    if (session.ok && session.data) {
      auth.setSession(auth.token, session.data, Boolean(localStorage.getItem('bookloop_access_token')));
    } else {
      auth.logout();
    }
  }

  const homeView        = new HomeView(modal);
  const discoverView    = new DiscoverView(modal);
  const communitiesView = new CommunitiesView();
  const nearbyView      = new NearbyView(modal);
  const profileView     = new ProfileView(modal, listingForm);
  window.bookloopCommunities = communitiesView;

  document.querySelectorAll('[data-nav-route="profile"]').forEach(link => {
    link.addEventListener('click', () => profileView.render(true));
  });
  window.addEventListener('listingChanged', () => profileView.render(true));
  window.addEventListener('requestsChanged', () => profileView.render(true));
  window.addEventListener('wishlistChanged', () => profileView.render(true));
  auth.onChange(() => {
    if (appRouter.currentRoute === 'chats') chatView.render();
  });

  appRouter
    .register('home', () => homeView.render())
    .register('discover', () => discoverView.render())
    .register('nearby', () => nearbyView.render())
    .register('communities', () => communitiesView.render())
    .register('chats', () => chatView.render())
    .register('profile', () => profileView.render());

  // Home search wiring
  document.getElementById('hero-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = document.getElementById('hero-search-input')?.value?.trim();
    if (q) {
      const discoverSearch = document.getElementById('discover-search-input');
      if (discoverSearch) { discoverSearch.value = q; discoverSearch.dispatchEvent(new Event('input')); }
    }
    appRouter.navigate('discover');
  });

  // Execute initial view render
  appRouter.handleRouteChange();

  const onboarding = document.getElementById('onboarding-modal');
  const onboardingDone = localStorage.getItem('bookloop_onboarding_complete');
  if (onboarding && !onboardingDone) {
    setTimeout(() => onboarding.showModal(), 700);
  }
  onboarding?.querySelectorAll('[data-onboarding-close]').forEach(button => {
    button.addEventListener('click', () => {
      localStorage.setItem('bookloop_onboarding_complete', 'true');
      onboarding.close();
    });
  });

  // Start health poller
  const poller = new HealthPoller();
  poller.start();
  notificationCenter.refreshCount();
  setInterval(() => notificationCenter.refreshCount(), 20000);

  console.log(`%cBookLoop ✦ ${CONFIG.CURRENT_PHASE}`, 'color:#818cf8;font-weight:700;font-size:14px;');
}

main().catch(console.error);

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function normalizeBook(book) {
  return {
    ...book,
    conditionLabel: book.condition_label,
    listingType: book.listing_type,
    listingTypeLabel: book.listing_type_label,
    priceUnit: book.price_unit || '',
    originalPrice: book.original_price,
    coverGradient: book.cover_gradient || 'linear-gradient(135deg, #334155 0%, #64748B 100%)',
    distanceKm: book.distance_km ?? 0,
    courseCode: book.course_code || '',
    isWishlisted: false,
    seller: {
      name: book.seller?.name || 'BookLoop Student',
      college: book.seller?.university || 'Student Campus',
      year: book.seller?.year || '',
      trustScore: book.seller?.trust_score ?? null,
      reviewsCount: book.seller?.reviews_count ?? 0,
      avatar: book.seller?.avatar_emoji || '👨‍🎓',
    },
  };
}

async function wireWishlistButtons(container) {
  const buttons = [...container.querySelectorAll('.wishlist-btn')];
  if (!buttons.length) return;
  const savedIds = new Set();
  if (auth.isAuthenticated) {
    const response = await api.getWishlist();
    if (response.ok) response.data.forEach(item => savedIds.add(item.book_id));
  }
  buttons.forEach(button => {
    const bookId = button.dataset.bookId;
    const setSaved = saved => {
      button.classList.toggle('active', saved);
      button.title = saved ? 'Remove from Wishlist' : 'Add to Wishlist';
      button.setAttribute('aria-label', button.title);
      button.querySelector('svg')?.setAttribute('fill', saved ? 'currentColor' : 'none');
    };
    setSaved(savedIds.has(bookId));
    button.addEventListener('click', async event => {
      event.stopPropagation();
      if (!auth.isAuthenticated) {
        document.getElementById('open-login-btn')?.click();
        window.toast?.show('Log in to save books to your wishlist.', 'info');
        return;
      }
      button.disabled = true;
      const saved = button.classList.contains('active');
      const response = saved ? await api.removeFromWishlist(bookId) : await api.addToWishlist(bookId);
      button.disabled = false;
      if (!response.ok) {
        window.toast?.show(response.error || 'Could not update your wishlist.', 'error');
        return;
      }
      setSaved(!saved);
      window.toast?.show(saved ? 'Removed from wishlist.' : 'Saved to wishlist.', 'success');
      window.dispatchEvent(new CustomEvent('wishlistChanged'));
    });
  });
}
