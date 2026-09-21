/**
 * BookLoop Reusable Book Card Component
 */

export function renderBookCard(book) {
  const isWishlisted = book.isWishlisted;

  // Format Price / Tag
  let priceBadgeHtml = '';
  if (book.listingType === 'sell') {
    priceBadgeHtml = `
      <div class="book-badge badge-sell">
        <span class="price-curr">₹${book.price}</span>
        ${book.originalPrice ? `<span class="price-orig">₹${book.originalPrice}</span>` : ''}
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
        <span>⏱ ₹${book.price}${book.priceUnit || ''}</span>
      </div>
    `;
  }

  // Condition Badge Color
  let conditionClass = 'condition-good';
  if (book.condition === 'like_new') conditionClass = 'condition-new';
  if (book.condition === 'worn') conditionClass = 'condition-worn';

  return `
    <article class="book-card" data-book-id="${book.id}">
      <!-- Book Cover Container -->
      <div class="book-cover" style="background: ${book.coverGradient}">
        <!-- Top Overlay Tags -->
        <div class="cover-top-bar">
          ${priceBadgeHtml}
          <span class="condition-chip ${conditionClass}">${book.conditionLabel}</span>
        </div>

        <!-- Book Spine & Visual Layout -->
        <div class="cover-visual">
          <div class="cover-title-block">
            <span class="cover-sub">${book.edition || 'Student Edition'}</span>
            <h3 class="cover-title">${book.title}</h3>
            <p class="cover-author">${book.author}</p>
          </div>
          <div class="cover-spine"></div>
        </div>

        <!-- Wishlist Button -->
        <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" 
                data-book-id="${book.id}" 
                aria-label="Save to Wishlist"
                title="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>

      <!-- Book Card Body -->
      <div class="book-card-body">
        <div class="course-meta">
          <span class="course-tag">${book.courseCode || book.category.toUpperCase()}</span>
          <span class="distance-tag">📍 ${book.distanceKm} km away</span>
        </div>

        <h4 class="book-card-title" title="${book.title}">${book.title}</h4>
        <p class="book-card-author">by ${book.author}</p>

        <!-- Seller Profile & Trust Footer -->
        <div class="book-card-footer">
          <div class="seller-info">
            <span class="seller-avatar">${book.seller.avatar || '👨‍🎓'}</span>
            <div class="seller-text">
              <span class="seller-name">${book.seller.name}</span>
              <span class="seller-trust">⭐ ${book.seller.trustScore.toFixed(1)} <span class="reviews-count">(${book.seller.reviewsCount})</span></span>
            </div>
          </div>

          <button class="btn btn-outline btn-sm view-book-btn" data-book-id="${book.id}">
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
