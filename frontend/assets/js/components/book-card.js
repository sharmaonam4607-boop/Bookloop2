function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    if (typeof window !== 'undefined' && ['5500', '3000', '5173'].includes(window.location.port)) {
      return `http://127.0.0.1:8000${url}`;
    }
  }
  return url;
}

export const DEFAULT_BOOK_COVER = 'assets/images/default-book-cover.svg';

export function renderBookCard(book) {
  const isWishlisted = Boolean(book.isWishlisted);
  const sellerTrust = (book.seller.trustScore == null || isNaN(book.seller.trustScore))
    ? 'New Student'
    : `★ ${Number(book.seller.trustScore).toFixed(1)} <span class="reviews-count">(${book.seller.reviewsCount || 0})</span>`;

  // Format Price / Availability Badge
  let priceBadgeHtml = '';
  if (book.listingType === 'sell') {
    priceBadgeHtml = `
      <div class="book-badge badge-sell">
        <span class="price-curr">₹${escapeHtml(String(book.price ?? 0))}</span>
        ${book.originalPrice ? `<span class="price-orig">₹${escapeHtml(String(book.originalPrice))}</span>` : ''}
      </div>
    `;
  } else if (book.listingType === 'exchange') {
    priceBadgeHtml = `
      <div class="book-badge badge-exchange">
        <span>⇄ Exchange</span>
      </div>
    `;
  } else if (book.listingType === 'donate') {
    priceBadgeHtml = `
      <div class="book-badge badge-donate">
        <span>🎁 Free Donation</span>
      </div>
    `;
  } else if (book.listingType === 'lend') {
    priceBadgeHtml = `
      <div class="book-badge badge-lend">
        <span>⏱ ₹${escapeHtml(String(book.price ?? 0))}${escapeHtml(book.priceUnit || '')}</span>
      </div>
    `;
  }

  // Condition Badge Color
  let conditionClass = 'condition-good';
  if (book.condition === 'like_new' || book.condition === 'new') conditionClass = 'condition-new';
  if (book.condition === 'worn') conditionClass = 'condition-worn';

  const rawPhoto = (Array.isArray(book.image_urls) && book.image_urls[0])
    ? book.image_urls[0]
    : (Array.isArray(book.imageUrls) && book.imageUrls[0])
      ? book.imageUrls[0]
      : (typeof book.image_url === 'string' && book.image_url)
        ? book.image_url
        : null;

  const photoUrl = resolveImageUrl(rawPhoto);
  const displayCover = photoUrl || DEFAULT_BOOK_COVER;
  const hasUploadedPhoto = Boolean(photoUrl);

  const locationText = book.safe_meeting_point || book.safeMeetingPoint || (book.seller && book.seller.location) || '';

  return `
    <article class="book-card" data-book-id="${escapeHtml(String(book.id))}" tabindex="0" role="region" aria-label="${escapeHtml(book.title)}">
      <!-- Book Cover Container with Default Visual & Fallback -->
      <div class="book-cover ${hasUploadedPhoto ? 'has-photo' : 'has-default-cover'}">
        <img class="book-cover-img" 
             src="${escapeHtml(displayCover)}" 
             alt="${escapeHtml(book.title)}" 
             loading="lazy" 
             onerror="if (this.src !== '${DEFAULT_BOOK_COVER}' && !this.src.endsWith('${DEFAULT_BOOK_COVER}')) { this.src = '${DEFAULT_BOOK_COVER}'; this.parentElement.classList.remove('has-photo'); this.parentElement.classList.add('has-default-cover'); }">
        
        <!-- Top Overlay Tags -->
        <div class="cover-top-bar">
          ${priceBadgeHtml}
          <span class="condition-chip ${conditionClass}">${escapeHtml(book.conditionLabel || book.condition || 'Good')}</span>
        </div>

        <!-- Wishlist Button -->
        <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" 
                data-book-id="${escapeHtml(String(book.id))}" 
                aria-label="${isWishlisted ? 'Remove from Wishlist' : 'Save to Wishlist'}"
                title="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>

      <!-- Book Card Body -->
      <div class="book-card-body">
        <div class="course-meta">
          <span class="course-tag">${escapeHtml(book.courseCode || (book.category ? book.category.toUpperCase() : 'GENERAL'))}</span>
          ${locationText ? `<span class="location-tag" title="Available at: ${escapeHtml(locationText)}">📍 ${escapeHtml(locationText)}</span>` : ''}
        </div>

        <h4 class="book-card-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h4>
        <p class="book-card-author">by ${escapeHtml(book.author)}</p>

        <!-- Seller Profile & Trust Footer -->
        <div class="book-card-footer">
          <div class="seller-info">
            <span class="seller-avatar" aria-hidden="true">${escapeHtml(book.seller.avatar || '👨‍🎓')}</span>
            <div class="seller-text">
              <span class="seller-name">${escapeHtml(book.seller.name)}</span>
              <span class="seller-trust">${sellerTrust}</span>
            </div>
          </div>

          <button class="btn btn-outline btn-sm view-book-btn" data-book-id="${escapeHtml(String(book.id))}">
            View Details
          </button>
        </div>
      </div>
    </article>
  `;
}

export function renderBookSkeleton() {
  return `
    <div class="book-card skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="book-card-body">
        <div class="skeleton skeleton-line" style="width: 40%; height: 14px; margin-bottom: 8px;"></div>
        <div class="skeleton skeleton-line" style="width: 85%; height: 20px; margin-bottom: 6px;"></div>
        <div class="skeleton skeleton-line" style="width: 60%; height: 14px; margin-bottom: 16px;"></div>
        <div class="skeleton skeleton-line" style="width: 100%; height: 36px; border-radius: 8px;"></div>
      </div>
    </div>
  `;
}
