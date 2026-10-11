/* ============================================================
   my-profile — 获奖/荣誉 数据驱动脚本
   从 data/awards.json 渲染已发布的获奖记录；
   无已发布记录时自动隐藏区块。
   用法：页面中放置 <section id="cms-awards" ... hidden>，
   并在 <script src="js/cms-awards.js"></script> 引入本脚本。
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
    var sec = document.getElementById('cms-awards');
    var list = document.getElementById('cms-awards-list');
    if (!sec || !list) return;
    fetch('data/awards.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { awards: [] }; })
      .then(function (d) {
        var aw = (d.awards || []).filter(function (a) { return a.status !== 'draft'; })
          .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        if (!aw.length) return;
        sec.hidden = false;
        list.innerHTML = aw.map(function (a) {
          var meta = [a.date, a.level].filter(Boolean).join(' · ');
          return '<div class="awards-item reveal">' +
            '<div class="awards-item__meta">' + (meta ? '<span class="awards-item__date">' + meta + '</span>' : '') + '</div>' +
            '<h3 class="awards-item__title">' + (lf(a, 'title') || '') + '</h3>' +
            (lf(a, 'org') ? '<div class="awards-item__org">' + lf(a, 'org') + '</div>' : '') +
            (lf(a, 'desc') ? '<p class="awards-item__desc">' + lf(a, 'desc') + '</p>' : '') +
            '</div>';
        }).join('');
      })
      .catch(function () {});
  });
})();
