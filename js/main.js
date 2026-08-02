// グローバルスクリプト：テーマ切り替え、スクロール効果、インタラクション全体を管理

// ========== 最優先：ページ描画前にテーマを確定（白フラッシュ防止） ==========
(function () {
  const themeKey = 'personal-site-theme';
  const saved = localStorage.getItem(themeKey);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (!saved && prefersDark);
  // プリロード状態で先にテーマを適用
  document.body.classList.toggle('theme-dark', isDark);
  // ロード完了後にトランジションを有効化
  window.addEventListener('load', () => {
    setTimeout(() => document.body.classList.remove('theme-preload'), 120);
  });
})();

const state = {
  themeKey: 'personal-site-theme',
  theme: 'light',
};

const elements = {
  body: document.body,
  header: document.querySelector('.page-header'),
  themeSwitches: document.querySelectorAll('.theme-switch'),
  mobileToggle: document.querySelector('.mobile-menu__toggle'),
  mobileMenu: document.querySelector('.mobile-menu'),
  mobileOverlay: document.querySelector('.mobile-menu__overlay'),
  backToTop: document.querySelector('.back-to-top'),
  heroSection: document.querySelector('.hero'),
  fadeItems: document.querySelectorAll('.fade-up'),
  progressBars: document.querySelectorAll('[data-progress]'),
  counters: document.querySelectorAll('[data-counter]'),
  tabButtons: document.querySelectorAll('[data-tab]'),
  filterButtons: document.querySelectorAll('[data-filter]'),
  projectCards: document.querySelectorAll('[data-category]'),
  modal: document.querySelector('.modal'),
  modalClose: document.querySelector('.modal__close'),
  modalOverlay: document.querySelector('.modal'),
  timelineItems: document.querySelectorAll('.timeline__item'),
  accordionHeaders: document.querySelectorAll('.accordion-item__header'),
  form: document.querySelector('.contact-form'),
  formControls: document.querySelectorAll('.form-control'),
};

// テーマの初期化と保存
function initTheme() {
  const saved = localStorage.getItem(state.themeKey);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = saved === 'dark' ? 'dark' : (!saved && prefersDark ? 'dark' : 'light');
  
  // 強制的にクラスを同期
  elements.body.classList.toggle('theme-dark', state.theme === 'dark');
  
  // 全てのテーマ切替ボタンのアイコンを同期
  elements.themeSwitches?.forEach((button) => {
    button.innerText = state.theme === 'dark' ? '☀' : '🌙';
  });

  // システムテーマ変更を監視（手動設定がない場合のみ自動追従）
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(state.themeKey)) {
      state.theme = e.matches ? 'dark' : 'light';
      elements.body.classList.toggle('theme-dark', state.theme === 'dark');
      elements.themeSwitches?.forEach((button) => {
        button.innerText = state.theme === 'dark' ? '☀' : '🌙';
      });
    }
  });
}

function toggleTheme() {
  // トグル実行
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  elements.body.classList.toggle('theme-dark', state.theme === 'dark');
  
  // ユーザー設定を保存
  localStorage.setItem(state.themeKey, state.theme);
  
  // 全ボタンのアイコンを即時更新
  elements.themeSwitches?.forEach((button) => {
    button.innerText = state.theme === 'dark' ? '☀' : '🌙';
  });

  // 強制的にスタイルを再描画（一部ブラウザで変数が反映されない問題に対応）
  const forceReflow = document.body.offsetHeight;
}

function updateHeader() {
  const scrolled = window.scrollY > 80;
  elements.header.classList.toggle('scrolled', scrolled);
}

function toggleMobileMenu() {
  elements.mobileMenu.classList.toggle('open');
}

function closeMobileMenu() {
  elements.mobileMenu.classList.remove('open');
}

function updateBackToTop() {
  if (!elements.backToTop) return;
  if (window.scrollY > window.innerHeight) {
    elements.backToTop.classList.add('visible');
  } else {
    elements.backToTop.classList.remove('visible');
  }
}

function initParallax() {
  if (!elements.heroSection) return;
  elements.heroSection.addEventListener('mousemove', (event) => {
    const rect = elements.heroSection.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    elements.heroSection.style.setProperty('--hero-x', `${x * 20}px`);
    elements.heroSection.style.setProperty('--hero-y', `${y * 20}px`);
  });
}

function revealOnScroll() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
      if (entry.target.matches('[data-progress]')) {
        const value = Number(entry.target.dataset.progress);
        entry.target.querySelector('.progress__fill').style.width = `${value}%`;
      }
      if (entry.target.matches('[data-counter]')) {
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.18 });

  elements.fadeItems.forEach((item) => observer.observe(item));
  elements.progressBars.forEach((bar) => observer.observe(bar));
  elements.counters.forEach((counter) => observer.observe(counter));
}

function animateCounter(card) {
  const target = Number(card.dataset.target);
  const valueElement = card.querySelector('.counter-card__value');
  if (!valueElement || card.dataset.animated) return;
  card.dataset.animated = 'true';
  const duration = 1400;
  const start = performance.now();
  const startValue = 0;
  const step = (timestamp) => {
    const progress = Math.min((timestamp - start) / duration, 1);
    const current = Math.floor(progress * target);
    valueElement.innerText = current.toLocaleString();
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      valueElement.innerText = target.toLocaleString();
    }
  };
  requestAnimationFrame(step);
}

function initTabs() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.tab;
      const activeButtons = document.querySelectorAll('.tab.is-active');
      activeButtons.forEach((btn) => btn.classList.remove('is-active'));
      button.classList.add('is-active');
      document.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.classList.toggle('is-visible', panel.dataset.panel === panelId);
      });
    });
  });
}

function initPortfolioFilter() {
  elements.filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;
      elements.filterButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
      elements.projectCards.forEach((card) => {
        const matches = category === 'all' || card.dataset.category === category;
        card.classList.toggle('project-card--hidden', !matches);
      });
    });
  });
}

const carouselState = {
  track: null,
  dots: null,
  prevButton: null,
  nextButton: null,
  currentIndex: 0,
  intervalId: null,
  images: [],
};

function renderCarousel(images) {
  const modal = elements.modal;
  if (!modal) return;
  const track = modal.querySelector('.carousel__track');
  const dots = modal.querySelector('.carousel__dots');
  if (!track || !dots) return;

  carouselState.images = images;
  carouselState.currentIndex = 0;
  track.innerHTML = images.map((src, index) => `
    <div class="carousel__slide" data-slide="${index}">
      <img src="${src}" alt="スクリーンショット ${index + 1}" loading="lazy" />
    </div>
  `).join('');
  dots.innerHTML = images.map((_, index) => `
    <button class="carousel__dot" type="button" aria-label="スライド ${index + 1}"></button>
  `).join('');

  carouselState.track = track;
  carouselState.dots = dots.querySelectorAll('.carousel__dot');
  updateCarousel();
  startCarousel();
}

function updateCarousel() {
  if (!carouselState.track || !carouselState.images.length) return;
  const offset = carouselState.currentIndex * -100;
  carouselState.track.style.transform = `translateX(${offset}%)`;
  carouselState.dots.forEach((dot, index) => {
    dot.classList.toggle('is-active', index === carouselState.currentIndex);
  });
}

function startCarousel() {
  clearCarousel();
  if (!carouselState.images.length) return;
  carouselState.intervalId = window.setInterval(() => {
    carouselState.currentIndex = (carouselState.currentIndex + 1) % carouselState.images.length;
    updateCarousel();
  }, 3000);
}

function clearCarousel() {
  if (carouselState.intervalId) {
    window.clearInterval(carouselState.intervalId);
    carouselState.intervalId = null;
  }
}

function initCarouselControls() {
  if (!elements.modal) return;
  carouselState.prevButton = elements.modal.querySelector('.carousel__control--prev');
  carouselState.nextButton = elements.modal.querySelector('.carousel__control--next');
  const dotsContainer = elements.modal.querySelector('.carousel__dots');

  if (carouselState.prevButton) {
    carouselState.prevButton.addEventListener('click', () => {
      if (!carouselState.images.length) return;
      carouselState.currentIndex = (carouselState.currentIndex - 1 + carouselState.images.length) % carouselState.images.length;
      updateCarousel();
      startCarousel();
    });
  }

  if (carouselState.nextButton) {
    carouselState.nextButton.addEventListener('click', () => {
      if (!carouselState.images.length) return;
      carouselState.currentIndex = (carouselState.currentIndex + 1) % carouselState.images.length;
      updateCarousel();
      startCarousel();
    });
  }

  if (dotsContainer) {
    dotsContainer.addEventListener('click', (event) => {
      const button = event.target.closest('.carousel__dot');
      if (!button) return;
      const index = Array.from(dotsContainer.children).indexOf(button);
      if (index < 0) return;
      carouselState.currentIndex = index;
      updateCarousel();
      startCarousel();
    });
  }
}

function openModal(card) {
  const modal = elements.modal;
  if (!modal) return;
  const title = card.dataset.title;
  const category = card.dataset.categoryLabel;
  const overview = card.dataset.description || '';
  const research = card.dataset.research || '';
  const role = card.dataset.role || '';
  const results = card.dataset.results || '';
  const features = card.dataset.features ? card.dataset.features.split('||') : [];
  const stack = card.dataset.stack || '';
  const benefits = card.dataset.benefits || '';
  const images = card.dataset.images ? card.dataset.images.split(',') : [card.dataset.image];

  modal.querySelector('.modal__title').innerText = title;
  modal.querySelector('.modal__tag').innerText = category;
  modal.querySelector('.modal__overview').innerText = overview;
  modal.querySelector('.modal__research').innerText = research;
  modal.querySelector('.modal__role').innerText = role;
  modal.querySelector('.modal__results').innerText = results;
  modal.querySelector('.modal__stack').innerText = stack;
  modal.querySelector('.modal__benefits').innerText = benefits;

  const featuresSection = modal.querySelector('.modal__section--features');
  const featuresList = modal.querySelector('.modal__features');
  const researchSection = modal.querySelector('.modal__section--research');
  const roleSection = modal.querySelector('.modal__section--role');
  const resultsSection = modal.querySelector('.modal__section--results');

  featuresList.innerHTML = features.map((item) => `<li>${item}</li>`).join('');
  featuresSection.style.display = features.length ? 'block' : 'none';
  researchSection.style.display = research ? 'block' : 'none';
  roleSection.style.display = role ? 'block' : 'none';
  resultsSection.style.display = results ? 'block' : 'none';

  const benefitsSection = modal.querySelector('.modal__section--benefits');
  benefitsSection.style.display = benefits ? 'block' : 'none';

  renderCarousel(images);
  modal.classList.add('open');
}

function closeModal() {
  if (!elements.modal) return;
  elements.modal.classList.remove('open');
  clearCarousel();
}

function initProjectModals() {
  elements.projectCards.forEach((card) => {
    card.addEventListener('click', () => openModal(card));
  });
  initCarouselControls();
  if (elements.modalClose) {
    elements.modalClose.addEventListener('click', closeModal);
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
  if (elements.modalOverlay) {
    elements.modalOverlay.addEventListener('click', (event) => {
      if (event.target === elements.modalOverlay) {
        closeModal();
      }
    });
  }
}

function initTimeline() {
  elements.timelineItems.forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('is-open');
      elements.timelineItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove('is-open');
        }
      });
    });
  });
}

function initAccordion() {
  elements.accordionHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      if (!item) return;
      const isOpen = item.classList.contains('is-open');
      document.querySelectorAll('.accordion-item').forEach((accordion) => accordion.classList.remove('is-open'));
      if (!isOpen) item.classList.add('is-open');
    });
  });
}

function handleInputLabels() {
  elements.formControls.forEach((control) => {
    const input = control.querySelector('input, textarea');
    if (!input) return;
    const update = () => {
      control.classList.toggle('form-control--filled', input.value.trim() !== '');
    };
    input.addEventListener('input', update);
    input.addEventListener('blur', update);
    update();
  });
}

function validateField(field) {
  const value = field.value.trim();
  const error = field.closest('.form-control').querySelector('.form-control__feedback');
  const status = field.closest('.form-control').querySelector('.form-control__status');
  let message = '';
  if (field.required && !value) {
    message = '必須項目です。';
  } else if (field.type === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) {
    message = '正しいメールアドレスを入力してください。';
  }
  if (message) {
    field.classList.add('form-control__input--invalid');
    if (field.tagName.toLowerCase() === 'textarea') {
      field.classList.add('form-control__textarea--invalid');
    }
    error.innerText = message;
    if (status) status.innerText = '';
    return false;
  }
  field.classList.remove('form-control__input--invalid', 'form-control__textarea--invalid');
  error.innerText = '';
  if (status) status.innerText = '✓';
  return true;
}

function initFormValidation() {
  if (!elements.form) return;
  const inputs = elements.form.querySelectorAll('input, textarea');
  inputs.forEach((field) => {
    field.addEventListener('input', () => validateField(field));
    field.addEventListener('blur', () => validateField(field));
  });

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    let valid = true;
    inputs.forEach((field) => {
      valid = validateField(field) && valid;
    });
    if (!valid) return;
    const button = elements.form.querySelector('button[type=submit]');
    button.disabled = true;
    button.innerText = '送信中...';
    setTimeout(() => {
      button.innerText = '送信完了';
      const status = document.querySelector('.form-status');
      if (status) {
        status.innerText = 'お問い合わせを受け付けました。ありがとうございます！';
        status.classList.add('open');
      }
      setTimeout(() => {
        button.disabled = false;
        button.innerText = '送信する';
        if (status) status.classList.remove('open');
      }, 2400);
      elements.form.reset();
      handleInputLabels();
      elements.form.querySelectorAll('.form-control__status').forEach((status) => { status.innerText = ''; });
    }, 1400);
  });
}

function activateCurrentPage() {
  const page = document.body.dataset.page;
  if (!page) return;
  document.querySelectorAll('.nav__link, .mobile-menu__link').forEach((link) => {
    const target = link.getAttribute('href');
    if (target && target.includes(page)) {
      link.classList.add('is-active');
    }
  });
}

function initScrollReveal() {
  // initial animate on load
  setTimeout(() => {
    document.querySelectorAll('.fade-in-onload').forEach((item) => item.classList.add('is-visible'));
  }, 150);
}

function init() {
  initTheme();
  activateCurrentPage();
  updateHeader();
  updateBackToTop();
  initParallax();
  revealOnScroll();
  initTabs();
  initPortfolioFilter();
  initProjectModals();
  initTimeline();
  initAccordion();
  handleInputLabels();
  initFormValidation();
  initScrollReveal();

  window.addEventListener('scroll', () => {
    updateHeader();
    updateBackToTop();
  });

  elements.themeSwitches?.forEach((button) => button.addEventListener('click', toggleTheme));
  elements.mobileToggle?.addEventListener('click', toggleMobileMenu);
  elements.mobileOverlay?.addEventListener('click', closeMobileMenu);
  elements.backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

window.addEventListener('DOMContentLoaded', init);