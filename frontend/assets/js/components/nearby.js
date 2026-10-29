import { api } from '../api.js?v=9';

export class NearbyView {
  constructor(modal) {
    this.modal = modal;
    this.container = document.getElementById('nearby-view-content');
    this.points = [];
    this.locationFilter = null;

    document.getElementById('nearby-origin-form')?.addEventListener('submit', event => {
      event.preventDefault();
      this.useTextLocation();
    });
    document.getElementById('nearby-clear-location')?.addEventListener('click', () => {
      this.clearLocationFilter();
    });

    // Re-fetch when user creates or modifies a listing so user's own books appear immediately
    window.addEventListener('listingChanged', () => {
      if (this.container?.isConnected) {
        this.render();
      }
    });
  }

  useTextLocation() {
    const input = document.getElementById('nearby-location-input');
    const query = input?.value?.trim() || null;
    this.locationFilter = query;
    this.showOriginStatus(query ? `Filtering for: "${query}"` : '');
    this.render();
  }

  clearLocationFilter() {
    const input = document.getElementById('nearby-location-input');
    if (input) input.value = '';
    this.locationFilter = null;
    this.showOriginStatus('');
    this.render();
  }

  showOriginStatus(message) {
    const status = document.getElementById('nearby-origin-status');
    if (status) status.textContent = message;
  }

  async render() {
    if (!this.container) return;
    this.container.innerHTML = '<p class="text-secondary">Loading nearby places...</p>';
    const pointsResponse = await api.getMapPoints(null, this.locationFilter || null);
    if (!pointsResponse.ok) {
      this.container.innerHTML = `<div class="empty-state">${escapeHtml(pointsResponse.error || 'Nearby listings are unavailable right now.')}</div>`;
      return;
    }
    this.points = pointsResponse.data || [];
    this.container.innerHTML = `
      <div class="nearby-summary">
        <span class="badge badge-emerald">${this.points.length} available</span>
        <span class="text-secondary">Showing campus books and communities matching your location search.</span>
      </div>
      <section class="nearby-list-view">
        <div class="nearby-results-toolbar">
          <h2>Nearby books and communities</h2>
        </div>
        <div class="nearby-results" data-nearby-results></div>
      </section>
    `;
    this.renderResults();
  }

  renderResults() {
    if (!this.container?.isConnected) return;
    const results = this.container.querySelector('[data-nearby-results]');
    if (!results) return;

    if (!this.points.length) {
      results.innerHTML = `<div class="empty-state">${this.locationFilter ? `No books found in this city.` : 'No location-tagged books or communities available right now.'}</div>`;
      return;
    }

    results.innerHTML = this.points.map(point => `
      <article class="nearby-result">
        <span class="nearby-point-icon ${point.point_type}" aria-hidden="true">${point.point_type === 'book' ? '▤' : '◉'}</span>
        <div class="nearby-result-copy">
          <div class="nearby-result-heading">
            <span class="badge ${point.point_type === 'book' ? 'badge-emerald' : 'badge-indigo'}">${point.point_type === 'book' ? 'Book' : 'Community'}</span>
            ${point.is_seed_data ? '<span class="badge badge-amber">Demo data</span>' : ''}
          </div>
          <h3>${escapeHtml(point.title)}</h3>
          <p>${escapeHtml(point.subtitle)}</p>
          <small>📍 Location: ${escapeHtml(point.location_name || 'On Campus')}</small>
        </div>
        <div class="nearby-result-actions">
          ${point.point_type === 'book' ? `<button type="button" class="btn btn-outline btn-sm" data-nearby-book="${escapeHtml(point.id)}">Details</button>` : `<button type="button" class="btn btn-outline btn-sm" data-nearby-community="${escapeHtml(point.id)}">Community</button>`}
        </div>
      </article>
    `).join('');

    results.querySelectorAll('[data-nearby-book]').forEach(button => button.addEventListener('click', () => this.openBook(button.dataset.nearbyBook)));
    results.querySelectorAll('[data-nearby-community]').forEach(button => button.addEventListener('click', () => window.bookloopCommunities?.openCommunity(button.dataset.nearbyCommunity)));
  }

  async openBook(bookId) {
    const response = await api.getBook(bookId);
    if (!response.ok) {
      window.toast?.show(response.error || 'Could not load this listing.', 'error');
      return;
    }
    this.modal.openBook(normalizeBook(response.data));
  }
}

function normalizeBook(book) {
  return {
    ...book,
    conditionLabel: book.condition_label,
    listingType: book.listing_type,
    listingTypeLabel: book.listing_type_label,
    priceUnit: book.price_unit || '',
    originalPrice: book.original_price,
    coverGradient: book.cover_gradient || 'linear-gradient(135deg, #1E293B, #334155)',
    courseCode: book.course_code || '',
    exchangeWish: book.exchange_wish || '',
    seller: {
      name: book.seller?.name || 'BookLoop Student',
      college: book.seller?.university || 'Student Campus',
      location: book.seller?.location || '',
      year: book.seller?.year || '',
      trustScore: book.seller?.trust_score ?? null,
      reviewsCount: book.seller?.reviews_count ?? 0,
      avatar: book.seller?.avatar_emoji || '👨‍🎓',
    },
  };
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}
