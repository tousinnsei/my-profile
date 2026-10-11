/* ============================================================
   my-profile — 首页数据驱动脚本
   ------------------------------------------------------------
   首页“最新动态”区块从 data/updates.json 渲染（仅已发布）。
   （注：首页“数字实绩”为策展数据，保留在 i18n 字典中，不自动覆盖。）
   ============================================================ */
(function () {
  'use strict';
  function curLang() {
    try { return (window.I18N && I18N.current && I18N.current()) || 'ja'; } catch (e) { return 'ja'; }
  }
  function lf(v, field) {
    if (!v || v[field] == null) return '';
    if (typeof v[field] === 'string') return v[field];
    return v[field][curLang()] || v[field].ja || '';
  }
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    // 说明：首页“数字实绩”为策展数据（真实证书/成果数），保留在 i18n 字典中，
    // 不据此处的项目数据自动覆盖，以免低估真实持有量（如软件著作权 26 项）。

    // 最新动态（来自 data/updates.json，仅展示已发布）
    var newsSec = document.getElementById('cms-news');
    var newsList = document.getElementById('cms-news-list');
    if (!newsSec || !newsList) return;
    fetch('data/updates.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { updates: [] }; })
      .then(function (d) {
        var ups = (d.updates || []).filter(function (u) { return u.status !== 'draft'; })
          .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        if (!ups.length) return;
        newsSec.hidden = false;
        newsList.innerHTML = ups.slice(0, 4).map(function (u) {
          var link = u.link
            ? ' href="' + u.link.replace(/"/g, '&quot;') + '" target="_blank" rel="noreferrer"'
            : ' href="contact.html"';
          return '<a class="news-row reveal" ' + link + '>' +
            '<span class="news-row__date">' + (u.date || '') + '</span>' +
            '<span class="news-row__title">' + (lf(u, 'title') || '') + '</span>' +
            '<span class="featured-row__arrow">→</span>' +
            '</a>';
        }).join('');
        document.getElementById('cms-news-more').hidden = ups.length <= 4;
      })
      .catch(function () { /* 无数据则保持隐藏 */ });
  });
})();
