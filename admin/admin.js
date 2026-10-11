/* ============================================================
   my-profile — 内容管理后台逻辑
   ------------------------------------------------------------
   管理：成果(projects) / 动态(updates) / 获奖(awards) / 个人资料(profile)
   发布：POST /api/publish（本地 server.mjs 或 Vercel api/publish.js）
   ============================================================ */
(function () {
  'use strict';

  const LANGS = ['ja', 'zh', 'en', 'ko'];
  const LANG_NAME = { ja: '日本語', zh: '简体中文', en: 'English', ko: '한국어' };

  const CAT = {
    research: { label: '研究课题', color: 'research' },
    company: { label: '创业企业', color: 'company' },
    system: { label: '开发系统', color: 'system' },
    paper: { label: '学术论文', color: 'paper' },
  };

  // 成果多语言字段（label 为分类标签；title 必填）
  const PROJECT_FIELDS = [
    { key: 'label', label: '分类标签', kind: 'input' },
    { key: 'title', label: '标题', kind: 'input', required: true },
    { key: 'short', label: '简短介绍（卡片）', kind: 'input' },
    { key: 'overview', label: '概述', kind: 'textarea' },
    { key: 'content', label: '详细内容', kind: 'textarea', lg: true },
    { key: 'role', label: '角色 / 职责', kind: 'input' },
    { key: 'results', label: '成果 / 成效', kind: 'textarea' },
    { key: 'stack', label: '技术栈 / 标签', kind: 'input' },
  ];

  // ---------- 状态 ----------
  const state = {
    authed: false,
    projects: [],          // PROJECTS_DATA.items
    teasers: {},           // PROJECTS_DATA.teasers
    updates: [],
    awards: [],
    profile: {},
    images: [],
    currentView: 'projects',
    filter: { projects: 'all', updates: 'all', awards: 'all' },
    query: '',
    sort: 'year-desc',
    editing: null,         // 'new' 或 {type, id}
    dirty: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DRAFT_KEY = 'myprofile-cms-draft-v1';
  const AUTH_KEY = 'myprofile-cms-auth';

  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- 数据读取 ----------
  async function loadStaticData() {
    const out = {};
    for (const key of ['updates', 'awards', 'profile']) {
      try {
        const res = await fetch(`data/${key}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status);
        const j = await res.json();
        out[key] = key === 'updates' ? (j.updates || []) : key === 'awards' ? (j.awards || []) : j;
      } catch (e) {
        out[key] = key === 'profile' ? {} : [];
      }
    }
    try {
      const res = await fetch('data/images-manifest.json', { cache: 'no-store' });
      if (res.ok) { const j = await res.json(); out.images = j.images || []; }
    } catch (e) { out.images = []; }
    return out;
  }

  async function loadAll() {
    const d = await loadStaticData();
    state.projects = (window.PROJECTS_DATA && PROJECTS_DATA.items) || [];
    state.teasers = (window.PROJECTS_DATA && PROJECTS_DATA.teasers) || {};
    state.updates = d.updates || [];
    state.awards = d.awards || [];
    state.profile = d.profile || {};
    state.images = d.images || [];
    tryRestoreDraft();
  }

  // ---------- 登录 ----------
  async function login() {
    const pwd = $('#login-password').value;
    const errEl = $('#login-error');
    errEl.hidden = true;
    const submit = $('#login-submit');
    submit.disabled = true; submit.textContent = '验证中…';
    try {
      const res = await fetch('api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (res.ok) {
        try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (e) {}
        state.authed = true;
        // 等待数据加载完成后再进入主界面（避免竞态导致空列表）
        if (state.readyPromise) { await state.readyPromise; }
        enterMain();
      } else {
        errEl.textContent = '密码错误。';
        errEl.hidden = false;
      }
    } catch (e) {
      errEl.textContent = '无法连接后台服务。请通过本地服务或已部署的站点访问。';
      errEl.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = '登 录';
    }
  }

  function logout() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
    state.authed = false;
    $('#view-main').hidden = true;
    $('#view-login').hidden = false;
  }

  function enterMain() {
    $('#view-login').hidden = true;
    $('#view-main').hidden = false;
    renderCurrentView();
  }

  // ---------- 视图切换 ----------
  const VIEW_TITLE = {
    projects: '成果管理', updates: '动态 / 新闻', awards: '获奖 / 荣誉', profile: '个人资料',
  };

  function switchView(v) {
    state.currentView = v;
    $$('.side-link').forEach((b) => b.classList.toggle('is-active', b.dataset.view === v));
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === v));
    $('#view-title').textContent = VIEW_TITLE[v];
    renderCurrentView();
  }

  function renderCurrentView() {
    const v = state.currentView;
    if (v === 'projects') renderProjects();
    else if (v === 'updates') renderUpdates();
    else if (v === 'awards') renderAwards();
    else if (v === 'profile') renderProfile();
  }

  // ---------- 通用工具 ----------
  function curLangValue(item, field, lang) {
    const v = item[field];
    if (v == null) return '';
    if (typeof v === 'string') return v; // 兼容单语言
    return v[lang] || '';
  }

  function getTitle(item) {
    return curLangValue(item, 'title', 'zh') || curLangValue(item, 'title', 'ja') || item.id || '';
  }

  function getShort(item) {
    return curLangValue(item, 'short', 'zh') || curLangValue(item, 'short', 'ja') || '';
  }

  function statusOf(item) { return item.status === 'draft' ? 'draft' : 'published'; }

  // ---------- 成果列表 ----------
  function filteredProjects() {
    let list = state.projects.slice();
    const f = state.filter.projects;
    if (f !== 'all') list = list.filter((p) => p.cat === f);
    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [p.id, String(p.year || '')];
        LANGS.forEach((l) => {
          ['label', 'title', 'short', 'overview', 'content', 'role', 'results', 'stack'].forEach((fd) => {
            hay.push(curLangValue(p, fd, l));
          });
        });
        return hay.join(' ').toLowerCase().includes(q);
      });
    }
    const s = state.sort;
    list.sort((a, b) => {
      if (s === 'year-desc') return (b.year || 0) - (a.year || 0) || a.id.localeCompare(b.id);
      if (s === 'year-asc') return (a.year || 0) - (b.year || 0) || a.id.localeCompare(b.id);
      return a.id.localeCompare(b.id);
    });
    return list;
  }

  function renderProjects() {
    const list = filteredProjects();
    const wrap = $('#projects-list');
    $('#projects-count').textContent = `共 ${list.length} 项（全部 ${state.projects.length} 项）`;
    $('#projects-empty').hidden = list.length > 0;
    wrap.innerHTML = list.map((p) => {
      const st = statusOf(p);
      const cat = CAT[p.cat] || { label: p.cat, color: 'research' };
      const img = p.image || '';
      return `
      <div class="list-row${st === 'draft' ? ' list-row--draft' : ''}" data-id="${esc(p.id)}">
        ${img
          ? `<img class="list-row__thumb" src="${esc(img)}" alt="" onerror="this.classList.add('list-row__thumb--none');this.outerHTML='<div class=&quot;list-row__thumb list-row__thumb--none&quot;>◻</div>'"/>`
          : '<div class="list-row__thumb list-row__thumb--none">◻</div>'}
        <div class="list-row__main">
          <div class="list-row__title">
            <span class="badge badge--cat-${cat.color}">${esc(cat.label)}</span>
            ${p.featured ? '<span class="badge badge--featured">精选</span>' : ''}
            <span class="badge badge--status-${st}">${st === 'draft' ? '草稿' : '已发布'}</span>
            ${esc(getTitle(p))}
          </div>
          <div class="list-row__sub">${esc(getShort(p))}</div>
        </div>
        <div class="list-row__year">${p.year ? p.year : '—'}</div>
        <div class="list-row__actions">
          <button class="btn btn--text" data-act="preview">预览</button>
          <button class="btn btn--text" data-act="edit">编辑</button>
          <button class="btn btn--text" data-act="dup">复制</button>
          <button class="btn btn--text" data-act="del">删除</button>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.list-row');
        const id = row.dataset.id;
        const act = btn.dataset.act;
        if (act === 'edit') openProjectEditor(id);
        else if (act === 'preview') openPreview('projects', id);
        else if (act === 'del') deleteProject(id);
        else if (act === 'dup') duplicateProject(id);
      });
    });
  }

  // ---------- 成果增删改 ----------
  function openProjectEditor(idOrNew) {
    let item;
    if (idOrNew === 'new') {
      const cat = state.filter.projects !== 'all' ? state.filter.projects : 'research';
      item = { id: nextId(cat), cat, status: 'draft', year: new Date().getFullYear(), featured: false,
        image: '', images: [], label: {}, title: {}, short: {}, overview: {}, content: {}, role: {}, results: {}, stack: {} };
    } else {
      const found = state.projects.find((p) => p.id === idOrNew);
      if (!found) { toast('未找到该成果', 'err'); return; }
      item = JSON.parse(JSON.stringify(found)); // 深拷贝
    }
    openDrawer({
      type: 'projects',
      title: item.cat === 'paper' ? '编辑学术论文' : '编辑成果',
      item,
      body: projectFormHtml(item),
      onSave: () => collectProject(item),
    });
  }

  function nextId(cat) {
    const prefix = { research: 'r', company: 'c', system: 's', paper: 'p' }[cat] || 'x';
    let n = 1;
    const ids = state.projects.map((p) => p.id);
    while (ids.includes(prefix + n)) n++;
    return prefix + n;
  }

  function projectFormHtml(item) {
    const cat = item.cat || 'research';
    const isPaper = cat === 'paper';
    const idInput = item.cat ? '' : '';
    return `
      <div class="form-section">
        <h4>基本信息</h4>
        <div class="form-grid">
          <div class="field"><span>编号 <span class="required">*</span></span>
            <input type="text" data-k="id" value="${esc(item.id || '')}" placeholder="如 r7 / p16" /></div>
          <div class="field"><span>分类 <span class="required">*</span></span>
            <select data-k="cat">
              ${Object.keys(CAT).map((k) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${CAT[k].label}</option>`).join('')}
            </select></div>
          <div class="field"><span>年份</span><input type="number" data-k="year" value="${item.year || ''}" placeholder="如 2026" /></div>
          <div class="field"><span>完成 / 发表日期</span><input type="date" data-k="date" value="${item.date || ''}" /></div>
        </div>
        <div class="checkline"><input type="checkbox" data-k="featured" ${item.featured ? 'checked' : ''} /> 首页精选展示</div>
        <div class="checkline"><label style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" data-k="status_draft" ${item.status === 'draft' ? 'checked' : ''} /> 存为草稿（发布后也不会公开展示）
        </label></div>
        ${isPaper ? `
        <div class="field full"><span>论文链接（paperUrl，可选）</span>
          <input type="url" data-k="paperUrl" value="${esc(item.paperUrl || '')}" placeholder="https://…" /></div>` : ''}
      </div>

      <div class="form-section">
        <h4>封面与图片</h4>
        <div class="image-picker">
          <div class="image-picker__preview${item.image ? '' : ' image-picker__preview--none'}" id="pp-main">
            ${item.image ? `<img src="${esc(item.image)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>` : '无封面'}
          </div>
          <div class="image-picker__controls">
            <input type="text" data-k="image" value="${esc(item.image || '')}" placeholder="images/xxx.png 或选择下方图片" />
            <button type="button" class="btn btn--ghost" data-browse="pp-main" data-target="image">选择现有图片</button>
            <div class="image-browse" data-browse-list="pp-main"></div>
          </div>
        </div>
        <div style="margin-top:10px">
          <span class="field__hint" style="font-size:12px;color:#9aa1ad">附加图片（多图，逗号分隔路径）：</span>
          <input type="text" data-k="images_csv" value="${esc((item.images || []).join(', '))}" placeholder="images/a-1.png, images/a-2.png" />
        </div>
      </div>

      <div class="form-section">
        <h4>多语言内容（四语）</h4>
        ${langTabsHtml()}
        ${LANGS.map((l) => `
          <div class="lang-panel" data-lang="${l}">
            ${PROJECT_FIELDS.map((f) => `
              <div class="field"><span>${f.label}${f.required ? ' <span class="required">*</span>' : ''} <span class="field__hint">[${LANG_NAME[l]}]</span></span>
              ${f.kind === 'textarea'
                ? `<textarea data-langfield="${f.key}" data-lang="${l}"${f.lg ? ' class="lg"' : ''}>${esc(curLangValue(item, f.key, l))}</textarea>`
                : `<input type="text" data-langfield="${f.key}" data-lang="${l}" value="${esc(curLangValue(item, f.key, l))}" />`}
            </div>`).join('')}
          </div>`).join('')}
      </div>`;
  }

  function langTabsHtml() {
    return `<div class="lang-tabs">${LANGS.map((l, i) =>
      `<button type="button" class="lang-tab${i === 0 ? ' is-active' : ''}" data-langtab="${l}">${LANG_NAME[l]}</button>`).join('')}</div>`;
  }

  function collectProject(item) {
    const body = $('#drawer-body');
    // 基础字段
    const g = (k) => { const el = body.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
    const gBool = (k) => { const el = body.querySelector(`[data-k="${k}"]`); return el ? el.checked : false; };
    const newId = g('id') || item.id;
    // 校验必填
    if (!newId) { toast('编号不能为空', 'err'); return null; }
    const dup = state.projects.find((p) => p.id === newId && newId !== (item.id || '__new__'));
    if (dup) { toast(`编号 ${newId} 已存在，请更换`, 'err'); return null; }
    const titleJa = body.querySelector('[data-langfield="title"][data-lang="ja"]');
    if (!titleJa || !titleJa.value.trim()) { toast('请至少填写日文标题（title[ja]）', 'err'); return null; }

    item.id = newId;
    item.cat = g('cat') || item.cat;
    const yr = g('year'); item.year = yr ? Number(yr) : 0;
    const dt = g('date'); item.date = dt || undefined;
    item.featured = gBool('featured');
    item.status = gBool('status_draft') ? 'draft' : 'published';
    item.paperUrl = g('paperUrl') || undefined;
    item.image = g('image');
    const csv = g('images_csv');
    item.images = csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : [];
    // 多语言字段
    PROJECT_FIELDS.forEach((f) => {
      const obj = {};
      LANGS.forEach((l) => {
        const el = body.querySelector(`[data-langfield="${f.key}"][data-lang="${l}"]`);
        obj[l] = el ? el.value.trim() : '';
      });
      item[f.key] = obj;
    });
    return item;
  }

  function saveProject(item, isNew) {
    if (isNew) {
      state.projects.push(item);
    } else {
      const idx = state.projects.findIndex((p) => p.id === item.id);
      if (idx >= 0) state.projects[idx] = item;
      else state.projects.push(item);
    }
    state.dirty = true;
    toast('已保存到编辑区', 'ok');
    closeDrawer();
    renderProjects();
  }

  function deleteProject(id) {
    const item = state.projects.find((p) => p.id === id);
    if (!item) return;
    if (!confirm(`确定删除「${getTitle(item)}」吗？此操作不会立刻发布；发布时删除会从公开网站移除。`)) return;
    state.projects = state.projects.filter((p) => p.id !== id);
    state.dirty = true;
    toast('已删除（保存草稿或发布后生效）', 'ok');
    renderProjects();
  }

  function duplicateProject(id) {
    const src = state.projects.find((p) => p.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = nextId(copy.cat || 'research');
    copy.status = 'draft';
    state.projects.push(copy);
    state.dirty = true;
    toast('已复制为新草稿', 'ok');
    renderProjects();
    openProjectEditor(copy.id);
  }

  // ---------- 动态 ----------
  function renderUpdates() {
    const f = state.filter.updates;
    let list = state.updates.slice();
    if (f !== 'all') list = list.filter((u) => (f === 'draft' ? statusOf(u) === 'draft' : statusOf(u) !== 'draft'));
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const wrap = $('#updates-list');
    $('#updates-empty').hidden = list.length > 0;
    wrap.innerHTML = list.map((u) => {
      const st = statusOf(u);
      return `
      <div class="list-row${st === 'draft' ? ' list-row--draft' : ''}" data-id="${esc(u.id)}">
        <div class="list-row__main">
          <div class="list-row__title">
            <span class="badge badge--status-${st}">${st === 'draft' ? '草稿' : '已发布'}</span>
            ${esc(getTitle(u))}
          </div>
          <div class="list-row__sub">${u.date || ''} · ${esc(curLangValue(u, 'body', 'zh') || curLangValue(u, 'body', 'ja') || '')}</div>
        </div>
        <div class="list-row__actions">
          <button class="btn btn--text" data-act="edit">编辑</button>
          <button class="btn btn--text" data-act="del">删除</button>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.list-row').dataset.id;
        if (btn.dataset.act === 'edit') openUpdateEditor(id);
        else { if (confirm('确定删除该动态吗？')) { state.updates = state.updates.filter((u) => u.id !== id); state.dirty = true; toast('已删除', 'ok'); renderUpdates(); } }
      });
    });
  }

  function openUpdateEditor(idOrNew) {
    let item;
    if (idOrNew === 'new') {
      item = { id: 'u' + (state.updates.length + 1), status: 'draft', date: new Date().toISOString().slice(0, 10),
        title: {}, body: {}, link: '', image: '' };
    } else {
      const found = state.updates.find((u) => u.id === idOrNew);
      if (!found) { toast('未找到', 'err'); return; }
      item = JSON.parse(JSON.stringify(found));
    }
    openDrawer({
      type: 'updates', title: '编辑动态 / 新闻', item,
      body: updateFormHtml(item),
      onSave: () => collectUpdate(item),
    });
  }

  function updateFormHtml(item) {
    return `
      <div class="form-section">
        <h4>基本信息</h4>
        <div class="form-grid">
          <div class="field"><span>编号</span><input type="text" data-k="id" value="${esc(item.id || '')}" /></div>
          <div class="field"><span>日期</span><input type="date" data-k="date" value="${item.date || ''}" /></div>
        </div>
        <div class="checkline"><label style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" data-k="status_draft" ${item.status === 'draft' ? 'checked' : ''} /> 存为草稿（不会公开展示）
        </label></div>
        <div class="field"><span>外部链接（可选）</span><input type="url" data-k="link" value="${esc(item.link || '')}" /></div>
        <div class="field"><span>封面图片（可选）</span><input type="text" data-k="image" value="${esc(item.image || '')}" placeholder="images/xxx.png" /></div>
      </div>
      <div class="form-section">
        <h4>多语言内容</h4>
        ${langTabsHtml()}
        ${LANGS.map((l) => `
          <div class="lang-panel" data-lang="${l}">
            <div class="field"><span>标题 <span class="required">*</span> [${LANG_NAME[l]}]</span>
              <input type="text" data-langfield="title" data-lang="${l}" value="${esc(curLangValue(item, 'title', l))}" /></div>
            <div class="field"><span>正文 [${LANG_NAME[l]}]</span>
              <textarea data-langfield="body" data-lang="${l}" class="lg">${esc(curLangValue(item, 'body', l))}</textarea></div>
          </div>`).join('')}
      </div>`;
  }

  function collectUpdate(item) {
    const body = $('#drawer-body');
    item.id = (body.querySelector('[data-k="id"]').value.trim()) || 'u' + Date.now();
    item.date = body.querySelector('[data-k="date"]').value || '';
    item.status = body.querySelector('[data-k="status_draft"]').checked ? 'draft' : 'published';
    item.link = body.querySelector('[data-k="link"]').value.trim() || undefined;
    item.image = body.querySelector('[data-k="image"]').value.trim() || undefined;
    LANGS.forEach((l) => {
      const t = body.querySelector(`[data-langfield="title"][data-lang="${l}"]`);
      const b = body.querySelector(`[data-langfield="body"][data-lang="${l}"]`);
      item.title[l] = t ? t.value.trim() : '';
      item.body[l] = b ? b.value.trim() : '';
    });
    if (!item.title.ja && !item.title.zh) { toast('请至少填写标题', 'err'); return null; }
    return item;
  }

  function saveUpdate(item, isNew) {
    if (isNew) state.updates.push(item);
    else { const i = state.updates.findIndex((u) => u.id === item.id); if (i >= 0) state.updates[i] = item; else state.updates.push(item); }
    state.dirty = true;
    toast('已保存到编辑区', 'ok');
    closeDrawer();
    renderUpdates();
  }

  // ---------- 获奖 ----------
  function renderAwards() {
    const f = state.filter.awards;
    let list = state.awards.slice();
    if (f !== 'all') list = list.filter((a) => (f === 'draft' ? statusOf(a) === 'draft' : statusOf(a) !== 'draft'));
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const wrap = $('#awards-list');
    $('#awards-empty').hidden = list.length > 0;
    wrap.innerHTML = list.map((a) => {
      const st = statusOf(a);
      return `
      <div class="list-row${st === 'draft' ? ' list-row--draft' : ''}" data-id="${esc(a.id)}">
        <div class="list-row__main">
          <div class="list-row__title">
            <span class="badge badge--status-${st}">${st === 'draft' ? '草稿' : '已发布'}</span>
            ${esc(getTitle(a))}
          </div>
          <div class="list-row__sub">${a.date || ''} · ${esc(curLangValue(a, 'org', 'zh') || curLangValue(a, 'org', 'ja') || '')}</div>
        </div>
        <div class="list-row__actions">
          <button class="btn btn--text" data-act="edit">编辑</button>
          <button class="btn btn--text" data-act="del">删除</button>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.list-row').dataset.id;
        if (btn.dataset.act === 'edit') openAwardEditor(id);
        else { if (confirm('确定删除该获奖记录吗？')) { state.awards = state.awards.filter((a) => a.id !== id); state.dirty = true; toast('已删除', 'ok'); renderAwards(); } }
      });
    });
  }

  function openAwardEditor(idOrNew) {
    let item;
    if (idOrNew === 'new') {
      item = { id: 'a' + (state.awards.length + 1), status: 'draft', date: '', level: '',
        title: {}, org: {}, desc: {}, image: '' };
    } else {
      const found = state.awards.find((a) => a.id === idOrNew);
      if (!found) { toast('未找到', 'err'); return; }
      item = JSON.parse(JSON.stringify(found));
    }
    openDrawer({
      type: 'awards', title: '编辑获奖 / 荣誉', item,
      body: awardFormHtml(item),
      onSave: () => collectAward(item),
    });
  }

  function awardFormHtml(item) {
    return `
      <div class="form-section">
        <h4>基本信息</h4>
        <div class="form-grid">
          <div class="field"><span>编号</span><input type="text" data-k="id" value="${esc(item.id || '')}" /></div>
          <div class="field"><span>日期</span><input type="date" data-k="date" value="${item.date || ''}" /></div>
          <div class="field"><span>级别</span><input type="text" data-k="level" value="${esc(item.level || '')}" placeholder="如 国家级 / 省级" /></div>
          <div class="field"><span>封面图片（可选）</span><input type="text" data-k="image" value="${esc(item.image || '')}" /></div>
        </div>
        <div class="checkline"><label style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" data-k="status_draft" ${item.status === 'draft' ? 'checked' : ''} /> 存为草稿（不会公开展示）
        </label></div>
      </div>
      <div class="form-section">
        <h4>多语言内容</h4>
        ${langTabsHtml()}
        ${LANGS.map((l) => `
          <div class="lang-panel" data-lang="${l}">
            <div class="field"><span>奖项名称 <span class="required">*</span> [${LANG_NAME[l]}]</span>
              <input type="text" data-langfield="title" data-lang="${l}" value="${esc(curLangValue(item, 'title', l))}" /></div>
            <div class="field"><span>颁发机构 [${LANG_NAME[l]}]</span>
              <input type="text" data-langfield="org" data-lang="${l}" value="${esc(curLangValue(item, 'org', l))}" /></div>
            <div class="field"><span>说明 [${LANG_NAME[l]}]</span>
              <textarea data-langfield="desc" data-lang="${l}">${esc(curLangValue(item, 'desc', l))}</textarea></div>
          </div>`).join('')}
      </div>`;
  }

  function collectAward(item) {
    const body = $('#drawer-body');
    item.id = body.querySelector('[data-k="id"]').value.trim() || 'a' + Date.now();
    item.date = body.querySelector('[data-k="date"]').value || '';
    item.level = body.querySelector('[data-k="level"]').value.trim() || undefined;
    item.image = body.querySelector('[data-k="image"]').value.trim() || undefined;
    item.status = body.querySelector('[data-k="status_draft"]').checked ? 'draft' : 'published';
    LANGS.forEach((l) => {
      item.title[l] = body.querySelector(`[data-langfield="title"][data-lang="${l}"]`).value.trim();
      item.org[l] = body.querySelector(`[data-langfield="org"][data-lang="${l}"]`).value.trim();
      item.desc[l] = body.querySelector(`[data-langfield="desc"][data-lang="${l}"]`).value.trim();
    });
    if (!item.title.ja && !item.title.zh) { toast('请至少填写奖项名称', 'err'); return null; }
    return item;
  }

  function saveAward(item, isNew) {
    if (isNew) state.awards.push(item);
    else { const i = state.awards.findIndex((a) => a.id === item.id); if (i >= 0) state.awards[i] = item; else state.awards.push(item); }
    state.dirty = true;
    toast('已保存到编辑区', 'ok');
    closeDrawer();
    renderAwards();
  }

  // ---------- 个人资料 ----------
  function renderProfile() {
    const p = state.profile.profile || state.profile;
    const wrap = $('#profile-form');
    const fields = [
      ['name', '姓名'], ['nameRoman', '罗马音 / 英文名'], ['jobTitle', '头衔'], ['location', '所在地'],
      ['phone', '电话'], ['email', '邮箱'], ['website', '网站'], ['summary', '简介（多行）', 'textarea'],
    ];
    wrap.innerHTML = `
      <div class="form-section"><h4>公开个人资料</h4>
        <div class="form-grid">
          ${fields.map(([k, label, kind]) => `
            <div class="field${kind === 'textarea' ? ' full' : ''}"><span>${label}</span>
              ${kind === 'textarea'
                ? `<textarea data-k="${k}" class="lg">${esc(p[k] || '')}</textarea>`
                : `<input type="text" data-k="${k}" value="${esc(p[k] || '')}" />`}
            </div>`).join('')}
          <div class="field full"><span>关键词（逗号分隔）</span>
            <input type="text" data-k="keywords_csv" value="${esc((p.keywords || []).join(', '))}" /></div>
        </div>
        <p class="form-note">修改会随“发布”一并写入 data/profile.json 并部署到网站。</p>
        <button class="btn btn--primary" id="profile-save">保存资料</button>
      </div>`;
    $('#profile-save').addEventListener('click', () => {
      const target = state.profile.profile || state.profile;
      fields.forEach(([k]) => { target[k] = wrap.querySelector(`[data-k="${k}"]`).value.trim(); });
      target.keywords = wrap.querySelector('[data-k="keywords_csv"]').value.split(',').map((s) => s.trim()).filter(Boolean);
      state.dirty = true;
      toast('已保存到编辑区', 'ok');
    });
  }

  // ---------- 抽屉 ----------
  let drawerOnSave = null;
  let drawerIsNew = false;

  function openDrawer(opts) {
    drawerOnSave = opts.onSave;
    $('#drawer-title').textContent = opts.title;
    $('#drawer-body').innerHTML = opts.body;
    const drawer = $('#drawer');
    drawer.hidden = false;
    drawerIsNew = opts.item && opts.item.__isNew__ !== undefined ? opts.item.__isNew__ : opts.isNew === true;
    // 图片选择
    initImageBrowsers();
    // 语言标签
    initLangTabs();
    // 分类切换：重新生成表单（保持已填值用简单方式——保存为草稿后重开）
    const catSel = drawer.querySelector('[data-k="cat"]');
    if (catSel) {
      catSel.addEventListener('change', () => {
        // 收集当前到临时对象再重建（简化为提示：切换分类后请重新填写，或直接继续）
        // 保留当前表单内容：通过重建处理分类专属字段（paperUrl）
        const pv = collectProjectRaw();
        const tmp = Object.assign({}, pv || opts.item);
        $('#drawer-body').innerHTML = projectFormHtml(tmp);
        initImageBrowsers(); initLangTabs();
      });
    }
  }

  function collectProjectRaw() {
    // 尽力读取当前表单值（供分类切换重建）
    const body = $('#drawer-body');
    if (!body.querySelector('[data-k="id"]')) return null;
    const g = (k) => { const el = body.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
    const gBool = (k) => { const el = body.querySelector(`[data-k="${k}"]`); return el ? el.checked : false; };
    const item = {};
    item.id = g('id'); item.cat = g('cat'); item.year = g('year') ? Number(g('year')) : 0;
    item.date = g('date'); item.featured = gBool('featured');
    item.status = gBool('status_draft') ? 'draft' : 'published';
    item.paperUrl = g('paperUrl'); item.image = g('image');
    item.images = g('images_csv').split(',').map((s) => s.trim()).filter(Boolean);
    PROJECT_FIELDS.forEach((f) => {
      const obj = {};
      LANGS.forEach((l) => {
        const el = body.querySelector(`[data-langfield="${f.key}"][data-lang="${l}"]`);
        obj[l] = el ? el.value.trim() : '';
      });
      item[f.key] = obj;
    });
    return item;
  }

  function initImageBrowsers() {
    const body = $('#drawer-body');
    body.querySelectorAll('[data-browse]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const list = body.querySelector(`[data-browse-list="${btn.dataset.browse}"]`);
        if (!list) return;
        if (list.classList.contains('open')) { list.classList.remove('open'); return; }
        list.classList.add('open');
        const targetKey = btn.dataset.target;
        const input = body.querySelector(`[data-k="${targetKey}"]`);
        if (!list.dataset.built) {
          list.innerHTML = state.images.length
            ? state.images.map((src) => `<img src="${esc(src)}" data-src="${esc(src)}" alt="" loading="lazy"/>`).join('')
            : '<span style="grid-column:1/-1;color:#9aa1ad;font-size:12px;padding:6px">暂无图片清单</span>';
          list.dataset.built = '1';
          list.querySelectorAll('img').forEach((img) => {
            img.addEventListener('click', () => {
              if (input) input.value = img.dataset.src;
              if (targetKey === 'image') {
                const pv = body.querySelector('#pp-main');
                pv.innerHTML = `<img src="${esc(img.dataset.src)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`;
                pv.classList.remove('image-picker__preview--none');
              }
              list.classList.remove('open');
            });
          });
        }
      });
    });
    // 主图输入实时预览
    const mainInput = body.querySelector('[data-k="image"]');
    const pp = body.querySelector('#pp-main');
    if (mainInput && pp) {
      mainInput.addEventListener('input', () => {
        const v = mainInput.value.trim();
        if (v) { pp.innerHTML = `<img src="${esc(v)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`; pp.classList.remove('image-picker__preview--none'); }
        else { pp.innerHTML = '无封面'; pp.classList.add('image-picker__preview--none'); }
      });
    }
  }

  function initLangTabs() {
    const body = $('#drawer-body');
    body.querySelectorAll('[data-langtab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        body.querySelectorAll('[data-langtab]').forEach((t) => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        const lang = tab.dataset.langtab;
        body.querySelectorAll('.lang-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.lang === lang));
      });
    });
  }

  function closeDrawer() { $('#drawer').hidden = true; drawerOnSave = null; }

  // ---------- 草稿 ----------
  function snapshotAll() {
    return { projects: state.projects, updates: state.updates, awards: state.awards,
      profile: state.profile, savedAt: new Date().toISOString() };
  }
  function saveDraftLocal() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshotAll())); toast('草稿已保存在本机', 'ok'); } catch (e) { toast('草稿保存失败：' + e.message, 'err'); }
  }
  function tryRestoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.projects)) return;
      if (!confirm('检测到本机保存的草稿，是否恢复？（选择“取消”则丢弃草稿）')) return;
      state.projects = d.projects;
      state.updates = d.updates || [];
      state.awards = d.awards || [];
      state.profile = d.profile || state.profile;
      state.dirty = true;
      toast('已恢复草稿', 'ok');
    } catch (e) {}
  }

  // ---------- 预览 ----------
  function openPreview(type, id) {
    const modal = $('#modal-preview');
    $('#preview-lang').value = 'zh';
    $('#modal-preview').hidden = false;
    renderPreview(type, id, 'zh');
  }

  function renderPreview(type, id, lang) {
    const body = $('#preview-body');
    if (type === 'projects') {
      const items = id ? state.projects.filter((p) => p.id === id) : state.projects.slice(0, 8);
      body.innerHTML = `<div class="pv-grid">${items.map((p) => {
        const cat = CAT[p.cat] || { label: p.cat };
        return `
        <div class="pv-card">
          <img src="${esc(p.image || '')}" alt="" onerror="this.style.display='none'"/>
          <div class="pv-card__body">
            <div class="pv-card__cat">${esc(curLangValue(p, 'label', lang) || cat.label)}</div>
            <div class="pv-card__title">${esc(curLangValue(p, 'title', lang))}</div>
            <div class="pv-card__text">${esc(curLangValue(p, 'short', lang))}</div>
          </div>
        </div>`;
      }).join('')}</div>`;
    } else if (type === 'updates') {
      const items = state.updates.filter((u) => statusOf(u) !== 'draft').slice(0, 10);
      body.innerHTML = items.length ? items.map((u) => `
        <div class="pv-update">
          <div class="pv-date">${esc(u.date || '')}</div>
          <h4>${esc(curLangValue(u, 'title', lang))}</h4>
          <p>${esc(curLangValue(u, 'body', lang))}</p>
        </div>`).join('') : '<div class="empty">暂无已发布动态</div>';
    } else if (type === 'awards') {
      const items = state.awards.filter((a) => statusOf(a) !== 'draft').slice(0, 10);
      body.innerHTML = items.length ? items.map((a) => `
        <div class="pv-update">
          <div class="pv-date">${esc(a.date || '')}${a.level ? ' · ' + esc(a.level) : ''}</div>
          <h4>${esc(curLangValue(a, 'title', lang))}</h4>
          <p>${esc(curLangValue(a, 'org', lang))}${curLangValue(a, 'desc', lang) ? ' — ' + esc(curLangValue(a, 'desc', lang)) : ''}</p>
        </div>`).join('') : '<div class="empty">暂无已发布获奖</div>';
    }
  }

  // ---------- 发布 ----------
  function buildPublishPayload(password, message) {
    return {
      password,
      commitMessage: message,
      data: {
        projects: { items: state.projects, teasers: state.teasers },
        updates: { updates: state.updates },
        awards: { awards: state.awards },
        profile: state.profile,
      },
    };
  }

  function openPublishModal() {
    $('#publish-password').value = '';
    $('#publish-message').value = '';
    $('#publish-error').hidden = true;
    $('#publish-ok').hidden = true;
    $('#modal-publish').hidden = false;
    setTimeout(() => $('#publish-password').focus(), 50);
  }

  async function doPublish() {
    const pwd = $('#publish-password').value;
    const msg = $('#publish-message').value.trim();
    const errEl = $('#publish-error');
    const okEl = $('#publish-ok');
    errEl.hidden = true; okEl.hidden = true;
    const btn = $('#publish-confirm');
    btn.disabled = true; btn.textContent = '发布中…';
    try {
      const res = await fetch('api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPublishPayload(pwd, msg)),
      });
      const j = await res.json();
      if (j.ok) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        state.dirty = false;
        okEl.textContent = `发布成功！已提交 ${j.commit ? j.commit.slice(0, 7) : ''}，部署中，通常 1~2 分钟后生效。已写入：${(j.files || []).join(', ')}`;
        okEl.hidden = false;
        toast('发布成功，Vercel 正在部署', 'ok');
        $('#publish-close').click();
      } else {
        errEl.textContent = '发布失败：' + (j.error || '未知错误');
        errEl.hidden = false;
        toast('发布失败', 'err');
      }
    } catch (e) {
      errEl.textContent = '无法连接发布服务：' + e.message;
      errEl.hidden = false;
      toast('发布失败', 'err');
    } finally {
      btn.disabled = false; btn.textContent = '确认发布';
    }
  }

  // ---------- 导出 / 导入 ----------
  function exportBackup() {
    const payload = { exportedAt: new Date().toISOString(), ...snapshotAll() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-profile-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('已导出备份文件', 'ok');
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d || !Array.isArray(d.projects)) { toast('备份文件格式无效', 'err'); return; }
        if (!confirm('导入将覆盖当前编辑区内容（尚未发布），是否继续？')) return;
        state.projects = d.projects;
        state.updates = d.updates || [];
        state.awards = d.awards || [];
        state.profile = d.profile || {};
        state.dirty = true;
        toast('已导入备份', 'ok');
        renderCurrentView();
      } catch (e) { toast('备份文件解析失败', 'err'); }
    };
    reader.readAsText(file);
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $('#login-form').addEventListener('submit', (e) => { e.preventDefault(); login(); });
    $('#logout-btn').addEventListener('click', logout);

    $$('.side-link').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

    // 成果筛选/搜索/排序
    $('#projects-filter').addEventListener('click', (e) => {
      const b = e.target.closest('.filter-tab'); if (!b) return;
      $$('#projects-filter .filter-tab').forEach((t) => t.classList.remove('is-active'));
      b.classList.add('is-active');
      state.filter.projects = b.dataset.filter; renderProjects();
    });
    $('#projects-search').addEventListener('input', (e) => { state.query = e.target.value; renderProjects(); });
    $('#projects-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderProjects(); });
    $('#projects-add').addEventListener('click', () => openProjectEditor('new'));

    // 动态/获奖筛选与新增
    $('#updates-filter').addEventListener('click', (e) => {
      const b = e.target.closest('.filter-tab'); if (!b) return;
      $$('#updates-filter .filter-tab').forEach((t) => t.classList.remove('is-active')); b.classList.add('is-active');
      state.filter.updates = b.dataset.filter; renderUpdates();
    });
    $('#updates-add').addEventListener('click', () => openUpdateEditor('new'));
    $('#awards-filter').addEventListener('click', (e) => {
      const b = e.target.closest('.filter-tab'); if (!b) return;
      $$('#awards-filter .filter-tab').forEach((t) => t.classList.remove('is-active')); b.classList.add('is-active');
      state.filter.awards = b.dataset.filter; renderAwards();
    });
    $('#awards-add').addEventListener('click', () => openAwardEditor('new'));

    // 抽屉
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-cancel').addEventListener('click', closeDrawer);
    $('#drawer-save').addEventListener('click', () => {
      if (!drawerOnSave) return;
      const item = drawerOnSave();
      if (!item) return;
      // 判断新建：抽屉标题含"新增"或 item 是新建标记
      const isNew = $('#drawer-title').textContent.indexOf('新增') === 0;
      const isAwardOrUpdate = $('#drawer-title').textContent.indexOf('获奖') >= 0 || $('#drawer-title').textContent.indexOf('动态') >= 0;
      if (isAwardOrUpdate) {
        if ($('#drawer-title').textContent.indexOf('获奖') >= 0) saveAward(item, isNew);
        else saveUpdate(item, isNew);
      } else {
        saveProject(item, isNew);
      }
    });
    $('#drawer-save-draft').addEventListener('click', () => {
      if (drawerOnSave) { const item = drawerOnSave(); if (item) { if (item.status !== 'draft') item.status = 'draft'; } }
      // 关闭抽屉并整体保存草稿
      closeDrawer();
      saveDraftLocal();
      renderCurrentView();
    });

    // 预览
    $('#preview-close').addEventListener('click', () => { $('#modal-preview').hidden = true; });
    $('#modal-preview .modal-preview__mask').addEventListener('click', () => { $('#modal-preview').hidden = true; });
    $('#preview-lang').addEventListener('change', (e) => {
      // 重新渲染最近一次预览
      const activeView = state.currentView;
      if (activeView === 'projects') renderPreview('projects', null, e.target.value);
      else if (activeView === 'updates') renderPreview('updates', null, e.target.value);
      else renderPreview('awards', null, e.target.value);
    });

    // 发布
    $('#publish-btn').addEventListener('click', openPublishModal);
    $('#publish-close').addEventListener('click', () => { $('#modal-publish').hidden = true; });
    $('#modal-publish .modal-preview__mask').addEventListener('click', () => { $('#modal-publish').hidden = true; });
    $('#publish-confirm').addEventListener('click', doPublish);

    // 草稿 / 导出 / 导入
    $('#save-draft-btn').addEventListener('click', saveDraftLocal);
    $('#export-btn').addEventListener('click', exportBackup);
    $('#import-file').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
  }

  // ---------- 初始化 ----------
  async function init() {
    state.readyPromise = loadAll();
    await state.readyPromise;
    bindEvents();
    // 登录态检查
    let authed = false;
    try { authed = sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) {}
    if (authed) { state.authed = true; enterMain(); }
  }

  document.addEventListener('DOMContentLoaded', () => { init().catch((e) => { console.error(e); toast('初始化失败：' + e.message, 'err'); }); });
})();
