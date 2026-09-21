/**
 * BookLoop Book Card Component
 * Renders a glassmorphism book card with hover elevation, wishlist, and actions.
 */

/**
 * Returns badge class based on listing type.
 */
export function listingBadgeClass(type) {
  const map = { sell: 'badge-sell', exchange: 'badge-exchange', donate: 'badge-donate', lend: 'badge-lend' };
  return map[type] || 'badge-glass';
}

/**
 * Returns badge class based on condition.
 */
export function conditionBadgeClass(condition) {
  const map = { like_new: 'badge-like_new', good: 'badge-good', worn: 'badge-worn' };
  return map[condition] || 'badge-glass';
}

/**
 * Formats a price display based on listing type and price.
 */
function formatPrice(book) {
  if (book.listingType === 'donate') return { label: 'Free', cls: 'free' };
  if (book.listingType === 'exchange') return { label: 'Exchange', cls: 'lend' };
  if (book.listingType === 'lend') return { label: `₹${book.price}${book.priceUnit || '/mo'}`, cls: 'lend' };
  if (book.price > 0) return { label: `₹${book.price}`, cls: '' };
  return { label: 'Free', cls: 'free' };
}

/**
 * Generates star icons for trust score.
 */
function trustStars(score) {
  return '★'.repeat(Math.round(score)) + '☆'.repeat(5 - Math.round(score));
}

/**
 * Returns action buttons based on listing type.
 */
function cardActions(book) {
  const actions = {
    sell:     ['<button class="btn btn-primary btn-sm" data-action="buy">Buy Now</button>',     '<button class="btn btn-glass btn-sm" data-action="contact">Contact</button>'],
    exchange: ['<button class="btn btn-cyan btn-sm" data-action="exchange">Exchange</button>',  '<button class="btn btn-glass btn-sm" data-action="contact">Message</button>'],
    donate:   ['<button class="btn btn-primary btn-sm" data-action="request">Request</button>', '<button class="btn btn-glass btn-sm" data-action="contact">Message</button>'],
    lend:     ['<button class="btn btn-cyan btn-sm" data-action="borrow">Borrow</button>',      '<button class="btn btn-glass btn-sm" data-action="contact">Contact</button>'],
  };
  return (actions[book.listingType] || actions.sell).join('');
}

/**
 * Creates and returns a book card DOM element.
 * @param {Object} book - Book data object from mock-books.js
 * @param {Function} onWishlistToggle - callback(bookId)
 * @param {Function} onCardClick - callback(book)
 */
export function createBookCard(book, onWishlistToggle, onCardClick) {
  const price = formatPrice(book);
  const wishIcon = book.isWishlisted ? '❤️' : '🤍';
  const card = document.createElement('article');
  card.className = 'book-card reveal';
  card.setAttribute('data-book-id', book.id);
  card.setAttribute('aria-label', `${book.title} by ${book.author}`);
  card.setAttribute('role', 'article');

  card.innerHTML = `
    <!-- Cover -->
    <div class="book-card__cover">
      <div class="book-card__cover-bg" style="background:${book.coverGradient}"></div>
      <span class="book-card__icon" aria-hidden="true">📖</span>
      <div class="book-card__type-badge">
        <span class="badge badge-${book.listingType}">${book.listingTypeLabel}</span>
      </div>
    </div>

    <!-- Wishlist toggle -->
    <button
      class="book-card__wishlist${book.isWishlisted ? ' active' : ''}"
      aria-label="${book.isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}"
      title="${book.isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}"
      data-wishlist="${book.id}"
    >${wishIcon}</button>

    <!-- Body -->
    <div class="book-card__body">
      <!-- Condition -->
      <span class="badge badge-${book.condition}" style="align-self:flex-start">${book.conditionLabel}</span>

      <!-- Title & author -->
      <div>
        <h3 class="book-card__title">${escapeHtml(book.title)}</h3>
        <p class="book-card__author">${escapeHtml(book.author)} &mdash; ${escapeHtml(book.edition)}</p>
      </div>

      <!-- Price & distance -->
      <div class="book-card__meta">
        <span class="book-card__price ${price.cls}">${price.label}</span>
        ${book.listingType === 'sell' && book.originalPrice ? `<span class="book-card__original-price">₹${book.originalPrice}</span>` : ''}
        <span class="book-card__distance">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${book.distanceKm} km
        </span>
      </div>

      <!-- Seller row -->
      <div class="book-card__seller">
        <div class="book-card__seller-avatar" aria-hidden="true">${book.seller.avatar}</div>
        <span class="book-card__seller-name">${escapeHtml(book.seller.name)}</span>
        <span class="book-card__seller-trust" title="Trust score: ${book.seller.trustScore}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${book.seller.trustScore.toFixed(1)}
        </span>
      </div>
    </div>

    <!-- Actions — revealed on hover -->
    <div class="book-card__actions" aria-label="Book actions">
      ${cardActions(book)}
    </div>
  `;

  // Wishlist button
  const wishBtn = card.querySelector('[data-wishlist]');
  wishBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    book.isWishlisted = !book.isWishlisted;
    wishBtn.textContent = book.isWishlisted ? '❤️' : '🤍';
    wishBtn.classList.toggle('active', book.isWishlisted);
    wishBtn.setAttribute('aria-label', book.isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
    wishBtn.setAttribute('title', book.isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
    if (onWishlistToggle) onWishlistToggle(book.id, book.isWishlisted);
  });

  // Action buttons
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onCardClick) onCardClick(book, btn.dataset.action);
    });
  });

  // Card click → open detail
  card.addEventListener('click', () => {
    if (onCardClick) onCardClick(book, 'view');
  });

  // Keyboard accessibility
  card.setAttribute('tabindex', '0');
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
  });

  return card;
}

/**
 * Creates a skeleton placeholder card for loading state.
 */
export function createSkeletonCard() {
  const el = document.createElement('div');
  el.className = 'skeleton-card';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="skeleton skeleton-cover"></div>
    <div class="skeleton-body">
      <div class="skeleton skeleton-line skeleton-line-short" style="height:20px;width:50%;"></div>
      <div>
        <div class="skeleton skeleton-line skeleton-line-long" style="height:14px;margin-bottom:6px;"></div>
        <div class="skeleton skeleton-line skeleton-line-med" style="height:11px;"></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="skeleton skeleton-line skeleton-line-short" style="height:18px;width:60px;"></div>
        <div class="skeleton skeleton-line" style="height:11px;width:50px;margin-left:auto;"></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);">
        <div class="skeleton skeleton-line" style="height:28px;width:28px;border-radius:50%;"></div>
        <div class="skeleton skeleton-line" style="height:11px;flex:1;"></div>
        <div class="skeleton skeleton-line" style="height:11px;width:30px;"></div>
      </div>
    </div>
  `;
  return el;
}

/**
 * Escapes HTML special chars to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
