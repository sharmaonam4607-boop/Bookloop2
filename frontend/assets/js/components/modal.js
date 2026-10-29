/**

 * BookLoop Modal Controller

 * Manages native <dialog> elements — Auth modal, Edit Profile modal, and Book details preview.

 */



import { api }  from '../api.js?v=5';

import { auth } from '../auth.js';



export class ModalController {

  constructor() {

    this._isSubmitting = false;

    this._initAuthModal();

    this._initEditProfileModal();

    this._initBookModal();

    this._initDevDrawerModal();

    this._bindGlobalClose();

  }



  /* ──────────────────────────────── AUTH MODAL ──────────────────────────────── */



  _showInlineError(containerId, message) {

    const alertEl = document.getElementById(containerId);

    if (!alertEl) return;

    alertEl.textContent = message;

    alertEl.className = 'auth-inline-alert error';

    alertEl.hidden = false;

  }



  _clearInlineErrors() {

    ['login-auth-error', 'signup-auth-error', 'reset-auth-error'].forEach(id => {

      const el = document.getElementById(id);

      if (el) {

        el.textContent = '';

        el.hidden = true;

      }

    });

  }



  _setButtonLoading(buttonId, loadingText, originalText) {

    const btn = document.getElementById(buttonId);

    if (!btn) return () => {};

    btn.disabled = true;

    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span> ${loadingText}`;

    return () => {

      btn.disabled = false;

      btn.innerHTML = originalText;

    };

  }



  _initAuthModal() {

    this._authDialog = document.getElementById('auth-modal');

    if (!this._authDialog) return;



    this._loginTab  = document.getElementById('auth-tab-login');

    this._signupTab = document.getElementById('auth-tab-signup');

    this._loginForm  = document.getElementById('login-form');

    this._signupForm = document.getElementById('signup-form');

    this._resetForm  = document.getElementById('reset-form');



    // Tab switching

    this._loginTab?.addEventListener('click', () => this.switchAuthTab('login'));

    this._signupTab?.addEventListener('click', () => this.switchAuthTab('signup'));



    // Forgot password link

    document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {

      e.preventDefault();

      this.switchAuthTab('reset');

    });



    // Back to login link in reset view

    document.getElementById('back-to-login-link')?.addEventListener('click', (e) => {

      e.preventDefault();

      this.switchAuthTab('login');

    });



    // Close buttons

    this._authDialog.querySelectorAll('[data-modal-close]').forEach(btn => {

      btn.addEventListener('click', () => this.closeAuth());

    });



    // Form handlers

    this._loginForm?.addEventListener('submit', (e) => {

      e.preventDefault();

      this._handleLoginSubmit();

    });



    this._signupForm?.addEventListener('submit', (e) => {

      e.preventDefault();

      this._handleSignupSubmit();

    });



    this._resetForm?.addEventListener('submit', (e) => {

      e.preventDefault();

      this._handleResetSubmit();

    });

  }



  switchAuthTab(tab) {

    if (!this._authDialog) return;

    this._clearInlineErrors();

    this._loginTab?.classList.toggle('active', tab === 'login');

    this._signupTab?.classList.toggle('active', tab === 'signup');



    if (this._loginForm)  this._loginForm.style.display  = (tab === 'login')  ? 'block' : 'none';

    if (this._signupForm) this._signupForm.style.display = (tab === 'signup') ? 'block' : 'none';

    if (this._resetForm)  this._resetForm.style.display  = (tab === 'reset')  ? 'block' : 'none';

  }



  openAuth(tab = 'login') {

    if (!this._authDialog) return;

    this._clearInlineErrors();

    this.switchAuthTab(tab);

    this._authDialog.showModal();

  }



  closeAuth() {

    this._clearInlineErrors();

    this._authDialog?.close();

  }



  async _handleLoginSubmit() {

    if (this._isSubmitting) return;

    this._clearInlineErrors();



    const email = document.getElementById('login-email')?.value?.trim();

    const pass  = document.getElementById('login-password')?.value;

    const remember = document.getElementById('remember-session')?.checked ?? true;



    if (!email || !pass) {

      this._showInlineError('login-auth-error', 'Please enter both your student email and password.');

      return;

    }



    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

      this._showInlineError('login-auth-error', 'Please enter a valid student email address.');

      return;

    }



    this._isSubmitting = true;

    const restoreBtn = this._setButtonLoading('login-submit-btn', 'Signing in...', 'Log In to BookLoop');



    try {

      const res = await api.login(email, pass);

      if (res.ok && res.data) {

        auth.setSession(res.data.access_token, res.data.user, remember);

        this.closeAuth();

        window.toast?.show(`Welcome back, ${res.data.user.profile?.full_name || 'Student'}! 🎉`, 'success');

      } else {

        const errorMsg = res.error || 'Incorrect email or password. Please verify credentials.';

        this._showInlineError('login-auth-error', errorMsg);

        window.toast?.show(errorMsg, 'error');

      }

    } catch {

      this._showInlineError('login-auth-error', 'Unable to reach authentication server. Please try again.');

      window.toast?.show('Connection error during login.', 'error');

    } finally {

      this._isSubmitting = false;

      restoreBtn();

    }

  }



  async _handleSignupSubmit() {

    if (this._isSubmitting) return;

    this._clearInlineErrors();



    const name    = document.getElementById('signup-name')?.value?.trim();

    const email   = document.getElementById('signup-email')?.value?.trim();

    const college = document.getElementById('signup-college')?.value?.trim();

    const course  = document.getElementById('signup-course')?.value?.trim();

    const city    = document.getElementById('signup-city')?.value?.trim();

    const pass    = document.getElementById('signup-password')?.value;



    if (!name || !email || !pass || !city) {

      this._showInlineError('signup-auth-error', 'Please complete all required fields.');

      return;

    }



    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

      this._showInlineError('signup-auth-error', 'Please enter a valid student email address.');

      return;

    }



    if (pass.length < 8) {

      this._showInlineError('signup-auth-error', 'Password must be at least 8 characters long.');

      return;

    }



    this._isSubmitting = true;

    const restoreBtn = this._setButtonLoading('signup-submit-btn', 'Creating account...', 'Join BookLoop Community');



    try {

      const res = await api.signup({

        full_name: name,

        email: email,

        password: pass,

        university: college || 'University Campus',

        course: course || 'B.Tech',

        year: 'Student',

        city: city,

        location: city

      });



      if (res.ok && res.data) {

        auth.setSession(res.data.access_token, res.data.user);

        this.closeAuth();

        window.toast?.show(`Account created! Welcome to BookLoop, ${name}! 🚀`, 'success');

      } else {

        const errorMsg = res.error || 'Registration failed. Try a different email address.';

        this._showInlineError('signup-auth-error', errorMsg);

        window.toast?.show(errorMsg, 'error');

      }

    } catch {

      this._showInlineError('signup-auth-error', 'Connection error. Please try again.');

      window.toast?.show('Connection error during registration.', 'error');

    } finally {

      this._isSubmitting = false;

      restoreBtn();

    }

  }



  async _handleResetSubmit() {

    if (this._isSubmitting) return;

    this._clearInlineErrors();



    const email = document.getElementById('reset-email')?.value?.trim();

    const token = document.getElementById('reset-token-input')?.value?.trim();

    const pass  = document.getElementById('reset-new-password')?.value;



    if (!email) {

      this._showInlineError('reset-auth-error', 'Please enter your student email address.');

      return;

    }



    this._isSubmitting = true;

    const restoreBtn = this._setButtonLoading('reset-submit-btn', 'Processing...', 'Reset Password');



    try {

      if (!token) {

        const res = await api.passwordResetRequest(email);

        if (res.ok && res.data) {

          window.toast?.show(res.data.message || 'Reset token generated!', 'success');

          if (res.data.demo_reset_token) {

            const tokenInput = document.getElementById('reset-token-input');

            if (tokenInput) tokenInput.value = res.data.demo_reset_token;

            const tokenWrap = document.getElementById('reset-token-wrap');

            if (tokenWrap) tokenWrap.style.display = 'block';

          }

        } else {

          const errorMsg = res.error || 'Password reset request failed.';

          this._showInlineError('reset-auth-error', errorMsg);

          window.toast?.show(errorMsg, 'error');

        }

      } else {

        if (!pass || pass.length < 6) {

          this._showInlineError('reset-auth-error', 'Please enter a new password (min. 6 characters).');

          return;

        }

        const res = await api.passwordResetConfirm(email, token, pass);

        if (res.ok) {

          window.toast?.show('Password updated successfully! Log in now.', 'success');

          this.switchAuthTab('login');

        } else {

          const errorMsg = res.error || 'Password reset failed.';

          this._showInlineError('reset-auth-error', errorMsg);

          window.toast?.show(errorMsg, 'error');

        }

      }

    } catch {

      this._showInlineError('reset-auth-error', 'Password reset service unavailable.');

      window.toast?.show('Connection error during password reset.', 'error');

    } finally {

      this._isSubmitting = false;

      restoreBtn();

    }

  }



  /* ──────────────────────────────── EDIT PROFILE MODAL ──────────────────────────────── */



  _initEditProfileModal() {

    this._editProfileDialog = document.getElementById('edit-profile-modal');

    if (!this._editProfileDialog) return;



    this._editProfileDialog.querySelectorAll('[data-modal-close]').forEach(btn => {

      btn.addEventListener('click', () => this.closeEditProfile());

    });



    const form = document.getElementById('edit-profile-form');

    form?.addEventListener('submit', (e) => {

      e.preventDefault();

      this._handleEditProfileSubmit();

    });

  }



  openEditProfile() {

    if (!this._editProfileDialog) return;

    const profile = auth.profile;

    if (profile) {

      const nameEl    = document.getElementById('edit-name');

      const collegeEl = document.getElementById('edit-college');

      const courseEl  = document.getElementById('edit-course');

      const yearEl    = document.getElementById('edit-year');

      const locEl     = document.getElementById('edit-location');

      const avatarUrlEl = document.getElementById('edit-avatar-url');

      const bioEl     = document.getElementById('edit-bio');



      if (nameEl)    nameEl.value    = profile.full_name || '';

      if (collegeEl) collegeEl.value = profile.university || '';

      if (courseEl)  courseEl.value  = profile.course || '';

      if (yearEl)    yearEl.value    = profile.year || '';

      if (locEl)     locEl.value     = profile.location || '';

      if (avatarUrlEl) avatarUrlEl.value = profile.avatar_url || '';

      if (bioEl)     bioEl.value     = profile.bio || '';

    }

    this._editProfileDialog.showModal();

  }



  closeEditProfile() {

    this._editProfileDialog?.close();

  }



  async _handleEditProfileSubmit() {

    const name    = document.getElementById('edit-name')?.value?.trim();

    const college = document.getElementById('edit-college')?.value?.trim();

    const course  = document.getElementById('edit-course')?.value?.trim();

    const year    = document.getElementById('edit-year')?.value?.trim();

    const loc     = document.getElementById('edit-location')?.value?.trim();

    const avatarUrl = document.getElementById('edit-avatar-url')?.value?.trim();

    const bio     = document.getElementById('edit-bio')?.value?.trim();



    window.toast?.show('Updating profile...', 'info', 1500);

    const res = await api.updateMyProfile({

      full_name: name,

      university: college,

      course: course,

      year: year,

      location: loc,

      avatar_url: avatarUrl,

      bio: bio

    });



    if (res.ok && res.data) {

      auth.updateProfile(res.data);

      window.toast?.show('Profile updated successfully! ✨', 'success');

      this.closeEditProfile();

    } else {

      window.toast?.show(res.error || 'Failed to update profile.', 'error');

    }

  }



  /* ──────────────────────────────── BOOK MODAL ──────────────────────────────── */



  _initBookModal() {

    this._bookDialog = document.getElementById('book-detail-modal');

    if (!this._bookDialog) return;

    this._bookDialog.querySelectorAll('[data-modal-close]').forEach(btn => {

      btn.addEventListener('click', () => this.closeBook());

    });

    this._bookContent = document.getElementById('book-detail-content');

  }



  openBook(book, action = 'view') {

    if (!this._bookDialog || !this._bookContent) return;



    const priceHtml = book.listingType === 'donate' ? '<span style="color:var(--color-success);font-weight:700;font-size:1.1rem;">Free Donation</span>' :

      book.listingType === 'exchange' ? '<span style="color:var(--color-secondary);font-weight:700;font-size:1.1rem;">Exchange Available</span>' :

      book.listingType === 'lend'    ? `<span style="color:var(--color-secondary);font-weight:700;font-size:1.1rem;">₹${book.price}${book.priceUnit || '/month'}</span>` :

      `<span style="font-weight:700;font-size:1.1rem;">₹${book.price}</span>${book.originalPrice ? `<span style="font-size:0.75rem;color:var(--text-muted);text-decoration:line-through;margin-left:6px;">₹${book.originalPrice}</span>` : ''}`;



    const rawPhoto = (Array.isArray(book.image_urls) && book.image_urls[0])
      ? book.image_urls[0]
      : (Array.isArray(book.imageUrls) && book.imageUrls[0])
        ? book.imageUrls[0]
        : (typeof book.image_url === 'string' && book.image_url)
          ? book.image_url
          : null;

    function resolveImageUrl(url) {
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

    const DEFAULT_COVER = 'assets/images/default-book-cover.svg';
    const photoUrl = resolveImageUrl(rawPhoto);
    const displayCover = photoUrl || DEFAULT_COVER;

    const locationText = book.safe_meeting_point || book.safeMeetingPoint || (book.seller && book.seller.location) || '';

    const coverHtml = `<div style="width:110px;height:150px;border-radius:var(--radius-md);overflow:hidden;flex-shrink:0;box-shadow:0 3px 12px rgba(0,0,0,0.18);position:relative;display:flex;align-items:center;justify-content:center;background:#1E293B;border:1px solid var(--border-subtle);">
      <img src="${escapeHtml(displayCover)}" alt="${escapeHtml(book.title)}" style="width:100%;height:100%;object-fit:cover;" onerror="if(this.src!=='${DEFAULT_COVER}' && !this.src.endsWith('${DEFAULT_COVER}')){this.src='${DEFAULT_COVER}';}">
    </div>`;



    this._bookContent.innerHTML = `

      <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-start;">

        ${coverHtml}

        <div style="flex:1;min-width:200px;">

          <h2 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${escapeHtml(book.title)}</h2>

          <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:4px;">${escapeHtml(book.author)} · ${escapeHtml(book.edition)}</p>

          <p style="font-size:0.75rem;color:var(--text-tertiary);margin-bottom:8px;">Course: ${escapeHtml(book.courseCode || 'Core Subject')} · ISBN: ${escapeHtml(book.isbn || 'N/A')}</p>

          ${locationText ? `<p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:8px;">📍 <strong>Available at:</strong> ${escapeHtml(locationText)}</p>` : ''}

          <div style="margin-bottom:12px;">${priceHtml}</div>

          ${book.exchangeWish ? `<div style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:var(--radius-sm);padding:8px 12px;font-size:0.78rem;color:var(--color-secondary);">🔄 ${escapeHtml(book.exchangeWish)}</div>` : ''}

        </div>

      </div>



      ${book.description ? `

      <div style="margin-top:var(--space-4);padding:var(--space-3);background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border-light);">

        <p style="font-size:0.8125rem;color:var(--text-secondary);line-height:1.5;">${escapeHtml(book.description)}</p>

      </div>` : ''}



      <div style="margin-top:var(--space-4);display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border-light);">

        <div style="font-size:1.4rem;">${book.seller.avatar}</div>

        <div style="flex:1;">

          <div style="font-weight:600;font-size:0.8125rem;color:var(--text-primary);">${escapeHtml(book.seller.name)}</div>

          <div style="font-size:0.75rem;color:var(--text-tertiary);">${escapeHtml(book.seller.college)} · ${escapeHtml(book.seller.year)}</div>

        </div>

        <div style="text-align:right;">

          <div style="color:var(--color-warning);font-weight:700;font-size:0.8125rem;">${book.seller.trustScore == null ? 'No reviews yet' : `★ ${book.seller.trustScore.toFixed(1)}`}</div>

          <div style="font-size:0.75rem;color:var(--text-muted);">${book.seller.reviewsCount} reviews</div>

        </div>

      </div>



      <div style="margin-top:var(--space-4);">

        <label class="form-group"><span class="form-label">Message to the owner (optional)</span><textarea class="form-input" rows="2" data-request-message maxlength="1000" placeholder="Introduce yourself or suggest a campus handoff."></textarea></label>

        <div style="display:flex;gap:var(--space-2);">

          <button class="btn btn-primary btn-sm" data-send-book-request>${book.listingType === 'lend' ? 'Request to borrow' : book.listingType === 'exchange' ? 'Request exchange' : book.listingType === 'donate' ? 'Request this book' : 'Request to buy'}</button>

          <button class="btn btn-outline btn-sm" data-start-book-chat>💬 Start Chat</button>

        </div>

      </div>

    `;



    this._bookContent.querySelector('[data-send-book-request]')?.addEventListener('click', async event => {

      if (!auth.isAuthenticated) {

        this.closeBook();

        this.openAuth('login');

        window.toast?.show('Log in to send a book request.', 'info');

        return;

      }

      const button = event.currentTarget;

      button.disabled = true;

      const message = this._bookContent.querySelector('[data-request-message]')?.value?.trim() || null;

      const response = await api.createBookRequest(book.id, message);

      button.disabled = false;

      if (response.ok) {

        window.toast?.show('Request sent to the book owner.', 'success');

        this.closeBook();

        window.dispatchEvent(new CustomEvent('requestsChanged'));

        window.dispatchEvent(new CustomEvent('notificationsChanged'));

      } else {

        window.toast?.show(response.error || 'Could not send your request.', 'error');

      }

    });

    this._bookContent.querySelector('[data-start-book-chat]')?.addEventListener('click', () => {

      this.closeBook();

      window.bookloopChat?.openForBook(book.id);

    });



    this._bookDialog.showModal();

  }



  closeBook() {

    this._bookDialog?.close();

  }



  /* ──────────────────────────────── DEV DRAWER ──────────────────────────────── */



  _initDevDrawerModal() {

    this._devDialog = document.getElementById('dev-drawer-modal');

    if (!this._devDialog) return;



    this._devDialog.querySelectorAll('[data-modal-close]').forEach(btn => {

      btn.addEventListener('click', () => this._devDialog.close());

    });



    document.getElementById('floating-dev-badge')?.addEventListener('click', () => {

      this._devDialog.showModal();

    });



    document.getElementById('dev-ping-btn')?.addEventListener('click', async () => {

      window.toast?.show('Pinging FastAPI health endpoint...', 'info', 1200);

      const res = await api.getHealth();

      const statusEl = document.getElementById('dev-server-status');

      const latEl    = document.getElementById('dev-server-latency');

      const dbEl     = document.getElementById('dev-db-status');

      const boxEl    = document.getElementById('dev-json-box');



      if (statusEl) statusEl.textContent = res.ok ? 'Online' : 'Offline';

      if (latEl)    latEl.textContent    = `${res.latencyMs}ms`;

      if (dbEl)     dbEl.textContent     = res.data?.database?.connected ? 'Connected' : 'Disconnected';

      if (boxEl)    boxEl.textContent    = JSON.stringify(res.data || { error: res.error }, null, 2);

    });

  }



  /* ──────────────────────────────── GLOBAL BACKDROP ──────────────────────────────── */



  _bindGlobalClose() {

    [this._authDialog, this._editProfileDialog, this._bookDialog, this._devDialog].forEach(dialog => {

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

