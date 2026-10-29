import { api } from '../api.js?v=9';
import { auth } from '../auth.js';

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

export class ListingFormController {
  constructor() {
    this.dialog = document.getElementById('listing-modal');
    this.form = document.getElementById('listing-form');
    this.steps = [...document.querySelectorAll('[data-listing-step]')];
    this.currentStep = 0;
    this.editingId = null;
    this._existingImageUrls = [];
    this._submitting = false;

    if (!this.dialog || !this.form) return;

    this.form.addEventListener('submit', event => {
      event.preventDefault();
      this.submit();
    });
    document.getElementById('listing-next-btn')?.addEventListener('click', () => this.next());
    document.getElementById('listing-back-btn')?.addEventListener('click', () => this.back());
    document.getElementById('listing-preview-btn')?.addEventListener('click', () => this.showPreview());
    document.getElementById('listing-type-input')?.addEventListener('change', () => this.updateTermsVisibility());
    this.dialog.querySelectorAll('[data-listing-close]').forEach(button => button.addEventListener('click', () => this.close()));

    // Setup Book Cover Photo upload handlers
    const photoInput = document.getElementById('listing-photo-file');
    const photoSpinner = document.getElementById('listing-photo-upload-spinner');
    const previewContainer = document.getElementById('listing-photo-preview-container');
    const previewImg = document.getElementById('listing-photo-preview-img');
    const removeBtn = document.getElementById('listing-photo-remove-btn');

    photoInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        window.toast?.show('Only JPG, PNG, and WebP images are allowed.', 'error');
        e.target.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        window.toast?.show('Image file size must be less than 5 MB.', 'error');
        e.target.value = '';
        return;
      }

      // Show uploading indicator
      if (photoSpinner) photoSpinner.style.display = 'flex';
      const nextBtn = document.getElementById('listing-next-btn');
      const publishBtn = document.getElementById('listing-publish-btn');
      if (nextBtn) nextBtn.disabled = true;
      if (publishBtn) publishBtn.disabled = true;

      try {
        const res = await api.uploadBookImage(file);
        if (res.ok && res.data?.image_url) {
          const uploadedUrl = res.data.image_url;
          this._existingImageUrls = [uploadedUrl];
          if (previewImg) {
            previewImg.src = resolveImageUrl(uploadedUrl);
          }
          if (previewContainer) {
            previewContainer.style.display = 'flex';
          }
          window.toast?.show('Cover photo uploaded successfully.', 'success');
        } else {
          window.toast?.show(res.error || 'Failed to upload image.', 'error');
          e.target.value = '';
        }
      } catch (err) {
        window.toast?.show('An error occurred while uploading image.', 'error');
        e.target.value = '';
      } finally {
        if (photoSpinner) photoSpinner.style.display = 'none';
        if (nextBtn) nextBtn.disabled = false;
        if (publishBtn) publishBtn.disabled = false;
      }
    });

    removeBtn?.addEventListener('click', () => {
      this._existingImageUrls = [];
      if (photoInput) photoInput.value = '';
      if (previewImg) previewImg.src = '';
      if (previewContainer) previewContainer.style.display = 'none';
      window.toast?.show('Cover photo removed. Default cover will be used.', 'info');
    });

    this.showStep(0);
  }

  open(listing = null) {
    this.editingId = listing?.id || null;
    this.form.reset();
    this.currentStep = 0;
    this._existingImageUrls = [];

    // Reset photo upload UI
    const photoInput = document.getElementById('listing-photo-file');
    const previewContainer = document.getElementById('listing-photo-preview-container');
    const previewImg = document.getElementById('listing-photo-preview-img');
    const photoSpinner = document.getElementById('listing-photo-upload-spinner');

    if (photoInput) photoInput.value = '';
    if (photoSpinner) photoSpinner.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.style.display = 'none';

    if (listing) {
      this.fill(listing);
      const existingPhoto = (Array.isArray(listing.image_urls) && listing.image_urls[0])
        ? listing.image_urls[0]
        : (Array.isArray(listing.imageUrls) && listing.imageUrls[0])
          ? listing.imageUrls[0]
          : (typeof listing.image_url === 'string' && listing.image_url)
            ? listing.image_url
            : null;

      if (existingPhoto) {
        this._existingImageUrls = [existingPhoto];
        if (previewImg) previewImg.src = resolveImageUrl(existingPhoto);
        if (previewContainer) previewContainer.style.display = 'flex';
      }
    } else {
      const userCity = auth.user?.profile?.city || auth.user?.profile?.location;
      const locInput = document.getElementById('listing-safe-meeting-point');
      if (locInput && userCity && !locInput.value) {
        locInput.value = userCity;
      }
    }
    this.updateTermsVisibility();
    this.showStep(0);
    this.dialog.showModal();
  }

  close() {
    this.dialog?.close();
  }

  fill(listing) {
    const categoryMap = {
      'ece-ee': 'Electrical and Electronics',
      'electrical and electronics': 'Electrical and Electronics',
      'electrical & electronics': 'Electrical and Electronics',
      'mech-civil': 'Mechanical and Civil',
      'mechanical and civil': 'Mechanical and Civil',
      'mechanical & civil': 'Mechanical and Civil',
      'medical': 'Medical and Health',
      'medical and health': 'Medical and Health',
      'medical&health': 'Medical and Health',
      'commerce': 'Commerce',
      'commerce & mba': 'Commerce',
      'exams': 'GATE',
      'gate': 'GATE',
      'gate & exams': 'GATE',
      'gate&exams': 'GATE',
      'cse': 'Other',
      'computer science': 'Other',
      'engineering': 'Other',
      'other': 'Other',
    };
    const normCategory = listing.category ? (categoryMap[listing.category.trim().toLowerCase()] || listing.category) : '';

    const values = {
      title: listing.title,
      author: listing.author,
      isbn: listing.isbn,
      edition: listing.edition,
      course: listing.course,
      course_code: listing.course_code || listing.courseCode,
      category: normCategory,
      condition: listing.condition,
      listing_type: listing.listing_type || listing.listingType,
      price: listing.price,
      price_unit: listing.price_unit || listing.priceUnit,
      original_price: listing.original_price || listing.originalPrice,
      exchange_wish: listing.exchange_wish || listing.exchangeWish,
      description: listing.description,
      safe_meeting_point: listing.safe_meeting_point || listing.safeMeetingPoint || '',
    };
    Object.entries(values).forEach(([key, value]) => {
      const input = document.getElementById(`listing-${key.replaceAll('_', '-')}`);
      if (input && value != null) input.value = value;
    });
    this.updateTermsVisibility();
  }

  showStep(index) {
    this.currentStep = index;
    this.steps.forEach((step, stepIndex) => {
      step.hidden = stepIndex !== index;
    });
    const progress = document.getElementById('listing-progress');
    if (progress) progress.textContent = `Step ${index + 1} of ${this.steps.length}`;
    const back = document.getElementById('listing-back-btn');
    const next = document.getElementById('listing-next-btn');
    const publish = document.getElementById('listing-publish-btn');
    if (back) back.hidden = index === 0;
    if (next) next.hidden = index >= this.steps.length - 1;
    if (publish) publish.hidden = index !== this.steps.length - 1;
  }

  next() {
    const step = this.steps[this.currentStep];
    if (!step || !this.validateStep(step)) return;
    this.showStep(Math.min(this.currentStep + 1, this.steps.length - 1));
    if (this.currentStep === this.steps.length - 1) this.showPreview();
  }

  back() {
    this.showStep(Math.max(this.currentStep - 1, 0));
  }

  validateStep(step) {
    const fields = [...step.querySelectorAll('input, select, textarea')];
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  updateTermsVisibility() {
    const type = document.getElementById('listing-type-input')?.value;
    const priceGroup = document.getElementById('listing-price-group');
    const exchangeGroup = document.getElementById('listing-exchange-group');
    const priceInput = document.getElementById('listing-price');
    const priceUnit = document.getElementById('listing-price-unit');

    const isPaid = (type === 'sell' || type === 'lend');
    if (priceGroup) {
      priceGroup.hidden = !isPaid;
      priceGroup.style.display = isPaid ? '' : 'none';
    }
    if (priceInput) {
      priceInput.required = isPaid;
      if (!isPaid) {
        priceInput.value = '';
      }
    }
    if (priceUnit && !isPaid) {
      priceUnit.value = '';
    }
    if (exchangeGroup) {
      const isExchange = (type === 'exchange');
      exchangeGroup.hidden = !isExchange;
      exchangeGroup.style.display = isExchange ? '' : 'none';
      const exchangeWish = document.getElementById('listing-exchange-wish');
      if (!isExchange && exchangeWish) {
        exchangeWish.value = '';
      }
    }
  }

  values() {
    const value = id => document.getElementById(id)?.value?.trim() || null;
    const listingType = value('listing-type-input');
    const isPaid = (listingType === 'sell' || listingType === 'lend');

    return {
      title: value('listing-title'),
      author: value('listing-author'),
      isbn: value('listing-isbn'),
      edition: value('listing-edition'),
      course: value('listing-course'),
      course_code: value('listing-course-code'),
      category: value('listing-category'),
      condition: value('listing-condition'),
      listing_type: listingType,
      price: isPaid && value('listing-price') ? Number(value('listing-price')) : 0,
      price_unit: isPaid ? value('listing-price-unit') : null,
      original_price: value('listing-original-price') ? Number(value('listing-original-price')) : null,
      exchange_wish: (listingType === 'exchange') ? value('listing-exchange-wish') : null,
      description: value('listing-description'),
      safe_meeting_point: value('listing-safe-meeting-point'),
      image_urls: Array.isArray(this._existingImageUrls) ? this._existingImageUrls : [],
      latitude: null,
      longitude: null,
    };
  }

  showPreview() {
    const values = this.values();
    const preview = document.getElementById('listing-preview');
    if (!preview) return;

    const rawPhoto = (Array.isArray(this._existingImageUrls) && this._existingImageUrls[0]) ? this._existingImageUrls[0] : null;
    const photoUrl = resolveImageUrl(rawPhoto);
    const displayCover = photoUrl || DEFAULT_BOOK_COVER;

    preview.innerHTML = `
      <div style="display:flex;gap:var(--space-4);align-items:flex-start;">
        <div style="width:85px;height:115px;border-radius:var(--radius-sm);overflow:hidden;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid var(--border-medium);background:#1E293B;">
          <img src="${escapeHtml(displayCover)}" alt="${escapeHtml(values.title || 'Book Cover')}" style="width:100%;height:100%;object-fit:cover;" onerror="if(this.src!=='${DEFAULT_BOOK_COVER}' && !this.src.endsWith('${DEFAULT_BOOK_COVER}')){this.src='${DEFAULT_BOOK_COVER}';}">
        </div>
        <div style="flex:1;">
          <span class="badge badge-indigo" style="text-transform:capitalize;">${escapeHtml(values.listing_type || 'listing')}</span>
          <h3 style="margin-top:6px;font-size:1.05rem;font-weight:700;color:var(--text-primary);">${escapeHtml(values.title || 'Untitled book')}</h3>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">by ${escapeHtml(values.author || 'Unknown author')}</p>
          <p style="font-size:0.78rem;color:var(--text-tertiary);margin-bottom:6px;">${escapeHtml(values.course_code || values.course || 'Course not specified')} · ${escapeHtml(values.condition || 'Condition not specified')}</p>
          ${values.safe_meeting_point ? `<p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:6px;">📍 <strong>Location:</strong> ${escapeHtml(values.safe_meeting_point)}</p>` : ''}
          <div style="font-size:1rem;font-weight:700;color:var(--primary);margin-top:4px;">
            ${values.price && values.price > 0 ? `₹${values.price}${values.price_unit || ''}` : values.listing_type === 'donate' ? 'Free Donation' : values.listing_type === 'exchange' ? 'Exchange terms apply' : 'Free'}
          </div>
        </div>
      </div>
    `;
  }

  async submit() {
    if (this._submitting) return;
    if (!this.validateStep(this.steps[this.steps.length - 1])) return;

    const publishBtn = document.getElementById('listing-publish-btn');
    const originalText = publishBtn ? publishBtn.textContent : 'Publish listing';

    this._submitting = true;
    if (publishBtn) {
      publishBtn.disabled = true;
      publishBtn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span> Saving...`;
    }

    try {
      const payload = this.values();
      const response = this.editingId
        ? await api.updateListing(this.editingId, payload)
        : await api.createListing(payload);

      if (response.ok) {
        window.toast?.show(this.editingId ? 'Listing updated successfully.' : 'Listing published successfully.', 'success');
        this.close();
        window.dispatchEvent(new CustomEvent('listingChanged'));
      } else {
        window.toast?.show(response.error || 'Unable to save listing.', 'error');
      }
    } catch (err) {
      window.toast?.show('An unexpected error occurred while saving listing.', 'error');
    } finally {
      this._submitting = false;
      if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.textContent = originalText;
      }
    }
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}
