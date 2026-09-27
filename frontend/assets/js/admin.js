const API_ROOT = 'http://127.0.0.1:8000/api/v1/admin';
const TOKEN_KEY = 'bookloop_admin_token';
const loginPanel = document.getElementById('admin-login-panel');
const consolePanel = document.getElementById('admin-console');
const content = document.getElementById('admin-content');
const identity = document.getElementById('admin-identity');
const toast = document.getElementById('admin-toast');
let activeTab = 'analytics';
let searchTerm = '';
let toastTimer;

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  let data = null;
  if (response.status !== 204) {
    try { data = await response.json(); } catch { data = null; }
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) signOut(false);
    const detail = Array.isArray(data?.detail) ? data.detail.map(item => item.msg).join(', ') : data?.detail;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return data;
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value == null ? '' : String(value);
  return element.innerHTML;
}

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';
}

function table(headers, rows) {
  if (!rows.length) return '<div class="admin-empty">No records to show.</div>';
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function setSignedIn(admin) {
  loginPanel.hidden = true;
  consolePanel.hidden = false;
  document.getElementById('admin-logout').hidden = false;
  identity.textContent = admin.name ? `${admin.name} · ${admin.email}` : admin.email;
}

function signOut(showMessage = true) {
  sessionStorage.removeItem(TOKEN_KEY);
  loginPanel.hidden = false;
  consolePanel.hidden = true;
  document.getElementById('admin-logout').hidden = true;
  identity.textContent = 'Admin access';
  if (showMessage) showToast('Signed out.');
}

async function restoreSession() {
  if (!sessionStorage.getItem(TOKEN_KEY)) return;
  try {
    const admin = await request('/auth/me');
    setSignedIn(admin);
    await renderTab(activeTab);
  } catch {
    signOut(false);
  }
}

async function renderTab(tab) {
  activeTab = tab;
  searchTerm = '';
  document.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === tab));
  content.innerHTML = '<p class="admin-muted">Loading records…</p>';
  try {
    if (tab === 'analytics') await renderAnalytics();
    else if (tab === 'users') await renderUsers();
    else if (tab === 'listings') await renderListings();
    else if (tab === 'communities') await renderCommunities();
    else if (tab === 'reports') await renderReports();
    else await renderReviews();
  } catch (error) {
    content.innerHTML = `<div class="admin-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function renderAnalytics() {
  const metrics = await request('/analytics');
  const labels = [
    ['users_total', 'Registered users'], ['users_active', 'Active users'],
    ['listings_total', 'Listings'], ['listings_active', 'Active listings'],
    ['communities_total', 'Communities'], ['communities_active', 'Active communities'],
    ['open_reports', 'Open reports'], ['reviews_total', 'Visible reviews'],
    ['completed_interactions', 'Completed handoffs'], ['books_given_second_chance', 'Books given a second chance'],
    ['students_connected', 'Students connected'],
  ];
  content.innerHTML = `<div class="admin-metrics">${labels.map(([key, label]) => `<article class="admin-metric"><span>${label}</span><strong>${Number(metrics[key]).toLocaleString()}</strong></article>`).join('')}</div><h2 class="admin-section-title">Moderation queues</h2><p class="admin-muted">Open reports: ${metrics.open_reports}. User, listing, community and review controls are available in their respective sections.</p>`;
}

async function renderUsers() {
  const users = await request(`/users?limit=250${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ''}`);
  const rows = users.map(user => `<tr>
    <td><strong>${escapeHtml(user.full_name || 'Profile incomplete')}</strong><small>${escapeHtml(user.email)}</small></td>
    <td>${escapeHtml(user.university || '—')}</td><td>${user.listings_count}</td>
    <td><span class="admin-status ${user.is_active ? 'active' : 'hidden'}">${user.is_active ? 'Active' : 'Suspended'}</span></td>
    <td>${dateLabel(user.created_at)}</td>
    <td><button class="admin-button ${user.is_active ? 'admin-button-danger' : 'admin-button-success'}" data-action="user-active" data-id="${escapeHtml(user.id)}" data-value="${!user.is_active}">${user.is_active ? 'Suspend' : 'Reactivate'}</button></td>
  </tr>`);
  content.innerHTML = `<form class="admin-toolbar" data-search-form><input name="q" type="search" placeholder="Search users by name or email" value="${escapeHtml(searchTerm)}"><button class="admin-button" type="submit">Search</button></form>${table(['User', 'University', 'Listings', 'Status', 'Joined', 'Action'], rows)}`;
}

async function renderListings() {
  const listings = await request(`/listings?limit=500${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ''}`);
  const rows = listings.map(listing => `<tr>
    <td><strong>${escapeHtml(listing.title)}</strong><small>${escapeHtml(listing.author)}${listing.is_seed_data ? ' · Demo data' : ''}</small></td>
    <td>${escapeHtml(listing.seller_name || 'Account removed')}</td><td>${escapeHtml(listing.listing_type)}</td>
    <td><span class="admin-status ${escapeHtml(listing.status)}">${escapeHtml(listing.status)}</span></td>
    <td>${dateLabel(listing.created_at)}</td><td><select class="admin-status-select" aria-label="Moderate ${escapeHtml(listing.title)}" data-action="listing-status" data-id="${escapeHtml(listing.id)}"><option value="">Change status…</option>${['active','paused','sold','exchanged','donated','lent','deleted'].map(value => `<option value="${value}">${value}</option>`).join('')}</select></td>
  </tr>`);
  content.innerHTML = `<form class="admin-toolbar" data-search-form><input name="q" type="search" placeholder="Search listings by title or author" value="${escapeHtml(searchTerm)}"><button class="admin-button" type="submit">Search</button></form>${table(['Book', 'Owner', 'Type', 'Status', 'Created', 'Moderation'], rows)}`;
}

async function renderCommunities() {
  const communities = await request(`/communities${searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : ''}`);
  const rows = communities.map(community => `<tr>
    <td><strong>${escapeHtml(community.name)}</strong><small>${escapeHtml(community.category)}${community.is_seed_data ? ' · Demo data' : ''}</small></td>
    <td>${community.member_count}</td><td>${community.post_count}</td>
    <td><span class="admin-status ${community.is_active ? 'active' : 'hidden'}">${community.is_active ? 'Active' : 'Hidden'}</span></td>
    <td>${dateLabel(community.created_at)}</td><td><button class="admin-button ${community.is_active ? 'admin-button-danger' : 'admin-button-success'}" data-action="community-active" data-id="${escapeHtml(community.id)}" data-value="${!community.is_active}">${community.is_active ? 'Hide' : 'Restore'}</button></td>
  </tr>`);
  content.innerHTML = `<form class="admin-toolbar" data-search-form><input name="q" type="search" placeholder="Search communities" value="${escapeHtml(searchTerm)}"><button class="admin-button" type="submit">Search</button></form>${table(['Community', 'Members', 'Posts', 'Visibility', 'Created', 'Moderation'], rows)}`;
}

async function renderReports() {
  const reports = await request('/reports');
  const rows = reports.map(report => `<tr>
    <td><strong>${escapeHtml(report.community_name)}</strong><small>${escapeHtml(report.target_type)} · ${escapeHtml(report.target_id)}</small></td>
    <td>${escapeHtml(report.reporter_id)}</td><td>${escapeHtml(report.reason)}</td>
    <td><span class="admin-status ${escapeHtml(report.status)}">${escapeHtml(report.status)}</span></td><td>${dateLabel(report.created_at)}</td>
    <td><div class="admin-actions">${report.status === 'open' ? `<button class="admin-button admin-button-success" data-action="report-status" data-id="${escapeHtml(report.id)}" data-value="resolved">Resolve</button><button class="admin-button admin-button-danger" data-action="report-status" data-id="${escapeHtml(report.id)}" data-value="dismissed">Dismiss</button>` : '—'}</div></td>
  </tr>`);
  content.innerHTML = table(['Community / target', 'Reporter ID', 'Reason', 'Status', 'Created', 'Action'], rows);
}

async function renderReviews() {
  const reviews = await request('/reviews?include_hidden=true');
  const rows = reviews.map(review => `<tr>
    <td><strong>${escapeHtml(review.reviewer_name)}</strong><small>for ${escapeHtml(review.reviewed_user_name)}</small></td>
    <td>${escapeHtml(review.book_title)}</td><td>★ ${review.rating}/5</td>
    <td>${escapeHtml(review.comment || 'No written comment')}</td>
    <td><span class="admin-status ${review.is_hidden ? 'hidden' : 'active'}">${review.is_hidden ? 'Hidden' : 'Visible'}</span></td>
    <td>${dateLabel(review.created_at)}</td>
    <td><button class="admin-button ${review.is_hidden ? 'admin-button-success' : 'admin-button-danger'}" data-action="review-hidden" data-id="${escapeHtml(review.id)}" data-value="${!review.is_hidden}">${review.is_hidden ? 'Restore' : 'Hide'}</button></td>
  </tr>`);
  content.innerHTML = table(['Reviewer', 'Interaction', 'Rating', 'Review', 'Visibility', 'Created', 'Action'], rows);
}

async function handleAction(button) {
  const id = encodeURIComponent(button.dataset.id);
  let path;
  let body;
  if (button.dataset.action === 'user-active') {
    path = `/users/${id}`;
    body = { is_active: button.dataset.value === 'true' };
  } else if (button.dataset.action === 'community-active') {
    path = `/communities/${id}`;
    body = { is_active: button.dataset.value === 'true' };
  } else if (button.dataset.action === 'report-status') {
    path = `/reports/${id}`;
    body = { status: button.dataset.value };
  } else if (button.dataset.action === 'review-hidden') {
    path = `/reviews/${id}`;
    body = { is_hidden: button.dataset.value === 'true' };
  } else return;
  button.disabled = true;
  try {
    await request(path, { method: 'PATCH', body: JSON.stringify(body) });
    showToast('Moderation change saved.');
    await renderTab(activeTab);
  } catch (error) {
    button.disabled = false;
    showToast(error.message, true);
  }
}

content.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button) handleAction(button);
});
content.addEventListener('change', async event => {
  const select = event.target.closest('[data-action="listing-status"]');
  if (!select || !select.value) return;
  select.disabled = true;
  try {
    await request(`/listings/${encodeURIComponent(select.dataset.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: select.value }),
    });
    showToast('Listing moderation status saved.');
    await renderTab(activeTab);
  } catch (error) {
    select.disabled = false;
    showToast(error.message, true);
  }
});
content.addEventListener('submit', event => {
  if (!event.target.matches('[data-search-form]')) return;
  event.preventDefault();
  searchTerm = new FormData(event.target).get('q')?.trim() || '';
  renderTab(activeTab);
});

document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => renderTab(button.dataset.adminTab)));
document.getElementById('admin-refresh').addEventListener('click', () => renderTab(activeTab));
document.getElementById('admin-logout').addEventListener('click', () => signOut());
document.getElementById('admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const errorEl = document.getElementById('admin-login-error');
  errorEl.hidden = true;
  button.disabled = true;
  const values = new FormData(form);
  try {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
    });
    sessionStorage.setItem(TOKEN_KEY, result.access_token);
    setSignedIn({ email: result.email });
    await renderTab('analytics');
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.hidden = false;
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-admin-tab]').forEach(button => { button.disabled = true; });
restoreSession().then(() => {
  if (sessionStorage.getItem(TOKEN_KEY)) document.querySelectorAll('[data-admin-tab]').forEach(button => { button.disabled = false; });
});

document.getElementById('admin-login-form').addEventListener('submit', () => {
  setTimeout(() => document.querySelectorAll('[data-admin-tab]').forEach(button => { button.disabled = false; }), 0);
});
