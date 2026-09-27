import { api } from '../api.js?v=6';
import { auth } from '../auth.js';

export class CommunitiesView {
  constructor() {
    this.container = document.getElementById('communities-grid');
    this.createDialog = document.getElementById('community-create-modal');
    this.reportDialog = document.getElementById('community-report-modal');
    this.community = null;
    this.activeTab = 'feed';
    this.container?.addEventListener('submit', event => this.handleSubmit(event));
    document.getElementById('create-comm-btn')?.addEventListener('click', () => this.openCreateDialog());
    document.getElementById('community-create-form')?.addEventListener('submit', event => this.create(event));
    document.getElementById('community-report-form')?.addEventListener('submit', event => this.submitReport(event));
    document.querySelectorAll('[data-community-close]').forEach(button => button.addEventListener('click', () => this.createDialog?.close()));
    document.querySelectorAll('[data-report-close]').forEach(button => button.addEventListener('click', () => this.reportDialog?.close()));
    document.getElementById('community-search')?.addEventListener('input', () => this.renderList());
    document.getElementById('community-category-filter')?.addEventListener('change', () => this.renderList());
  }

  async render() {
    if (!this.container) return;
    if (this.community) {
      const response = await api.getCommunity(this.community.id);
      if (response.ok) this.community = response.data;
      else this.community = null;
    }
    if (this.community) await this.renderDetail();
    else await this.renderList();
  }

  async renderList() {
    const response = await api.getCommunities({
      q: document.getElementById('community-search')?.value?.trim(),
      category: document.getElementById('community-category-filter')?.value,
    });
    if (!response.ok) {
      this.container.innerHTML = `<div class="empty-state">${escapeHtml(response.error || 'Could not load communities.')}</div>`;
      return;
    }
    const communities = response.data || [];
    this.container.innerHTML = communities.length ? communities.map(community => `
      <article class="community-card">
        <div class="community-card-top"><span class="community-symbol" aria-hidden="true">${categorySymbol(community.category)}</span><span class="badge badge-indigo">${escapeHtml(community.category)}</span></div>
        <div><h3>${escapeHtml(community.name)}</h3><p>${escapeHtml(community.description)}</p></div>
        <div class="community-card-meta"><span>${community.member_count} ${community.member_count === 1 ? 'member' : 'members'}</span><span>${community.book_count} shared ${community.book_count === 1 ? 'book' : 'books'}</span>${community.is_seed_data ? '<span>Demo community</span>' : ''}</div>
        <div class="community-card-actions"><button type="button" class="btn btn-outline btn-sm" data-open-community="${escapeHtml(community.id)}">View community</button>${community.is_member ? '<span class="badge badge-emerald">Joined</span>' : ''}</div>
      </article>
    `).join('') : '<div class="empty-state">No communities match your search yet. Create one for your campus or course.</div>';
    this.container.querySelectorAll('[data-open-community]').forEach(button => button.addEventListener('click', () => this.openCommunity(button.dataset.openCommunity)));
  }

  async openCommunity(communityId) {
    const response = await api.getCommunity(communityId);
    if (!response.ok) {
      window.toast?.show(response.error || 'Could not open this community.', 'error');
      return;
    }
    this.community = response.data;
    this.activeTab = 'feed';
    await this.renderDetail();
  }

  async renderDetail() {
    const community = this.community;
    this.container.innerHTML = `
      <div class="community-detail">
        <div class="community-detail-heading">
          <button type="button" class="btn btn-ghost btn-sm" data-community-back>← Communities</button>
          <div><span class="badge badge-indigo">${escapeHtml(community.category)}</span><h2>${escapeHtml(community.name)}</h2><p>${escapeHtml(community.description)}</p><button type="button" class="btn btn-ghost btn-sm" data-report-community="${escapeHtml(community.id)}">Report community</button></div>
          <div class="community-detail-actions"><span class="text-secondary">${community.member_count} members · ${community.book_count} books</span><button type="button" class="btn ${community.is_member ? 'btn-outline' : 'btn-primary'} btn-sm" data-membership-action>${community.is_member ? 'Leave' : 'Join community'}</button></div>
        </div>
        <div class="community-tabs" role="tablist" aria-label="Community sections">
          <button type="button" class="tab-btn${this.activeTab === 'feed' ? ' active' : ''}" data-community-tab="feed">Feed</button>
          <button type="button" class="tab-btn${this.activeTab === 'books' ? ' active' : ''}" data-community-tab="books">Shared books</button>
          <button type="button" class="tab-btn${this.activeTab === 'members' ? ' active' : ''}" data-community-tab="members">Members</button>
        </div>
        <div class="community-tab-content"></div>
      </div>
    `;
    this.container.querySelector('[data-community-back]')?.addEventListener('click', () => {
      this.community = null;
      this.renderList();
    });
    this.container.querySelector('[data-membership-action]')?.addEventListener('click', () => this.toggleMembership());
    this.container.querySelector('[data-report-community]')?.addEventListener('click', button => this.openReport('community', button.currentTarget.dataset.reportCommunity));
    this.container.querySelectorAll('[data-community-tab]').forEach(button => button.addEventListener('click', () => {
      this.activeTab = button.dataset.communityTab;
      this.renderDetail();
    }));
    await this.renderTab();
  }

  async renderTab() {
    const target = this.container.querySelector('.community-tab-content');
    if (!target) return;
    target.innerHTML = '<p class="text-secondary">Loading community...</p>';
    if (this.activeTab === 'feed') await this.renderFeed(target);
    else if (this.activeTab === 'books') await this.renderBooks(target);
    else await this.renderMembers(target);
  }

  async renderFeed(target) {
    const response = await api.getCommunityPosts(this.community.id);
    if (!response.ok) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(response.error || 'Could not load the community feed.')}</div>`;
      return;
    }
    const composer = this.community.is_member ? `
      <form class="community-post-form" data-community-post-form>
        <label class="form-group"><span class="form-label">Post type</span><select name="post_type" class="form-select"><option value="discussion">Discussion</option><option value="book_request">Book request</option></select></label>
        <label class="form-group" data-request-title-group hidden><span class="form-label">Book title you are looking for</span><input name="requested_title" class="form-input" maxlength="255"></label>
        <label class="form-group"><span class="form-label">Message</span><textarea name="content" class="form-input" rows="3" maxlength="4000" placeholder="Share a reading note, recommendation, or request..." required></textarea></label>
        <label class="form-group"><span class="form-label">Course (optional)</span><input name="course" class="form-input" maxlength="150"></label>
        <button type="submit" class="btn btn-primary btn-sm">Publish post</button>
      </form>
    ` : '<p class="community-join-hint">Join this community to post, comment, and react.</p>';
    const posts = response.data || [];
    target.innerHTML = `${composer}<div class="community-feed-list">${posts.length ? posts.map(post => `
      <article class="community-post" data-post-id="${escapeHtml(post.id)}">
        <header><div><strong>${escapeHtml(post.author_name)}</strong><span>${post.post_type === 'book_request' ? 'Book request' : 'Discussion'} · ${formatTime(post.created_at)}</span></div><button type="button" class="btn btn-ghost btn-sm" data-report-post="${escapeHtml(post.id)}">Report</button></header>
        ${post.post_type === 'book_request' ? `<div class="community-request-title">Looking for: ${escapeHtml(post.requested_title || '')}${post.course ? ` · ${escapeHtml(post.course)}` : ''}</div>` : ''}
        <p class="community-post-content">${escapeHtml(post.content)}</p>
        ${post.linked_book_id ? `<p class="text-secondary">Linked listing: ${escapeHtml(post.linked_book_id)}</p>` : ''}
        <div class="community-post-actions"><button type="button" class="btn btn-ghost btn-sm${post.reacted_by_me ? ' reacted' : ''}" data-post-reaction="${escapeHtml(post.id)}" data-reacted="${post.reacted_by_me}">♥ ${post.reaction_count} ${post.reacted_by_me ? 'Liked' : 'Like'}</button><span>${post.comments.length} comments</span></div>
        <div class="community-comments">${post.comments.map(comment => `<div class="community-comment"><div class="community-comment-heading"><strong>${escapeHtml(comment.author_name)}</strong><button type="button" class="btn btn-ghost btn-sm" data-report-comment="${escapeHtml(comment.id)}">Report</button></div><p>${escapeHtml(comment.content)}</p><small>${formatTime(comment.created_at)}</small></div>`).join('')}</div>
        ${this.community.is_member ? `<form class="community-comment-form" data-comment-form="${escapeHtml(post.id)}"><input class="form-input" name="content" maxlength="2000" placeholder="Add a comment..." required><button class="btn btn-outline btn-sm" type="submit">Comment</button></form>` : ''}
      </article>
    `).join('') : '<div class="empty-state">No posts yet. Start a discussion or post a book request.</div>'}</div>`;
    const typeSelect = target.querySelector('[name="post_type"]');
    typeSelect?.addEventListener('change', () => {
      const group = target.querySelector('[data-request-title-group]');
      const title = target.querySelector('[name="requested_title"]');
      group.hidden = typeSelect.value !== 'book_request';
      title.required = typeSelect.value === 'book_request';
    });
    target.querySelectorAll('[data-report-post]').forEach(button => button.addEventListener('click', () => this.openReport('post', button.dataset.reportPost)));
    target.querySelectorAll('[data-report-comment]').forEach(button => button.addEventListener('click', () => this.openReport('comment', button.dataset.reportComment)));
    target.querySelectorAll('[data-post-reaction]').forEach(button => button.addEventListener('click', async () => {
      if (!this.requireAuth()) return;
      const result = await api.reactToCommunityPost(this.community.id, button.dataset.postReaction, button.dataset.reacted === 'true');
      if (result.ok) await this.renderTab();
      else window.toast?.show(result.error || 'Could not update reaction.', 'error');
    }));
  }

  async renderBooks(target) {
    const response = await api.getCommunityBooks(this.community.id);
    if (!response.ok) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(response.error || 'Could not load shared books.')}</div>`;
      return;
    }
    const books = response.data || [];
    let shareForm = '';
    if (this.community.is_member && auth.isAuthenticated) {
      const mine = await api.getMyListings();
      const options = mine.ok ? mine.data.filter(book => book.status === 'active').map(book => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)} · ${escapeHtml(book.author)}</option>`).join('') : '';
      shareForm = `<form class="community-share-form" data-share-book-form><label class="form-group"><span class="form-label">Share one of your active listings</span><select class="form-select" name="book_id" required><option value="">Choose a listing</option>${options}</select></label><button type="submit" class="btn btn-outline btn-sm">Share book</button></form>`;
    }
    target.innerHTML = `${shareForm}<div class="community-book-list">${books.length ? books.map(book => `
          <article class="community-book-item"><span class="community-book-mark" aria-hidden="true">▤</span><div><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.author)} · ${escapeHtml(book.condition)} · ${escapeHtml(book.listing_type)} · ${escapeHtml(book.status)}</p><small>Shared by ${escapeHtml(book.added_by)}${book.is_seed_data ? ' · Demo data' : ''}</small></div>${book.price != null ? `<strong>₹${book.price}</strong>` : ''}<button type="button" class="btn btn-ghost btn-sm" data-report-book="${escapeHtml(book.id)}">Report</button></article>
    `).join('') : '<div class="empty-state">No books shared here yet.</div>'}</div>`;
    target.querySelectorAll('[data-report-book]').forEach(button => button.addEventListener('click', () => this.openReport('book', button.dataset.reportBook)));
  }

  async renderMembers(target) {
    const response = await api.getCommunityMembers(this.community.id);
    if (!response.ok) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(response.error || 'Could not load members.')}</div>`;
      return;
    }
    target.innerHTML = response.data.length ? `<div class="community-member-list">${response.data.map(member => `
      <article class="community-member-item"><span class="community-member-avatar">${escapeHtml(initials(member.name))}</span><div><strong>${escapeHtml(member.name)}</strong><p>${escapeHtml([member.course, member.university].filter(Boolean).join(' · ') || 'BookLoop student')}</p></div><span class="badge ${member.role === 'owner' ? 'badge-emerald' : 'badge-indigo'}">${escapeHtml(member.role)}</span></article>
    `).join('')}</div>` : '<div class="empty-state">No members yet.</div>';
  }

  async handleSubmit(event) {
    const form = event.target;
    if (form.matches('[data-community-post-form]')) {
      event.preventDefault();
      if (!this.requireAuth()) return;
      const values = new FormData(form);
      const response = await api.createCommunityPost(this.community.id, {
        post_type: values.get('post_type'),
        content: values.get('content'),
        requested_title: values.get('requested_title') || null,
        course: values.get('course') || null,
      });
      if (response.ok) {
        window.toast?.show('Post published to the community.', 'success');
        await this.renderTab();
      } else window.toast?.show(response.error || 'Could not publish this post.', 'error');
    } else if (form.matches('[data-comment-form]')) {
      event.preventDefault();
      if (!this.requireAuth()) return;
      const values = new FormData(form);
      const response = await api.addCommunityComment(this.community.id, form.dataset.commentForm, values.get('content'));
      if (response.ok) await this.renderTab();
      else window.toast?.show(response.error || 'Could not add your comment.', 'error');
    } else if (form.matches('[data-share-book-form]')) {
      event.preventDefault();
      const values = new FormData(form);
      const response = await api.addCommunityBook(this.community.id, values.get('book_id'));
      if (response.ok) {
        window.toast?.show('Book shared with the community.', 'success');
        await this.render();
      } else window.toast?.show(response.error || 'Could not share this listing.', 'error');
    }
  }

  async create(event) {
    event.preventDefault();
    if (!this.requireAuth()) return;
    const form = event.currentTarget;
    if (form.dataset.submitting) return;
    const submitButton = form.querySelector('[type="submit"]');
    form.dataset.submitting = 'true';
    submitButton.disabled = true;
    submitButton.textContent = 'Creating...';
    try {
      const values = new FormData(form);
      const response = await api.createCommunity({
        name: values.get('name'),
        description: values.get('description'),
        category: values.get('category'),
        location_name: values.get('location_name') || null,
        latitude: values.get('latitude') ? Number(values.get('latitude')) : null,
        longitude: values.get('longitude') ? Number(values.get('longitude')) : null,
      });
      if (!response.ok) {
        window.toast?.show(response.error || 'Could not create the community.', 'error');
        return;
      }
      form.reset();
      this.createDialog?.close();
      this.community = response.data;
      this.activeTab = 'feed';
      await this.renderDetail();
      window.toast?.show('Community created.', 'success');
    } catch {
      window.toast?.show('Could not create the community. Please try again.', 'error');
    } finally {
      delete form.dataset.submitting;
      submitButton.disabled = false;
      submitButton.textContent = 'Create community';
    }
  }

  async toggleMembership() {
    if (!this.requireAuth()) return;
    const response = this.community.is_member
      ? await api.leaveCommunity(this.community.id)
      : await api.joinCommunity(this.community.id);
    if (!response.ok) {
      window.toast?.show(response.error || 'Could not update membership.', 'error');
      return;
    }
    if (this.community.is_member) {
      this.community = null;
      await this.renderList();
    } else {
      this.community = response.data;
      await this.renderDetail();
    }
  }

  openCreateDialog() {
    if (!this.requireAuth()) return;
    this.createDialog?.showModal();
  }

  openReport(targetType, targetId) {
    if (!this.requireAuth()) return;
    document.getElementById('community-report-target-type').value = targetType;
    document.getElementById('community-report-target-id').value = targetId;
    this.reportDialog?.showModal();
  }

  async submitReport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.submitting) return;
    const submitButton = form.querySelector('[type="submit"]');
    form.dataset.submitting = 'true';
    submitButton.disabled = true;
    try {
      const values = new FormData(form);
      const response = await api.reportCommunityItem(this.community.id, {
        target_type: values.get('target_type'),
        target_id: values.get('target_id'),
        reason: values.get('reason'),
      });
      if (response.ok) {
        this.reportDialog?.close();
        form.reset();
        window.toast?.show('Report sent to moderators.', 'success');
      } else window.toast?.show(response.error || 'Could not send this report.', 'error');
    } catch {
      window.toast?.show('Could not send this report. Please try again.', 'error');
    } finally {
      delete form.dataset.submitting;
      submitButton.disabled = false;
    }
  }

  requireAuth() {
    if (auth.isAuthenticated) return true;
    document.getElementById('open-login-btn')?.click();
    window.toast?.show('Log in to use community features.', 'info');
    return false;
  }
}

function categorySymbol(category) {
  if (/computer|engineering|technology/i.test(category)) return '⌘';
  if (/exam|test/i.test(category)) return '◎';
  if (/literature|reader|book/i.test(category)) return '▤';
  return '◉';
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}