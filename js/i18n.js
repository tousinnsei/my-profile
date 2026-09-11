/* ============================================================
   my-profile — I18N Manager
   Language detection, translation apply, language switcher
   ============================================================ */
(function () {
  'use strict';

  const SUPPORTED = ['ja', 'zh', 'en', 'ko'];
  const HTML_LANG = { ja: 'ja', zh: 'zh-CN', en: 'en', ko: 'ko' };
  const NATIVE = { ja: '日本語', zh: '简体中文', en: 'English', ko: '한국어' };
  const STORE_KEY = 'preferredLanguage';

  const dicts = window.I18N_DICTS || {};
  let current = null;

  function normalize(input) {
    if (!input) return null;
    const s = String(input).toLowerCase();
    if (s.indexOf('zh') === 0) return 'zh';
    if (s.indexOf('ja') === 0) return 'ja';
    if (s.indexOf('ko') === 0) return 'ko';
    if (s.indexOf('en') === 0) return 'en';
    return null;
  }

  function getDefault() {
    if (window.__AILANG__) {
      const early = normalize(window.__AILANG__);
      if (early) return early;
    }
    const params = new URLSearchParams(window.location.search);
    const urlLang = normalize(params.get('lang'));
    if (urlLang) return urlLang;
    try {
      const stored = normalize(localStorage.getItem(STORE_KEY));
      if (stored) return stored;
    } catch (e) {}
    const nav = normalize((navigator.language || navigator.userLanguage || '').split('-')[0]);
    if (nav) return nav;
    return 'ja';
  }

  function resolve(path, n) {
    const dict = dicts[current];
    if (!dict) return null;
    let cur = dict;
    for (const part of String(path).split('.')) {
      if (cur == null) return null;
      cur = cur[part];
    }
    if (cur == null) return null;
    if (typeof cur === 'string' && n != null && /\{n\}/.test(cur)) {
      return cur.replace(/\{n\}/g, String(n));
    }
    return cur;
  }

  function pageKey() {
    const p = (document.body && document.body.getAttribute('data-page')) || '';
    if (p === '404') return 'notFound';
    return p || 'index';
  }

  function setMeta(name, content) {
    if (content == null) return;
    let el = document.head.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setMetaProp(prop, content) {
    if (content == null) return;
    let el = document.head.querySelector('meta[property="' + prop + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function apply() {
    if (!dicts[current]) current = 'ja';
    const docEl = document.documentElement;
    docEl.setAttribute('lang', HTML_LANG[current]);
    docEl.setAttribute('data-lang', current);

    const meta = (dicts[current].meta && dicts[current].meta[pageKey()]) || null;
    if (meta) {
      if (meta.title) document.title = meta.title;
      setMeta('description', meta.description);
      setMetaProp('og:title', meta.title);
      setMetaProp('og:description', meta.description);
    }

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = resolve(el.getAttribute('data-i18n'));
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const v = resolve(el.getAttribute('data-i18n-html'));
      if (v != null) el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const raw = (el.getAttribute('data-i18n-attr') || '').split(',');
      raw.forEach((seg) => {
        const parts = seg.split('|');
        const v = resolve(parts[0]);
        if (v != null) el.setAttribute(parts[1] || 'title', v);
      });
    });

    updateSwitchers();
  }

  const I18N = {
    current: function () { return current; },
    supported: SUPPORTED.slice(),
    nativeName: function (code) { return NATIVE[normalize(code)] || '日本語'; },
    set: function (lang) {
      const code = normalize(lang);
      if (!code || code === current) return;
      current = code;
      try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
      apply();
      document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: code } }));
    },
    setFromUrl: function (lang) {
      const code = normalize(lang);
      if (!code || code === current) return;
      current = code;
      apply();
    },
    t: resolve
  };

  /* ========== Language switcher ========== */
  function initSwitchers() {
    document.querySelectorAll('.lang-switch').forEach((box) => {
      const btn = box.querySelector('.lang-switch__btn');
      const isMobile = box.classList.contains('lang-switch--mobile');
      const isOpen = () => box.classList.contains('is-open');
      const close = () => {
        box.classList.remove('is-open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      };
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const opening = !isOpen();
          close();
          if (opening) {
            box.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
            const first = box.querySelector('.lang-switch__link');
            if (first) first.focus();
          }
        });
      }
      if (!isMobile) {
        document.addEventListener('click', (e) => {
          if (!box.contains(e.target)) close();
        });
      }
      box.querySelectorAll('.lang-switch__link').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          I18N.set(link.getAttribute('data-lang'));
          close();
          if (btn && !isMobile) btn.focus();
        });
      });
      box.addEventListener('keydown', (e) => {
        const links = box.querySelectorAll('.lang-switch__link');
        if (!links.length) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const idx = Array.prototype.indexOf.call(links, document.activeElement);
          const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
          const target = links[(next + links.length) % links.length];
          if (target) target.focus();
        }
      });
    });
  }

  function updateSwitchers() {
    document.querySelectorAll('.lang-switch__current').forEach((el) => {
      el.textContent = NATIVE[current] || '日本語';
    });
    document.querySelectorAll('.lang-switch__link').forEach((link) => {
      const on = link.getAttribute('data-lang') === current;
      link.classList.toggle('is-active', on);
      link.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  /* ========== Init ========== */
  try {
    current = getDefault();
    apply();
    document.documentElement.classList.remove('pre-i18n');
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[my-profile] i18n init error', err);
    }
    document.documentElement.classList.remove('pre-i18n');
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      initSwitchers();
      updateSwitchers();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[my-profile] switcher init error', err);
      }
    }
  });

  window.I18N = I18N;
})();