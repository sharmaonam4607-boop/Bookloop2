import { api } from '../api.js?v=7';

export class ListingFormController {
  constructor() {
    this.dialog = document.getElementById('listing-modal');
    this.form = document.getElementById('listing-form');
    this.steps = [...document.querySelectorAll('[data-listing-step]')];
    this.currentStep = 0;
    this.editingId = null;
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
    this.showStep(0);
  }

  open(listing = null) {
    this.editingId = listing?.id || null;
    this.form.reset();
    this.currentStep = 0;
    if (listing) this.fill(listing);
    this.showStep(0);
    this.dialog.showModal();
  }

  close() {
    this.dialog?.close();
  }

  fill(listing) {
    const values = {
      title: listing.title,
      author: listing.author,
      isbn: listing.isbn,
      edition: listing.edition,
      course: listing.course,
      course_code: listing.course_code || listing.courseCode,
      category: listing.category,
      condition: listing.condition,
      listing_type: listing.listing_type || listing.listingType,
      price: listing.price,
      price_unit: listing.price_unit || listing.priceUnit,
      original_price: listing.original_price || listing.originalPrice,
      exchange_wish: listing.exchange_wish || listing.exchangeWish,
      image_urls: (listing.image_urls || []).join(', '),
      description: listing.description,
      safe_meeting_point: listing.safe_meeting_point,
      latitude: listing.latitude,
      longitude: listing.longitude,
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
    const price = document.getElementById('listing-price-group');
    const exchange = document.getElementById('listing-exchange-group');
    const priceInput = document.getElementById('listing-price');
    if (price) price.hidden = !['sell', 'lend'].includes(type);
    if (priceInput) priceInput.required = ['sell', 'lend'].includes(type);
    if (exchange) exchange.hidden = type !== 'exchange';
  }

  values() {
    const value = id => document.getElementById(id)?.value?.trim() || null;
    return {
      title: value('listing-title'),
      author: value('listing-author'),
      isbn: value('listing-isbn'),
      edition: value('listing-edition'),
      course: value('listing-course'),
      course_code: value('listing-course-code'),
      category: value('listing-category'),
      condition: value('listing-condition'),
      listing_type: value('listing-type-input'),
      price: value('listing-price') ? Number(value('listing-price')) : null,
      price_unit: value('listing-price-unit'),
      original_price: value('listing-original-price') ? Number(value('listing-original-price')) : null,
      exchange_wish: value('listing-exchange-wish'),
      image_urls: (value('listing-image-urls') || '').split(',').map(url => url.trim()).filter(Boolean),
      description: value('listing-description'),
      safe_meeting_point: value('listing-safe-meeting-point'),
      latitude: value('listing-latitude') ? Number(value('listing-latitude')) : null,
      longitude: value('listing-longitude') ? Number(value('listing-longitude')) : null,
    };
  }

  showPreview() {
    const values = this.values();
    const preview = document.getElementById('listing-preview');
    if (!preview) return;
    preview.innerHTML = `
      <div class="listing-preview-cover">📖</div>
      <div><span class="badge badge-indigo">${escapeHtml(values.listing_type || 'listing')}</span>
      <h3>${escapeHtml(values.title || 'Untitled book')}</h3>
      <p>by ${escapeHtml(values.author || 'Unknown author')}</p>
      <p>${escapeHtml(values.course_code || values.course || 'Course not specified')} · ${escapeHtml(values.condition || 'Condition not specified')}</p>
      ${values.safe_meeting_point ? `<p>Safe meeting point: ${escapeHtml(values.safe_meeting_point)}</p>` : ''}
      <strong>${values.price != null ? `₹${values.price}${values.price_unit || ''}` : values.listing_type === 'donate' ? 'Free' : 'Exchange terms apply'}</strong></div>
    `;
  }

  async submit() {
    if (!this.validateStep(this.steps[this.steps.length - 1])) return;
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
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}
