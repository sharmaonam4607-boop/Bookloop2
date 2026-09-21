/**
 * BookLoop Accessible Dialog Modal Controller
 */

export class ModalController {
  constructor() {
    this.activeModal = null;
    this.initGlobalListeners();
  }

  initGlobalListeners() {
    // Close modal when pressing ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal(this.activeModal.id);
      }
    });

    // Close when clicking outside modal dialog content
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        const modal = e.target.closest('dialog') || e.target;
        this.closeModal(modal.id);
      }
    });

    // Handle close buttons
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-modal-close]');
      if (closeBtn) {
        const modal = closeBtn.closest('dialog') || closeBtn.closest('.app-modal');
        if (modal) {
          this.closeModal(modal.id);
        }
      }
    });
  }

  openModal(modalId) {
    const dialog = document.getElementById(modalId);
    if (!dialog) return;

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', 'true');
    }

    dialog.classList.add('modal-visible');
    document.body.style.overflow = 'hidden';
    this.activeModal = dialog;
  }

  closeModal(modalId) {
    const dialog = document.getElementById(modalId) || this.activeModal;
    if (!dialog) return;

    dialog.classList.remove('modal-visible');
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }

    document.body.style.overflow = '';
    this.activeModal = null;
  }
}

export const modal = new ModalController();
