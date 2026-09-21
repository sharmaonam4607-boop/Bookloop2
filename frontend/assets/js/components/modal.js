/**
 * BookLoop Modal Controller
 * Manages native <dialog> elements — Auth modal, Edit Profile modal, and Book details preview.
 */

import { api }  from '../api.js';
import { auth } from '../auth.js';

export class ModalController {
  constructor() {
    this._initAuthModal();
    this._initEditProfileModal();
    this._initBookModal();
    this._initDevDrawerModal();
    this._bindGlobalClose();
  }

  /* ──────────────────────────────── AUTH MODAL ──────────────────────────────── */

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
    this._loginTab?.classList.toggle('active', tab === 'login');
    this._signupTab?.classList.toggle('active', tab === 'signup');

    if (this._loginForm)  this._loginForm.style.display  = (tab === 'login')  ? 'block' : 'none';
    if (this._signupForm) this._signupForm.style.display = (tab === 'signup') ? 'block' : 'none';
    if (this._resetForm)  this._resetForm.style.display  = (tab === 'reset')  ? 'block' : 'none';
  }

  openAuth(tab = 'login') {
    if (!this._authDialog) return;
    this.switchAuthTab(tab);
    this._authDialog.showModal();
  }

  closeAuth() {
    this._authDialog?.close();
  }

  async _handleLoginSubmit() {
    const email = document.getElementById('login-email')?.value?.trim();
    const pass  = document.getElementById('login-password')?.value;

    if (!email || !pass) {
      window.toast?.show('Please enter both email and password.', 'warning');
      return;
    }

    window.toast?.show('Logging in...', 'info', 1500);
    const res = await api.login(email, pass);

    if (res.ok && res.data) {
      auth.setSession(res.data.access_token, res.data.user);
      window.toast?.show(`Welcome back, ${res.data.user.profile?.full_name || 'Student'}! 🎉`, 'success');
      this.closeAuth();
    } else {
      window.toast?.show(res.error || 'Login failed. Please check credentials.', 'error');
    }
  }

  async _handleSignupSubmit() {
    const name    = document.getElementById('signup-name')?.value?.trim();
    const email   = document.getElementById('signup-email')?.value?.trim();
    const college = document.getElementById('signup-college')?.value?.trim();
    const course  = document.getElementById('signup-course')?.value?.trim();
    const pass    = document.getElementById('signup-password')?.value;

    if (!name || !email || !pass) {
      window.toast?.show('Please complete all required signup fields.', 'warning');
      return;
    }

    window.toast?.show('Creating student account...', 'info', 1500);
    const res = await api.signup({
      full_name: name,
      email: email,
      password: pass,
      university: college || 'GNDEC Engineering College',
      course: course || 'B.Tech CSE',
      year: '3rd Year',
      location: 'Campus'
    });

    if (res.ok && res.data) {
      auth.setSession(res.data.access_token, res.data.user);
      window.toast?.show(`Account created! Welcome to BookLoop, ${name}! 🚀`, 'success');
      this.closeAuth();
    } else {
      window.toast?.show(res.error || 'Registration failed. Try a different email.', 'error');
    }
  }

  async _handleResetSubmit() {
    const email = document.getElementById('reset-email')?.value?.trim();
    const token = document.getElementById('reset-token-input')?.value?.trim();
    const pass  = document.getElementById('reset-new-password')?.value;

    if (!email) {
      window.toast?.show('Please enter your student email address.', 'warning');
      return;
    }

    if (!token) {
      // Step 1: Request token
      window.toast?.show('Generating password reset token...', 'info', 1500);
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
        window.toast?.show(res.error || 'Password reset request failed.', 'error');
      }
    } else {
      // Step 2: Confirm token + new password
      if (!pass) {
        window.toast?.show('Please enter a new password.', 'warning');
        return;
      }
      window.toast?.show('Updating password...', 'info', 1500);
      const res = await api.passwordResetConfirm(email, token, pass);
      if (res.ok) {
        window.toast?.show('Password updated successfully! Log in now.', 'success');
        this.switchAuthTab('login');
      } else {
        window.toast?.show(res.error || 'Password reset failed.', 'error');
      }
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
      const bioEl     = document.getElementById('edit-bio');

      if (nameEl)    nameEl.value    = profile.full_name || '';
      if (collegeEl) collegeEl.value = profile.university || '';
      if (courseEl)  courseEl.value  = profile.course || '';
      if (yearEl)    yearEl.value    = profile.year || '';
      if (locEl)     locEl.value     = profile.location || '';
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
    const bio     = document.getElementById('edit-bio')?.value?.trim();

    window.toast?.show('Updating profile...', 'info', 1500);
    const res = await api.updateMyProfile({
      full_name: name,
      university: college,
      course: course,
      year: year,
      location: loc,
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

    this._bookContent.innerHTML = `
      <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-start;">
        <div style="width:110px;height:140px;border-radius:var(--radius-md);background:${book.coverGradient};display:flex;align-items:center;justify-content:center;font-size:3rem;flex-shrink:0;">
          📖
        </div>
        <div style="flex:1;min-width:200px;">
          <h2 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${escapeHtml(book.title)}</h2>
          <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:4px;">${escapeHtml(book.author)} · ${escapeHtml(book.edition)}</p>
          <p style="font-size:0.75rem;color:var(--text-tertiary);margin-bottom:12px;">Course: ${escapeHtml(book.courseCode || 'Core Subject')} · ISBN: ${escapeHtml(book.isbn || 'N/A')}</p>
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
          <div style="color:var(--color-warning);font-weight:700;font-size:0.8125rem;">★ ${book.seller.trustScore.toFixed(1)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${book.seller.reviewsCount} reviews</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-top:var(--space-4);">
        <button class="btn btn-primary btn-sm" onclick="window.toast.show('Request feature enabled in Phase 5!', 'info')">Send Request</button>
        <button class="btn btn-outline btn-sm" onclick="window.toast.show('Chat feature enabled in Phase 6!', 'info')">💬 Start Chat</button>
      </div>
    `;

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
