/**
 * BookLoop Modal Controller
 * Manages native <dialog> element — Auth modal (login/signup) and Book detail modal.
 */

export class ModalController {
  constructor() {
    this._initAuthModal();
    this._initBookModal();
    this._bindGlobalClose();
  }

  /* ──────────────────────────────── AUTH MODAL ──────────────────────────────── */

  _initAuthModal() {
    this._authDialog = document.getElementById('modal-auth');
    if (!this._authDialog) return;

    this._authTabs = this._authDialog.querySelectorAll('.auth-tab');
    this._loginForm  = this._authDialog.querySelector('#auth-login-form');
    this._signupForm = this._authDialog.querySelector('#auth-signup-form');

    this._authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this._authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const panel = tab.dataset.panel;
        this._loginForm.hidden  = (panel !== 'login');
        this._signupForm.hidden = (panel !== 'signup');
      });
    });

    // Close button
    this._authDialog.querySelector('.modal-close')?.addEventListener('click', () => this.closeAuth());

    // Login form submit
    this._loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleLoginSubmit(e.target);
    });

    // Signup form submit
    this._signupForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSignupSubmit(e.target);
    });
  }

  openAuth(tab = 'login') {
    if (!this._authDialog) return;
    this._authTabs.forEach(t => t.classList.toggle('active', t.dataset.panel === tab));
    this._loginForm.hidden  = (tab !== 'login');
    this._signupForm.hidden = (tab !== 'signup');
    this._authDialog.showModal();
  }

  closeAuth() {
    this._authDialog?.close();
  }

  _handleLoginSubmit(form) {
    const email = form.querySelector('#login-email')?.value || '';
    const pass  = form.querySelector('#login-pass')?.value  || '';
    if (!email || !pass) { window.toast?.show('Please fill in all fields.', 'warning'); return; }
    // Phase 1: No real auth — just a UX demonstration
    window.toast?.show('Login functionality coming in Phase 2! 🚀', 'info');
    this.closeAuth();
  }

  _handleSignupSubmit(form) {
    const name  = form.querySelector('#signup-name')?.value  || '';
    const email = form.querySelector('#signup-email')?.value || '';
    if (!name || !email) { window.toast?.show('Please fill in all required fields.', 'warning'); return; }
    window.toast?.show('Sign up coming in Phase 2! 🎉', 'info');
    this.closeAuth();
  }

  /* ──────────────────────────────── BOOK MODAL ──────────────────────────────── */

  _initBookModal() {
    this._bookDialog = document.getElementById('modal-book');
    if (!this._bookDialog) return;
    this._bookDialog.querySelector('.modal-close')?.addEventListener('click', () => this.closeBook());
    this._bookContent = this._bookDialog.querySelector('#modal-book-content');
  }

  openBook(book, action = 'view') {
    if (!this._bookDialog || !this._bookContent) return;

    const priceHtml = book.listingType === 'donate' ? '<span style="color:var(--success-400);font-size:var(--text-xl);font-weight:700;">Free Donation</span>' :
      book.listingType === 'exchange' ? '<span style="color:var(--accent-cyan-400);font-size:var(--text-xl);font-weight:700;">Exchange</span>' :
      book.listingType === 'lend'    ? `<span style="color:var(--accent-cyan-400);font-size:var(--text-xl);font-weight:700;">₹${book.price}${book.priceUnit || '/month'}</span>` :
      `<span style="font-size:var(--text-xl);font-weight:700;">₹${book.price}</span>${book.originalPrice ? `<span style="font-size:var(--text-sm);color:var(--text-muted);text-decoration:line-through;margin-left:8px;">₹${book.originalPrice}</span>` : ''}`;

    this._bookContent.innerHTML = `
      <div style="display:flex;gap:var(--space-6);flex-wrap:wrap;align-items:flex-start;">
        <!-- Cover -->
        <div style="width:140px;height:190px;border-radius:var(--radius-xl);background:${book.coverGradient};display:flex;align-items:center;justify-content:center;font-size:4rem;flex-shrink:0;box-shadow:var(--shadow-lg);">
          📖
        </div>
        <!-- Info -->
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-3);">
            <span class="badge badge-${book.listingType}">${book.listingTypeLabel}</span>
            <span class="badge badge-${book.condition}">${book.conditionLabel}</span>
          </div>
          <h2 style="font-family:var(--font-display);font-size:var(--text-xl);font-weight:700;color:var(--text-primary);line-height:1.3;margin-bottom:var(--space-2);">${escapeHtml(book.title)}</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-1);">${escapeHtml(book.author)}</p>
          <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-4);">${escapeHtml(book.edition)} · Course: ${escapeHtml(book.courseCode)}</p>
          <div style="margin-bottom:var(--space-4);">${priceHtml}</div>
          ${book.exchangeWish ? `<div style="background:rgba(6,182,212,0.10);border:1px solid rgba(6,182,212,0.20);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--accent-cyan-300);margin-bottom:var(--space-4);">🔄 ${escapeHtml(book.exchangeWish)}</div>` : ''}
        </div>
      </div>

      <!-- Description -->
      ${book.description ? `
      <div style="margin-top:var(--space-5);padding:var(--space-4);background:var(--glass-1);border-radius:var(--radius-lg);border:1px solid var(--glass-border);">
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:var(--leading-relaxed);">${escapeHtml(book.description)}</p>
      </div>` : ''}

      <!-- Seller info -->
      <div style="margin-top:var(--space-5);display:flex;align-items:center;gap:var(--space-3);padding:var(--space-4);background:var(--glass-1);border-radius:var(--radius-lg);border:1px solid var(--glass-border);">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--primary-600),var(--accent-purple-600));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">${book.seller.avatar}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:var(--text-sm);color:var(--text-primary);">${escapeHtml(book.seller.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${escapeHtml(book.seller.college)} · ${escapeHtml(book.seller.year)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="color:var(--warning-400);font-weight:700;">★ ${book.seller.trustScore.toFixed(1)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);">${book.seller.reviewsCount} reviews</div>
        </div>
      </div>

      <!-- CTA Buttons -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-top:var(--space-5);">
        ${book.listingType === 'sell'     ? '<button class="btn btn-primary" onclick="window.toast.show(\'Sending request… (Phase 2 feature)\', \'info\')">Buy / Make Offer</button><button class="btn btn-glass" onclick="window.toast.show(\'Wishlist updated!\', \'success\')">♡ Wishlist</button>' : ''}
        ${book.listingType === 'exchange' ? '<button class="btn btn-cyan"    onclick="window.toast.show(\'Exchange request coming in Phase 2!\', \'info\')">Propose Exchange</button><button class="btn btn-glass" onclick="window.toast.show(\'Message feature in Phase 2!\', \'info\')">💬 Message</button>' : ''}
        ${book.listingType === 'donate'   ? '<button class="btn btn-primary" onclick="window.toast.show(\'Request sent! (Phase 2)\', \'info\')">Request Book</button><button class="btn btn-glass" onclick="window.toast.show(\'Message feature in Phase 2!\', \'info\')">💬 Message</button>' : ''}
        ${book.listingType === 'lend'     ? '<button class="btn btn-cyan"    onclick="window.toast.show(\'Lending request coming in Phase 2!\', \'info\')">Borrow Book</button><button class="btn btn-glass" onclick="window.toast.show(\'Wishlist updated!\', \'success\')">♡ Wishlist</button>' : ''}
      </div>

      <!-- Demo notice -->
      <div class="demo-label" style="margin-top:var(--space-4);width:100%;justify-content:center;">
        <span>⚠️</span> Demo listing — Backend integration in Phase 2
      </div>
    `;

    this._bookDialog.showModal();
  }

  closeBook() {
    this._bookDialog?.close();
  }

  /* ──────────────────────────────── GLOBAL ──────────────────────────────── */

  /**
   * Close dialogs when clicking the backdrop (outside the panel).
   */
  _bindGlobalClose() {
    [this._authDialog, this._bookDialog].forEach(dialog => {
      if (!dialog) return;
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
      });
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
