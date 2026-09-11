/* ============================================================
   my-profile — Global Script
   Theme, Navigation, Custom Cursor, Motion, Counters, Modal
   ============================================================ */

(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const THEME_KEY = 'my-profile-theme';

  /* ========== Theme (apply before paint) ========== */
  (function initThemeEarly() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  })();

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  document.addEventListener('DOMContentLoaded', () => {
    safeInit('assignEnterDelays', assignEnterDelays);
    safeInit('initNav', initNav);
    safeInit('initThemeToggle', initThemeToggle);
    safeInit('initScrollState', initScrollState);
    safeInit('initReveal', initReveal);
    safeInit('initCounters', initCounters);
    safeInit('initBackToTop', initBackToTop);
    safeInit('initCustomCursor', initCustomCursor);
    safeInit('initModals', initModals);
    safeInit('initAccordion', initAccordion);
    safeInit('initTabs', initTabs);
    safeInit('initForm', initForm);
    safeInit('initResumeRadar', initResumeRadar);
    safeInit('initProjectHover', initProjectHover);
    safeInit('initResearchMap', initResearchMap);
    safeInit('initPageTransitions', initPageTransitions);
  });

  /* ========== Fault-tolerant init wrapper ========== */
  function safeInit(name, fn) {
    try {
      fn();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[my-profile] init skip: ' + name, err);
      }
    }
  }

  /* ========== Entrance delays (stagger) ========== */
  function assignEnterDelays() {
    $$('.hero-enter').forEach((el, i) => {
      el.style.animationDelay = `${0.12 + i * 0.1}s`;
    });
    $$('[data-stagger]').forEach((wrap) => {
      $$(':scope > *', wrap).forEach((child, i) => {
        child.style.transitionDelay = `${i * 80}ms`;
      });
    });
  }

  /* ========== Navigation + Mobile Menu ========== */
  function initNav() {
    const toggles = $$('.nav__toggle');
    const closeBtn = $('.mobile-menu__close');
    const menu = $('.mobile-menu');
    const overlay = $('.mobile-menu__overlay');

    if (!menu) return;

    const open = () => menu.classList.add('open');
    const close = () => {
      menu.classList.remove('open');
    };

    toggles.forEach((t) => t.addEventListener('click', open));
    overlay && overlay.addEventListener('click', close);
    closeBtn && closeBtn.addEventListener('click', close);
    docKey('Escape', () => menu.classList.contains('open') && close());
    $$('.mobile-menu__link', menu).forEach((l) => l.addEventListener('click', close));
  }

  /* ========== Theme toggle ========== */
  function initThemeToggle() {
    const toggles = $$('.theme-toggle');
    const apply = (dark) => {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      toggles.forEach((t) => (t.textContent = dark ? '☀' : '🌙'));
    };
    apply(document.documentElement.getAttribute('data-theme') === 'dark');
    toggles.forEach((t) =>
      t.addEventListener('click', () =>
        apply(document.documentElement.getAttribute('data-theme') !== 'dark')
      )
    );
  }

  /* ========== Header scroll state + back to top ========== */
  function initScrollState() {
    const header = $('.page-header');
    const onScroll = () => {
      const y = window.scrollY;
      if (header) header.classList.toggle('scrolled', y > 24);
      updateBackToTop(y);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const backToTopBtn = () => $('.back-to-top');
  function updateBackToTop(y) {
    const btn = backToTopBtn();
    if (btn) btn.classList.toggle('visible', y > 600);
  }

  function initBackToTop() {
    const btn = backToTopBtn();
    btn && btn.addEventListener('click', () =>
      window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' })
    );
  }

  /* ========== Scroll reveal ========== */
  function initReveal() {
    if (prefersReduced) {
      $$('.reveal, .text-reveal').forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const targets = $$('.reveal, .text-reveal');
    if (!targets.length || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    targets.forEach((el) => io.observe(el));
  }

  /* ========== Counters ========== */
  function initCounters() {
    const els = $$('[data-count]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => {
        el.dataset.base = el.dataset.base || el.textContent.replace(/[^\d]/g, '') || '0';
        el.dataset.done = '1';
      });
      return;
    }
    // Ensure real number is present in HTML (SEO) — animate from it
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animateCount(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    els.forEach((el) => {
      const original = el.textContent.replace(/[^\d]/g, '');
      if (!el.dataset.base) el.dataset.base = original || '0';
      io.observe(el);
    });
  }

  function animateCount(el) {
    if (prefersReduced || el.dataset.done) return;
    el.dataset.done = '1';
    const target = parseInt(el.dataset.count, 10);
    const elBase = parseInt(el.dataset.base || '0', 10);
    if (target === elBase || target === 0) {
      el.textContent = target;
      return;
    }
    const duration = 1300;
    const start = performance.now();
    const prefix = el.textContent.replace(/[\d]/g, '');
    const suffix = el.textContent.replace(/[\d]/g, '');
    // Keep suffix letters (e.g. "+") after number
    const trail = el.textContent.replace(/^[\d,]+/, '');
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target) + trail;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ========== Custom cursor ========== */
  function initCustomCursor() {
    if (prefersReduced || isCoarse) return;
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-dot--ring';
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;
    let visible = false;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = '1';
        ring.style.opacity = '0.6';
      }
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    });

    (function ringAnim() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(ringAnim);
    })();

    const hoverSel = 'a, button, [data-modal-open], .project-row, .featured-row, .nav__link';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverSel)) ring.classList.add('is-hover');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverSel)) ring.classList.remove('is-hover');
    });
    document.addEventListener('mouseleave', () => {
      visible = false;
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    });
  }

  /* ========== Modal system ========== */
  let focusReturnEl = null;
  function initModals() {
    const modals = $$('.modal[data-modal]');
    modals.forEach((modal) => {
      const close = () => closeModal(modal);
      const closeBtn = $('.modal__close', modal);
      const overlay = $('.modal__backdrop', modal);
      closeBtn && closeBtn.addEventListener('click', close);
      overlay && overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
      docKey('Escape', () => modal.classList.contains('open') && closeModal(modal));
    });

    // Buttons that open modals from data attribute
    $$('[data-modal-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-modal-open');
        const target = document.getElementById(id);
        if (target) {
          focusReturnEl = btn;
          openModal(target);
        }
      });
    });
  }

  function openModal(modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    const focusable = $('button, [href], [tabindex]', modal);
    focusable && focusable.focus();
    initCarousel(modal);
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    focusReturnEl && focusReturnEl.focus();
    focusReturnEl = null;
    clearCarousel(modal);
  }

  /* ========== Carousel within modal ========== */
  function initCarousel(modal) {
    const track = $('.carousel__track', modal);
    const dotsWrap = $('.carousel__dots', modal);
    if (!track) return;
    const slides = $$('.carousel__slide', track);
    if (!slides.length) return;
    let index = 0;

    const renderDots = () => {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      slides.forEach((_, i) => {
        const b = document.createElement('button');
        b.className = 'carousel__dot' + (i === index ? ' is-active' : '');
        b.setAttribute('aria-label', 'Slide ' + (i + 1));
        b.addEventListener('click', () => {
          index = i;
          update();
        });
        dotsWrap.appendChild(b);
      });
    };
    const update = () => {
      track.style.transform = `translateX(${-index * 100}%)`;
      d($$('.carousel__dot', modal), (d2, i) =>
        d2.classList.toggle('is-active', i === index)
      );
    };
    d($('.carousel__control--prev', modal), () => {
      index = (index - 1 + slides.length) % slides.length;
      update();
    });
    d($('.carousel__control--next', modal), () => {
      index = (index + 1) % slides.length;
      update();
    });
    renderDots();
    update();
  }

  function clearCarousel() {}

  function d(el, fn) {
    el && fn && fn(el);
  }

  function docKey(key, fn) {
    document.addEventListener('keydown', (e) => e.key === key && fn());
  }

  /* ========== Accordion (single-open) ========== */
  function initAccordion() {
    $$('.accordion').forEach((acc) => {
      $$('.accordion__item__head', acc).forEach((head) => {
        head.addEventListener('click', () => {
          const item = head.closest('.accordion__item');
          const isOpen = item.classList.contains('open');
          $$('.accordion__item', acc).forEach((o) => o.classList.remove('open'));
          if (!isOpen) item.classList.add('open');
        });
      });
    });
  }

  /* ========== Tabs ========== */
  function initTabs() {
    $$('.tabs').forEach((tabs) => {
      const container = tabs.closest('.tabs-wrap') || tabs.parentElement;
      const panels = $$('.tab-panel', container);
      $$('.tab', tabs).forEach((t) => {
        t.addEventListener('click', () => {
          const id = t.getAttribute('data-tab');
          $$('.tab', tabs).forEach((x) => x.classList.remove('is-active'));
          t.classList.add('is-active');
          panels.forEach((p) =>
            p.classList.toggle('is-active', p.id === id)
          );
        });
      });
    });
  }

  /* ========== Contact form ========== */
  function initForm() {
    const form = $('.contact-form');
    if (!form) return;

    const subject = $('[name="subject"]', form);
    const typeSelect = $('[name="type"]', form);
    if (typeSelect && subject) {
      typeSelect.addEventListener('change', () => {
        if (typeSelect.value) subject.value = typeSelect.value;
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;
      $$('input[required], textarea[required]', form).forEach((f) => {
        if (!validate(f)) valid = false;
      });
      if (!valid) return;
      // Build mailto as static fallback
      const data = new FormData(form);
      const name = data.get('name') || '';
      const email = data.get('email') || '';
      const subj = data.get('subject') || (window.I18N && I18N.t('contact.form.subjectDefault')) || 'お問い合わせ';
      const msg = data.get('message') || '';
      const mailto =
        'mailto:tousinnsei@gmail.com' +
        `?subject=${encodeURIComponent(subj)}` +
        `&body=${encodeURIComponent(`${msg}\n\n---\n${name} | ${email}`)}`;
      showFormStatus((window.I18N && I18N.t('contact.form.statusOpen')) || 'メールアプリを開いています…');
      window.location.href = mailto;
      form.reset();
      setTimeout(hideFormStatus, 4000);
    });

    $$('input, textarea', form).forEach((f) => {
      f.addEventListener('input', () => validate(f));
      f.addEventListener('blur', () => validate(f));
    });
  }

  function validate(f) {
    const box = f.closest('.form-control');
    const msg = $('.form-control__msg', box);
    let error = '';
    const val = f.value.trim();
    if (f.required && !val)
      error = (window.I18N && I18N.t('contact.val.required')) || '必須項目です。';
    else if (f.type === 'email' && val && !/^\S+@\S+\.\S+$/.test(val))
      error = (window.I18N && I18N.t('contact.val.email')) || '正しいメールアドレスを入力してください。';
    const ok = !error;
    box.classList.toggle('has-error', !ok);
    if (msg) msg.textContent = error;
    return ok;
  }

  const formStatusEl = () => $('.form-status');
  function showFormStatus(text) {
    const s = formStatusEl();
    if (s) {
      s.textContent = text;
      s.classList.add('open');
    }
  }
  function hideFormStatus() {
    const s = formStatusEl();
    if (s) s.classList.remove('open');
  }

  /* ========== Resume radar chart ========== */
  function initResumeRadar() {
    const poly = $('.radar-chart polygon[data-animate]');
    const labels = $('.radar-chart');
    if (!poly) return;
    const scores = poly.getAttribute('data-scores').split(',').map(Number);
    const cx = 150, cy = 150, maxR = 120;
    const pointFor = (score, progress) => {
      const pts = scores
        .map((s, i) => {
          const angle = (Math.PI * 2 * i) / scores.length - Math.PI / 2;
          const r = (s / 100) * maxR * progress;
          return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
        })
        .join(' ');
      poly.setAttribute('points', pts);
    };
    if (prefersReduced) {
      pointFor(scores, 1);
      return;
    }
    let progress = 0;
    const duration = 1200;
    const start = performance.now();
    (function frame(now) {
      progress = Math.min((now - start) / duration, 1);
      pointFor(scores, 1 - Math.pow(1 - progress, 3));
      if (progress < 1) requestAnimationFrame(frame);
    })(start);
  }

  /* ========== Portfolio project hover preview ========== */
  function initProjectHover() {
    const rows = $$('.project-row[data-image], .featured-row[data-image]');
    if (!rows.length) return;
    const preview = $('.project-preview');
    if (!preview) return;

    let active = null;
    rows.forEach((row) => {
      row.addEventListener('mouseenter', (e) => {
        if (isCoarse) return;
        const img = preview.querySelector('img');
        img.src = row.getAttribute('data-image');
        preview.classList.add('is-visible');
        active = row;
        positionPreview(e);
      });
      row.addEventListener('mousemove', positionPreview);
      row.addEventListener('mouseleave', () => {
        preview.classList.remove('is-visible');
        active = null;
      });
    });

    function positionPreview(e) {
      if (!active) return;
      preview.style.left = e.clientX + 'px';
      preview.style.top = e.clientY + 'px';
    }
  }

  /* ========== Interactive research map ========== */
  function initResearchMap() {
    const map = $('.research-map');
    if (!map) return;
    $$('.map-node', map).forEach((node) => {
      node.addEventListener('mouseenter', () => {
        $$('.map-node', map).forEach((n) => n.classList.remove('is-active'));
        node.classList.add('is-active');
      });
    });
  }

  /* ========== Page transitions ========== */
  function initPageTransitions() {
    if (prefersReduced) return;
    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    document.body.appendChild(overlay);

    $$('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http') || href.startsWith('tel:'))
        return;
      if (a.target === '_blank') return;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const dest = href;
        overlay.classList.add('active');
        setTimeout(() => {
          window.location.href = dest;
        }, 420);
      });
    });
  }
})();
