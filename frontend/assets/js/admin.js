const API_BASE = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? ''
  : ((window.location.port === '8000' || window.location.pathname.startsWith('/app')) ? '' : 'http://127.0.0.1:8000');
const API_ROOT = `${API_BASE}/api/v1/admin`;
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
  document.querySelectorAll('[data-admin-tab]').forEach(button => { button.disabled = false; });
}

function signOut(showMessage = true) {
  sessionStorage.removeItem(TOKEN_KEY);
  loginPanel.hidden = false;
  consolePanel.hidden = true;
  document.getElementById('admin-logout').hidden = true;
  identity.textContent = 'Admin access';
  document.querySelectorAll('[data-admin-tab]').forEach(button => { button.disabled = true; });
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

function renderUserStatusDoughnut(activeCount, suspendedCount, totalCount) {
  const activePct = totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(1) : '0.0';
  const suspendedPct = totalCount > 0 ? ((suspendedCount / totalCount) * 100).toFixed(1) : '0.0';

  // SVG radius r=66, circumference C = 2 * Math.PI * 66 ≈ 414.69
  const C = 414.69;
  const activeOffset = totalCount > 0 ? (activeCount / totalCount) * C : 0;
  const suspendedOffset = totalCount > 0 ? C - activeOffset : 0;

  return `
    <article class="admin-chart-card">
      <div class="admin-chart-head">
        <div class="admin-chart-title-group">
          <h2><span>👥</span> User Status</h2>
          <p>Distribution of active & suspended accounts</p>
        </div>
        <span class="admin-chart-pill" title="Total registered accounts">${totalCount.toLocaleString()} Total Users</span>
      </div>

      <div class="doughnut-layout">
        <div class="doughnut-visual-wrap">
          <svg class="doughnut-svg" width="165" height="165" viewBox="0 0 200 200" style="display:block; max-width:165px; max-height:165px; margin:0 auto;" aria-label="User status doughnut chart">
            <!-- Background Track (explicit fill=none prevents default SVG black fill) -->
            <circle cx="100" cy="100" r="66" fill="none" stroke="#F1F5F9" stroke-width="20" />
            
            ${totalCount > 0 ? `
              <!-- Active Users: Light Pink (#F8BBD0) with fill=none -->
              <circle class="doughnut-segment admin-tooltip"
                data-tooltip="Active: ${activeCount.toLocaleString()} users (${activePct}%)"
                cx="100" cy="100" r="66"
                fill="none"
                stroke="#F8BBD0"
                stroke-width="20"
                stroke-dasharray="${activeOffset.toFixed(2)} ${C.toFixed(2)}"
                stroke-dashoffset="0"
                transform="rotate(-90 100 100)" />
                
              <!-- Suspended Users: Dark Pink (#C2185B) with fill=none -->
              <circle class="doughnut-segment admin-tooltip"
                data-tooltip="Suspended: ${suspendedCount.toLocaleString()} users (${suspendedPct}%)"
                cx="100" cy="100" r="66"
                fill="none"
                stroke="#C2185B"
                stroke-width="20"
                stroke-dasharray="${suspendedOffset.toFixed(2)} ${C.toFixed(2)}"
                stroke-dashoffset="-${activeOffset.toFixed(2)}"
                transform="rotate(-90 100 100)" />
            ` : ''}

            <!-- Center text inside SVG for vector precision & guaranteed upright orientation -->
            <text x="100" y="94" text-anchor="middle" font-size="10" font-weight="700" fill="#64748B" letter-spacing="1" font-family="system-ui, -apple-system, sans-serif">TOTAL USERS</text>
            <text x="100" y="122" text-anchor="middle" font-size="26" font-weight="900" fill="#0F172A" font-family="system-ui, -apple-system, sans-serif">${totalCount.toLocaleString()}</text>
          </svg>
        </div>

        <div class="doughnut-legend-list">
          <div class="doughnut-legend-item admin-tooltip" data-tooltip="${activeCount} active user accounts">
            <div class="doughnut-legend-head">
              <span class="doughnut-legend-marker" style="background:#F8BBD0; border:1px solid #F48FB1;"></span>
              <span>Active Users</span>
            </div>
            <div class="doughnut-legend-stats">
              <span class="doughnut-legend-num">${activeCount.toLocaleString()}</span>
              <span class="doughnut-legend-percentage">${activePct}%</span>
            </div>
          </div>

          <div class="doughnut-legend-item admin-tooltip" data-tooltip="${suspendedCount} suspended user accounts">
            <div class="doughnut-legend-head">
              <span class="doughnut-legend-marker" style="background:#C2185B;"></span>
              <span>Suspended Users</span>
            </div>
            <div class="doughnut-legend-stats">
              <span class="doughnut-legend-num">${suspendedCount.toLocaleString()}</span>
              <span class="doughnut-legend-percentage" style="color:#880E4F; background:#FCE7F3; border-color:#FBCFE8;">${suspendedPct}%</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderBookCirculationBarChart(circulation, showCatalog = false) {
  const isCatalog = Boolean(showCatalog);
  const total = isCatalog ? circulation.listingsTotal : circulation.total;

  const countDonated = isCatalog ? circulation.listingsDonated : circulation.donated;
  const countLent = isCatalog ? circulation.listingsLent : circulation.lent;
  const countExchanged = isCatalog ? circulation.listingsExchanged : circulation.exchanged;
  const countSold = isCatalog ? circulation.listingsSold : circulation.sold;

  const titleSub = isCatalog
    ? 'Active book catalog listings by channel'
    : 'Verified completed handoffs in database';

  const items = [
    { label: 'Donated', count: countDonated, color: 'linear-gradient(180deg, #F8BBD0 0%, #F48FB1 100%)' },
    { label: 'Lent / Borrowed', count: countLent, color: 'linear-gradient(180deg, #F472B6 0%, #EC4899 100%)' },
    { label: 'Exchanged', count: countExchanged, color: 'linear-gradient(180deg, #E91E63 0%, #D81B60 100%)' },
    { label: 'Sold', count: countSold, color: 'linear-gradient(180deg, #C2185B 0%, #880E4F 100%)' },
  ];

  const maxVal = Math.max(...items.map(i => i.count), 1);
  const ySteps = 4;
  const stepVal = Math.max(Math.ceil(maxVal / ySteps), 1);
  const chartMax = stepVal * ySteps;
  const yLabels = [];
  for (let i = ySteps; i >= 0; i--) {
    yLabels.push(i * stepVal);
  }

  const badgeText = isCatalog
    ? `${total.toLocaleString()} Catalog Listings`
    : `${total.toLocaleString()} Verified Handoffs`;

  return `
    <article class="admin-chart-card">
      <div class="admin-chart-head">
        <div class="admin-chart-title-group">
          <h2><span>📚</span> Book Circulation</h2>
          <p>${titleSub}</p>
        </div>
        <button id="circ-mode-toggle" class="admin-chart-pill-btn" type="button" title="Click to toggle between Verified Handoffs and Catalog Listings">
          <span>🔄</span> ${badgeText}
        </button>
      </div>

      <div class="barchart-wrapper">
        <div class="barchart-plot-area">
          
          <!-- Y-Axis Scale Numbers -->
          <div class="barchart-y-axis-labels">
            ${yLabels.map(val => `<span class="barchart-y-tick">${val}</span>`).join('')}
          </div>

          <!-- Vertical Y-Axis Line -->
          <div class="barchart-y-axis-line"></div>

          <!-- Horizontal X-Axis Line -->
          <div class="barchart-x-axis-line"></div>

          <!-- Subtle Horizontal Grid Lines -->
          <div class="barchart-grid-container">
            ${yLabels.map(() => `<div class="barchart-grid-dash"></div>`).join('')}
          </div>

          <!-- Vertical Bar Columns -->
          <div class="barchart-bars-container">
            ${items.map(item => {
              const heightPct = chartMax > 0 ? ((item.count / chartMax) * 100).toFixed(1) : 0;
              const pctOfTotal = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
              return `
                <div class="barchart-bar-group admin-tooltip" data-tooltip="${item.label}: ${item.count} (${pctOfTotal}%)">
                  <span class="barchart-val-tag">${item.count}</span>
                  <div class="barchart-bar-rect" style="height:${Math.max(Number(heightPct), 4)}%; background:${item.color}; box-shadow: 0 2px 6px rgba(194, 24, 91, 0.15);"></div>
                  <span class="barchart-x-text">${item.label}</span>
                </div>
              `;
            }).join('')}
          </div>

        </div>

        <div class="barchart-summary-foot">
          <span>Source: ${isCatalog ? 'Active listings catalog' : 'Completed request workflows'} in database</span>
          <strong>${total.toLocaleString()} ${isCatalog ? 'Books listed' : 'Books recirculated'}</strong>
        </div>
      </div>
    </article>
  `;
}

async function renderAnalytics() {
  const metrics = await request('/analytics');

  const totalUsers = Number(metrics.users_total) || 0;
  const activeUsers = Number(metrics.users_active) || 0;
  const suspendedUsers = Number(metrics.users_suspended != null ? metrics.users_suspended : Math.max(totalUsers - activeUsers, 0));

  const circulation = {
    donated: Number(metrics.circulation_donated) || 0,
    exchanged: Number(metrics.circulation_exchanged) || 0,
    lent: Number(metrics.circulation_lent) || 0,
    sold: Number(metrics.circulation_sold) || 0,
    total: Number(metrics.circulation_total != null ? metrics.circulation_total : metrics.completed_interactions) || 0,
    listingsDonated: Number(metrics.listings_donated) || 0,
    listingsExchanged: Number(metrics.listings_exchanged) || 0,
    listingsLent: Number(metrics.listings_lent) || 0,
    listingsSold: Number(metrics.listings_sold) || 0,
    listingsTotal: Number(metrics.listings_active) || 0,
  };

  window.__adminCirculation = circulation;
  window.__adminCircShowCatalog = false;

  const userStatusChartHtml = renderUserStatusDoughnut(activeUsers, suspendedUsers, totalUsers);
  const circulationChartHtml = renderBookCirculationBarChart(circulation, false);

  const summaryLabels = [
    ['Registered Users', totalUsers],
    ['Active Users', activeUsers],
    ['Total Listings', Number(metrics.listings_total) || 0],
    ['Active Listings', Number(metrics.listings_active) || 0],
    ['Completed Handoffs', Number(metrics.completed_interactions) || 0],
    ['Books Recirculated', Number(metrics.books_given_second_chance) || 0],
    ['Communities', Number(metrics.communities_total) || 0],
    ['Active Groups', Number(metrics.communities_active) || 0],
    ['Student Reviews', Number(metrics.reviews_total) || 0],
    ['Open Reports', Number(metrics.open_reports) || 0],
  ];

  content.innerHTML = `
    <!-- Top 10 Summary Metric Cards (Compact & Database-Driven) -->
    <div class="admin-metrics" style="margin-bottom: 24px;">
      ${summaryLabels.map(([label, val]) => `
        <article class="admin-metric">
          <span>${escapeHtml(label)}</span>
          <strong>${Number(val).toLocaleString()}</strong>
        </article>
      `).join('')}
    </div>

    <!-- Section Title -->
    <h2 class="admin-section-title" style="margin: 22px 0 14px 0; font-size: 1.05rem; font-weight: 700;">Platform Visualizations</h2>

    <!-- Exactly Two Main Balanced Charts Side by Side -->
    <div class="admin-overview-charts-grid">
      ${userStatusChartHtml}
      <div id="circ-chart-slot">
        ${circulationChartHtml}
      </div>
    </div>
  `;

  function wireCirculationToggle() {
    const btn = document.getElementById('circ-mode-toggle');
    btn?.addEventListener('click', () => {
      window.__adminCircShowCatalog = !window.__adminCircShowCatalog;
      const slot = document.getElementById('circ-chart-slot');
      if (slot && window.__adminCirculation) {
        slot.innerHTML = renderBookCirculationBarChart(window.__adminCirculation, window.__adminCircShowCatalog);
        wireCirculationToggle();
      }
    });
  }

  wireCirculationToggle();
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
restoreSession();
