/* V次元 Web - 轻量 SPA */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = ts => {
  if (!ts) return '';
  const d = new Date(ts * 1000), now = Date.now() / 1000, diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtNum = n => {
  n = Number(n) || 0;
  return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w' : n;
};
const fmtDur = s => {
  s = Number(s) || 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtSize = n => {
  n = Number(n) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + 'MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + 'KB';
  return n + 'B';
};
const renderAttachments = (list) => {
  if (!list || !list.length) return '';
  const others = list.filter(a => a && a.url && !a.isimage);
  if (!others.length) return '';
  return '<div class="td-att">' + others.map(a => {
    if (a.mp4_url) {
      return `<div class="td-att-item"><video class="att-video" src="${esc(a.mp4_url)}" controls preload="none" playsinline></video></div>`;
    }
    const fn = (a.filename || '').toLowerCase();
    const ext = (fn.match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'aac', 'opus', 'wma'].includes(ext)) {
      return `<div class="td-att-item att-audio-item"><audio class="att-audio" src="${esc(a.url)}" controls preload="none"></audio><div class="att-name">${esc(a.filename || '音频')}</div></div>`;
    }
    const isVid = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv'].includes(ext);
    if (isVid) {
      return `<div class="td-att-item"><video class="att-video" src="${esc(a.url)}" controls preload="none" playsinline></video></div>`;
    }
    const href = '/api/attach?url=' + encodeURIComponent(a.url) + '&fn=' + encodeURIComponent(a.filename || '');
    return `<div class="td-att-item"><a href="${href}" download="${esc(a.filename || '')}">${svgIcon('paperclip', 16)}<span class="att-name">${esc(a.filename || '附件')}</span><span class="att-size">${fmtSize(a.filesize)}</span></a></div>`;
  }).join('') + '</div>';
};
const _hlsInstances = new WeakMap();
const playHls = (videoEl, url, onError) => {
  const old = _hlsInstances.get(videoEl);
  if (old) { try { old.destroy(); } catch (e) {} _hlsInstances.delete(videoEl); }
  videoEl.removeAttribute('src');
  videoEl.load();
  if (url && /\.m3u8(\?|$)/i.test(url) && window.Hls && Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 30, maxBufferSize: 120 * 1000 * 1000 });
    hls.loadSource(url);
    hls.attachMedia(videoEl);
    hls.on(Hls.Events.ERROR, (evt, data) => {
      if (data && data.fatal) {
        if (onError) onError(hls, data);
      }
    });
    _hlsInstances.set(videoEl, hls);
    return hls;
  }
  if (url) {
    videoEl.src = url;
    videoEl.onerror = () => { if (onError) onError(null, { fatal: true }); };
  }
  return null;
};
const destroyHls = videoEl => {
  const old = _hlsInstances.get(videoEl);
  if (old) { try { old.destroy(); } catch (e) {} _hlsInstances.delete(videoEl); }
};
const resTag = (w, h) => {
  w = Number(w) || 0; h = Number(h) || 0;
  if (!w || !h) return '';
  const hi = Math.max(w, h);
  if (hi >= 3840) return '4K';
  if (hi >= 2560) return '2K';
  if (hi >= 1920) return '1080P';
  if (hi >= 1280) return '720P';
  return '标清';
};
const avatar = u => (u && (u.author_avatar || u.avatar)) || 'https://oss.lty.fan/avatar/default.png';
const toast = (msg, type = '') => {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast'; }, 2400);
};
const urlOf = p => {
  const q = Object.entries(p.params || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return '/api/' + p.path + (q ? '?' + q : '');
};

let ME = null;
let FORUMS = (() => {
  try {
    const e = JSON.parse(localStorage.getItem('vcy_forums') || 'null');
    if (e && Date.now() - e.t < 1800000 && Array.isArray(e.d)) return e.d;
  } catch (err) {}
  return [];
})();
function cacheForums() {
  try { localStorage.setItem('vcy_forums', JSON.stringify({ t: Date.now(), d: FORUMS })); } catch (err) {}
}

const LS_AT = 'vcy_at', LS_RT = 'vcy_rt';
const getAT = () => localStorage.getItem(LS_AT) || '';
const getRT = () => localStorage.getItem(LS_RT) || '';
const setTokens = (at, rt) => {
  if (at) localStorage.setItem(LS_AT, at);
  if (rt) localStorage.setItem(LS_RT, rt);
};
const clearTokens = () => { localStorage.removeItem(LS_AT); localStorage.removeItem(LS_RT); };

const _apiCache = new Map();
const _apiCacheAge = 30000;
let _refreshing = null;
async function tryRefresh() {
  const rt = getRT();
  if (!rt) return null;
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const rr = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'X-Refresh-Token': rt } });
      if (rr.status === 401) { clearTokens(); return null; }
      const rd = await rr.json().catch(() => null);
      if (rd && rd.ok && rd.access_token) {
        setTokens(rd.access_token, rd.refresh_token || rt);
        return rd.access_token;
      }
      if (rd && rd.ok === false && rd.message === 'no refresh_token') { clearTokens(); return null; }
      return null;
    } catch (e) { return null; }
    finally { _refreshing = null; }
  })();
  return _refreshing;
}
async function api(path, { method = 'GET', body, params, skipCache } = {}) {
  if (method === 'GET' && !skipCache) {
    const key = path + '?' + (params ? JSON.stringify(params) : '');
    const hit = _apiCache.get(key);
    if (hit && Date.now() - hit.t < _apiCacheAge) {
      return hit.v;
    }
  }
  const opts = { method, headers: { 'Accept': 'application/json' } };
  const at = getAT();
  if (at) opts.headers['Authorization'] = 'Bearer ' + at;
  const rt = getRT();
  if (rt) opts.headers['X-Refresh-Token'] = rt;
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const fetchOnce = async () => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    try {
      return await fetch(urlOf({ path, params }), { ...opts, signal: ctl.signal });
    } finally { clearTimeout(to); }
  };
  let r;
  try { r = await fetchOnce(); }
  catch (e) {
    if (method === 'GET') { r = await fetchOnce(); }
    else throw e;
  }
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (r.status === 401 || (data && data.code === 'TOKEN_EXPIRED')) {
    const nat = await tryRefresh();
    if (nat) {
      opts.headers['Authorization'] = 'Bearer ' + nat;
      opts.headers['X-Refresh-Token'] = getRT() || '';
      const r2 = await fetch(urlOf({ path, params }), opts).catch(() => null);
      if (r2) {
        data = await r2.json().catch(() => null);
        return { status: r2.status, data };
      }
    }
    return { status: 401, data };
  }
  const out = { status: r.status, data };
  if (method !== 'GET' && r.status === 200) {
    for (const k of _apiCache.keys()) {
      if (k.includes('getThreadComments') || k.includes('getComments')) _apiCache.delete(k);
    }
  }
  if (method === 'GET' && !skipCache && r.status === 200) {
    const key = path + '?' + (params ? JSON.stringify(params) : '');
    _apiCache.set(key, { t: Date.now(), v: out });
    if (_apiCache.size > 80) {
      const now = Date.now();      for (const [k, v] of _apiCache) {
        if (now - v.t > _apiCacheAge) _apiCache.delete(k);
      }
    }
  }
  return out;
}

async function loadMe() {
  try {
    let at = getAT();
    let r = await fetch('/api/auth/status', at ? { headers: { 'Authorization': 'Bearer ' + at } } : {});
    let d = await r.json().catch(() => ({}));
    if (!d.logged_in && getRT()) {
      const nat = await tryRefresh();
      if (nat) {
        r = await fetch('/api/auth/status', { headers: { 'Authorization': 'Bearer ' + nat } });
        d = await r.json().catch(() => ({}));
      }
    }
    ME = d.logged_in ? d.user : null;
  } catch (e) { ME = null; }
  renderMe();
  refreshNotiBadge();
  refreshMsgBadge();
  if (ME && !FORUMS.some(f => (f.subforums || []).some(s => s.can_post))) {
    api('forums').then(r => { if (r.data?.data) { FORUMS = r.data.data; cacheForums(); } }).catch(() => {});
  }
}

async function refreshMsgBadge() {
  const badge = $('#msg-badge');
  if (!badge) return;
  if (!getAT()) { badge.hidden = true; return; }
  try {
    const r = await api('messages', { params: { page: 1, pageSize: 50 } });
    const list = r.data?.data?.list || [];
    const unread = list.reduce((s, c) => s + (c.unread || 0), 0);
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = !unread;
  } catch (e) { badge.hidden = true; }
}

async function refreshNotiBadge() {
  const badge = $('#noti-badge');
  if (!badge) return;
  if (!getAT()) { badge.hidden = true; return; }
  try {
    const r = await api('notifications', { params: { page: 1, pageSize: 1 } });
    const d = r.data?.data || {};
    const unread = d.unread_count || listFilterUnread(d.notifications);
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = !unread;
  } catch (e) { badge.hidden = true; }
}
function listFilterUnread(list) {
  return (list || []).filter(n => n.is_read === undefined ? false : !n.is_read).length;
}
async function autoReadAll() {
  try {
    const r = await api('messages', { params: { page: 1, pageSize: 50 } });
    const list = r.data?.data?.list || [];
    const unread = list.filter(c => c.unread > 0);
    await Promise.all(unread.map(c => api('messages/' + c.plid + '/read', { method: 'PUT', body: {} }).catch(() => {})));
    if (unread.length) refreshMsgBadge();
  } catch (e) {}
}
function renderMe() {
  const b = $('#me-badge'), l = $('#me-link');
  if (ME) {
    b.innerHTML = `<a href="#/u/${ME.uid}"><img src="${esc(avatar(ME))}" style="width:30px;height:30px;border-radius:50%;vertical-align:middle"></a>`;
    l.innerHTML = '';
  } else {
    b.innerHTML = '<a href="#/login">登录</a>';
    l.innerHTML = '';
  }
}

function attachDynamicPrefetch(rootEl) {
  if (!rootEl || feedMode === 'eco') return;
  const margin = feedMode === 'turbo' ? '1200px' : '600px';
  const warmImgs = (el, max) => {
    if (el._pi) return;
    el._pi = true;
    const imgs = el.querySelectorAll('img');
    for (let i = 0; i < imgs.length && i < max; i++) {
      const u = imgs[i].getAttribute('src');
      if (u && !u.startsWith('data:')) { const t = new Image(); t.src = u; }
    }
  };
  rootEl.querySelectorAll('.thread[data-tid]').forEach(x => {
    if (x._pf) { x._pf.disconnect(); x._pf = null; }
    x._pf = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        warmImgs(en.target, feedMode === 'turbo' ? 4 : 1);
        const tid = en.target.dataset.tid;
        if (!tid) return;
        const key = 'threads/' + tid + '?{}';
        if (!_apiCache.has(key)) api('threads/' + tid).catch(() => {});
        const ck = 'thread/getThreadComments?{"tid":' + tid + ',"page":1,"pageSize":20}';
        if (!_apiCache.has(ck)) api('thread/getThreadComments', { params: { tid, page: 1, pageSize: 20 } }).catch(() => {});
      });
    }, { rootMargin: margin + ' 0px' });
    x._pf.observe(x);
  });
}

function renderThreadItem(t) {  const imgs = (t.images || []).slice(0, 3).map(i => `<img src="${esc(i.url)}" loading="lazy" decoding="async">`).join('');
  const likes = t.likes || 0, dislikes = t.dislikes || 0;
  return `<div class="thread" data-tid="${t.tid}" data-href="#/t/${t.tid}">
    <div class="thread-head">
      <img src="${esc(avatar(t))}" loading="lazy" decoding="async">
      <span>${esc(t.author)}</span>
      ${t.groupname ? `<span>· ${esc(t.groupname)}</span>` : ''}
      ${t.forum_name ? `<span>· <span class="fname">${esc(t.forum_name)}</span></span>` : ''}
      <span style="margin-left:auto">${fmtTime(t.lastpost)}</span>
    </div>
    <div class="thread-title">${t.pin ? '<span class="pin-badge">顶</span>' : ''}${t.digest ? '<span class="digest-badge">精</span>' : ''}${esc(t.subject).replace(/%%HILITE%%/g, '<mark>').replace(/%%\/HILITE%%/g, '</mark>')}</div>
    ${t.attachments?.length ? `<div class="thread-att"><span>${svgIcon('paperclip', 12)}${t.attachments.length} 个附件</span></div>` : ''}
    ${t.message && !t.images?.length ? `<div class="thread-desc">${esc(t.message)}</div>` : ''}
    ${imgs ? `<div class="thread-imgs">${imgs}</div>` : ''}
    <div class="thread-meta">
      <span>浏览 ${fmtNum(t.views)}</span>
      <span>回复 ${fmtNum(t.replies)}</span>
      <span class="up">赞 ${fmtNum(likes)}</span>
      ${dislikes ? `<span class="down">踩 ${fmtNum(dislikes)}</span>` : ''}
    </div>
  </div>`;
}

function renderForums(list) {
  const out = [];
  for (const f of FORUMS || []) {
    if (f.subforums && f.subforums.length) {
      out.push(`<div class="forum-group">${esc(f.name)}</div>`);
      for (const s of f.subforums) {
        out.push(`<div class="forum-item ${s.fid === list ? 'active' : ''}" data-fid="${s.fid}">
          <span>${esc(s.name)}</span><span class="cnt">${s.threads || ''}${s.todayposts ? ` / 今${s.todayposts}` : ''}</span>
        </div>`);
      }
    } else {
      out.push(`<div class="forum-item ${f.fid === list ? 'active' : ''}" data-fid="${f.fid}">
        <span>${esc(f.name)}</span><span class="cnt">${f.threads || ''}${f.todayposts ? ` / 今${f.todayposts}` : ''}</span>
      </div>`);
    }
  }
  return out.join('');
}

/* ============ 视图 ============ */

const FEED_MODES = {
  normal: { label: '正常', pages: 1, cap: 80 },
  eco: { label: '省内存', pages: 1, cap: 20 },
  turbo: { label: '极速', pages: 5, cap: 300 },
};
let feedMode = 'normal';
try { const m = localStorage.getItem('vcy_feed_mode'); if (FEED_MODES[m]) feedMode = m; } catch (e) {}
const feedModeHtml = () => `<div class="seg" id="feed-mode"><button data-m="normal" type="button">正常</button><button data-m="eco" type="button">省内存</button><button data-m="turbo" type="button">极速</button></div>`;
function bindFeedMode(segEl) {
  if (!segEl) return;
  segEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === feedMode));
  segEl.onclick = (ev) => {
    const btn = ev.target.closest('button[data-m]');
    if (!btn || btn.dataset.m === feedMode) return;
    feedMode = btn.dataset.m;
    try { localStorage.setItem('vcy_feed_mode', feedMode); } catch (e) {}
    segEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === feedMode));
    toast(`帖子列表已切换到${FEED_MODES[feedMode].label}模式`, 'ok');
    _domCache = {};
    _scrollPos = {};
    const h = location.hash;
    if (h === '#/' || h === '') location.hash = '#/new';
    route(true);
  };
}

const views = {};

views.latest = async (el, params) => {
  let page = 1, loading = false, ended = false;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const listEl = document.createElement('div');
  const sentinel = document.createElement('div');
  sentinel.className = 'empty';
  sentinel.style.padding = '20px';
  sentinel.textContent = '加载中…';
  const load = async (append) => {
    if (loading || ended) return;
    loading = true;
    const r = await api('homepage', { params: { page, pageSize: 20, sort: 'new' } });
    const feed = r.data?.data || {};
    const list = feed.list || [];
    const totalPages = feed.total_pages || Math.ceil((feed.total || 0) / 20) || 1;
    page++;
    ended = page > totalPages;
    const html = list.map(t => renderThreadItem(t)).join('');
    if (append) {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      listEl.appendChild(wrap);
    } else {
      el.innerHTML = `<div class="grid">
        <div><div class="card"><div class="feed-bar"><span class="fb-t">最新</span>${feedModeHtml()}</div><div id="latest-list"></div></div><div id="latest-sentinel" class="empty" style="padding:20px">加载中…</div></div>
        <div class="side"><div class="card"><div class="side-title">版块</div>${renderForums(parseInt(params.fid))}</div></div>
      </div>`;
      listEl.innerHTML = html || '<div class="empty">暂无帖子</div>';
      document.getElementById('latest-list').appendChild(listEl);
    }
    bindClicks(el);
    attachDynamicPrefetch(listEl);
    loading = false;
    return list.length > 0;
  };
  await load(false);
  bindFeedMode(document.getElementById('feed-mode'));
  if (feedMode === 'turbo') {
    for (let i = 0; i < FEED_MODES.turbo.pages - 1; i++) {
      if (ended || loading) break;
      await load(true);
    }
    const sent = document.getElementById('latest-sentinel');
    if (sent && !ended) sent.textContent = '已预加载更多,继续下滑加载';
  }
  const s2 = document.getElementById('latest-sentinel');
  if (!s2) return;
  const obs = new IntersectionObserver(async entries => {
    if (entries[0].isIntersecting) {
      if (ended) { s2.textContent = '— 已经到底啦 —'; obs.disconnect(); return; }
      const ok = await load(true);
      if (!ok && ended) { s2.textContent = '— 已经到底啦 —'; obs.disconnect(); }
    }
  }, { rootMargin: '300px' });
  obs.observe(s2);
  el._obs = obs;
};

views.forums = async (el) => {
  if (!FORUMS.length) {
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await api('forums');
    if (r.data?.data) { FORUMS = r.data.data; cacheForums(); }
  }
  const html = (FORUMS || []).map(f => {
    const subs = (f.subforums || []).map(s => `
      <div class="forum-item" data-fid="${s.fid}">
        <span>${esc(s.name)}</span><span class="cnt">${s.threads || ''}${s.todayposts ? ` / 今${s.todayposts}` : ''}</span>
      </div>`).join('');
    const head = `<div class="forum-group">${esc(f.name)}</div>`;
    return subs ? head + subs : head;
  }).join('');
  el.innerHTML = `<div class="card" style="max-width:720px;margin:0 auto">${html || '<div class="empty">暂无版块</div>'}</div>`;
  bindClicks(el);
};

views.home = async (el, params) => {
  const fid = params.fid || '';
  const pageSize = 20;
  let page = 1, loading = false, ended = false, timer = null;
  const listEl = document.createElement('div');
  const load = async (append) => {
    if (loading || ended) return;
    loading = true;
    const q = { page, pageSize };
    if (fid) q.fid = fid;
    const r = await api('threads', { params: q });
    const feed = r.data?.data || {};
    const threads = feed.threads || [];
    const totalPages = feed.total_pages || feed.totalPages || Math.ceil((feed.total || 0) / pageSize) || 1;
    page++;
    ended = page > totalPages;
    if (append) {
      const wrap = document.createElement('div');
      wrap.innerHTML = threads.map(renderThreadItem).join('');
      wrap.querySelectorAll?.('[data-tid],[data-href]').forEach(x => {
        x.onclick = () => { location.hash = x.dataset.href; };
      });
      listEl.appendChild(wrap);
    } else {
      el.innerHTML = `<div class="grid">
        <div><div class="card"><div class="feed-bar"><span class="fb-t">帖子</span>${feedModeHtml()}</div><div id="home-list"></div></div><div id="home-sentinel" class="empty" style="padding:20px">加载中…</div></div>
        <div class="side"><div class="card"><div class="side-title">版块</div>${renderForums(parseInt(fid))}</div></div>
      </div>`;
      listEl.innerHTML = threads.map(renderThreadItem).join('');
      document.getElementById('home-list').appendChild(listEl);
    }
    bindClicks(el);
    attachDynamicPrefetch(listEl);
    loading = false;
    return threads.length > 0;
  };
  await load(false);
  bindFeedMode(document.getElementById('feed-mode'));
  if (feedMode === 'turbo') {
    for (let i = 0; i < FEED_MODES.turbo.pages - 1; i++) {
      if (ended || loading) break;
      await load(true);
    }
    const sent = document.getElementById('home-sentinel');
    if (sent && !ended) sent.textContent = '已预加载更多,继续下滑加载';
  }
  const sentinel = document.getElementById('home-sentinel');
  if (!sentinel) return;
  const obs = new IntersectionObserver(async entries => {
    if (entries[0].isIntersecting) {
      if (ended) { sentinel.textContent = '— 已经到底啦 —'; obs.disconnect(); return; }
      sentinel.textContent = '加载中…';
      const ok = await load(true);
      if (!ok && ended) { sentinel.textContent = '— 已经到底啦 —'; obs.disconnect(); }
    }
  }, { rootMargin: '300px' });
  obs.observe(sentinel);
  el._obs = obs;
};

const svgIcon = (name, size = 14) => {
  const paths = {
    like: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>',
    dislike: '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"></path>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
    smile: '<circle cx="12" cy="12" r="10"></circle><circle cx="8.8" cy="9.6" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="15.2" cy="9.6" r="1.4" fill="currentColor" stroke="none"></circle><path d="M8.2 14.1c1 1.2 2.3 1.8 3.8 1.8s2.8-.6 3.8-1.8"></path>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',
    info: '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px">${paths[name] || ''}</svg>`;
};

views.thread = async (el, params) => {
  const tid = params.tid;
  const page = parseInt(params.page || '1');
  const [tr, cr] = await Promise.all([
    api('threads/' + tid),
    api('thread/getThreadComments', { params: { tid, page, pageSize: 20 } }),
  ]);
  const t = tr.data?.data || tr.data || tr.data?.thread || {};
  const comments = cr.data?.data || {};
  const list = comments.list || [];
  el.innerHTML = `<div class="card td-head">
    <div class="td-title">${esc(t.subject)}</div>
    <div class="td-sub">
      <img src="${esc(avatar(t))}">
      <a href="#/u/${t.authorid}">${esc(t.author)}</a>
      ${t.groupname ? `<span>${esc(t.groupname)}</span>` : ''}
      <span>${fmtTime(t.dateline)}</span>
      <span>浏览 ${fmtNum(t.views)} · 回复 ${fmtNum(t.replies)}</span>
      <span style="margin-left:auto"><button class="btn small-link" data-action="follow" data-uid="${t.authorid}">关注</button></span>
    </div>
    <div class="td-body">${renderMsg(t.content || t.message || '')}${(t.images || []).filter(i => i.url).map(i => `<div class="td-img"><img src="${esc(i.url)}" loading="lazy" data-viewer="${esc(i.original_url || i.url)}"></div>`).join('')}${renderAttachments(t.attachments)}</div>
    <div class="td-actions">
      <button class="btn like-btn ${t.user_attitude === 1 ? 'active-like' : ''}" data-action="attitude" data-v="1">${svgIcon('like')}赞 ${fmtNum(t.likes)}</button>
      <button class="btn ${t.user_attitude === -1 ? 'active-like' : ''}" data-action="attitude" data-v="-1">${svgIcon('dislike')}踩 ${fmtNum(t.dislikes)}</button>
      <button class="btn" data-action="collect">${svgIcon('star')}收藏</button>
      <button class="btn" data-action="copy">${svgIcon('link')}复制链接</button>
    </div>
  </div>
  <div class="card">
    <div class="cmt-head">评论 (${comments.total || 0})</div>
    <div id="cmt-list">${list.length ? list.map(c => renderComment(c)).join('') : '<div class="empty">暂无评论</div>'}</div>
    ${comments.total_pages > 1 ? `<div class="pager">
      <button ${page <= 1 ? 'disabled' : ''} data-href="#/t/${tid}?page=${page - 1}">上一页</button>
      <span>${page} / ${comments.total_pages}</span>
      <button ${page >= comments.total_pages ? 'disabled' : ''} data-href="#/t/${tid}?page=${page + 1}">下一页</button>
    </div>` : ''}
    <div class="compose-box">
      <div class="ce-in" contenteditable="true" id="cmt-input" data-ph="说点什么…"></div>
      <div class="row"><button class="btn smiley-btn" id="cmt-smiley" type="button">${svgIcon('smile', 16)}表情</button><button class="btn primary" id="cmt-send">发表评论</button></div>
    </div>
  </div>`;
  attachSmileyPicker($('#cmt-input'), $('#cmt-smiley'));
  const pidJump = parseInt(params.pid || '0');
  if (pidJump) {
    setTimeout(() => {
      const tgt = document.querySelector(`[data-pid="${pidJump}"]`) || document.querySelector('.pm-scroll, .cmt');
      if (tgt) {
        tgt.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tgt.classList.add('cmt-highlight');
        setTimeout(() => tgt.classList.remove('cmt-highlight'), 2500);
      }
    }, 400);
  }
  $('#cmt-send').onclick = async () => {
    const v = ceVal($('#cmt-input'));
    if (!v) return toast('请输入内容', 'error');
    if (v.length > 2000) return toast('内容过长(最多2000字)', 'error');
    const r = await api('post/postPosts', { method: 'POST', body: { tid: +tid, message: v } });
    if (r.data && r.data.status === 'success') { toast('评论发布成功', 'ok'); ceClear($('#cmt-input')); views.thread(el, params); }
    else toast(r.data?.message || '发布失败', 'error');
  };
  let replyingTo = null;
  const cmtListEl = document.getElementById('cmt-list');
  if (cmtListEl) cmtListEl.addEventListener('click', async e => {
    const mb = e.target.closest('[data-more-pid]');
    if (mb) {
      const p = +mb.dataset.morePid;
      if (_expSubs.has(p)) _expSubs.delete(p); else _expSubs.add(p);
      views.thread(el, params);
      return;
    }
    const rb = e.target.closest('[data-reply-pid]');
    const db = e.target.closest('[data-del-pid]');
    const lb = e.target.closest('[data-like-pid]');
    if (lb) {
      if (!getAT()) { toast('请先登录', 'error'); return; }
      const pid = +lb.dataset.likePid;
      const wasLiked = lb.classList.contains('liked');
      const r = await api('comment/attitude', { method: 'POST', body: { pid, attitude: wasLiked ? 0 : 1 } });
      if (r.data?.status === 'success') {
        toast(wasLiked ? '已取消点赞' : '已点赞', 'ok');
        const cnt = r.data.data?.like_count ?? Math.max(0, (+lb.dataset.likeCnt + (wasLiked ? -1 : 1)));
        lb.classList.toggle('liked', !wasLiked);
        lb.dataset.likeCnt = cnt;
        lb.querySelector('.lk-cnt').textContent = fmtNum(cnt || 0);
      } else toast(r.data?.message || '操作失败', 'error');
      return;
    }
    if (rb) {
      if (!getAT()) { toast('请先登录', 'error'); return; }
      replyingTo = { pid: +rb.dataset.replyPid, name: rb.dataset.replyName };
      $('#cmt-input').focus();
      cePh($('#cmt-input'), `回复 ${rb.dataset.replyName}…`);
      $('#cmt-send').textContent = `回复 ${rb.dataset.replyName}`;
      return;
    }
    if (db) {
      if (!getAT()) { toast('请先登录', 'error'); return; }
      if (!confirm('确定删除这条评论?')) return;
      const r = await api(`posts/${db.dataset.delPid}`, { method: 'DELETE' });
      toast(r.data?.status === 'success' ? '评论已删除' : r.data?.message || '删除失败', r.data?.status === 'success' ? 'ok' : 'error');
      views.thread(el, params);
      return;
    }
  });
  const sendReply = async () => {
    const v = ceVal($('#cmt-input'));
    if (!v) return toast('请输入内容', 'error');
    if (v.length > 2000) return toast('内容过长(最多2000字)', 'error');
    const body = { tid: +tid, message: v };
    if (replyingTo) body.pid = replyingTo.pid;
    const r = await api('post/postPosts', { method: 'POST', body });
    if (r.data && r.data.status === 'success') {
      toast('发布成功', 'ok');
      ceClear($('#cmt-input'));
      cePh($('#cmt-input'), '说点什么…');
      $('#cmt-send').textContent = '发表评论';
      replyingTo = null;
      views.thread(el, params);
    } else toast(r.data?.message || '发布失败', 'error');
  };
  $('#cmt-send').onclick = sendReply;
  el.querySelector('.td-actions').addEventListener('click', async e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    if (act === 'attitude') {
      const v = +b.dataset.v;
      const cur = t.user_attitude === v ? 0 : v;
      const r = await api(`threads/${tid}/attitude`, { method: 'POST', body: { attitude: cur } });
      if (r.data?.status === 'success') { toast(cur === 0 ? '已取消' : cur === 1 ? '已点赞' : '已踩', 'ok'); views.thread(el, params); }
      else toast(r.data?.message || '操作失败', 'error');
    } else if (act === 'follow') {
      const r = await api('follow', { method: 'POST', body: { followuid: +b.dataset.uid } });
      toast(r.data?.status === 'followed' ? '已关注' : r.data?.message || '关注失败', r.data?.status === 'followed' ? 'ok' : 'error');
    } else if (act === 'collect') {
      const r = await api('collections', { method: 'GET' });
      const cols = r.data?.data?.collections || r.data?.data || [];
      if (!cols.length) {
        const c = await api('collections', { method: 'POST', body: { title: '默认收藏夹' } });
        if (c.status !== 201 && c.status !== 200) return toast('创建收藏夹失败', 'error');
        cols.push({ id: c.data?.data?.id, title: c.data?.data?.title || '默认收藏夹' });
      }
      const r2 = await api(`collections/${cols[0].id}/items`, { method: 'POST', body: { content_type: 'thread', content_id: +tid } });
      toast(r2.status === 201 ? '已收藏' : '收藏失败', r2.status === 201 ? 'ok' : 'error');
    } else if (act === 'copy') {
      navigator.clipboard?.writeText(location.href).then(() => toast('链接已复制', 'ok')).catch(() => toast('复制失败', 'error'));
    }
  });
};

const _expSubs = new Set();
function renderComment(c, isSub) {
  const subC = c.top_comments || [];
  const meUid = ME ? Number(ME.uid) : 0;
  const pid = isSub ? (c.rpid || c.pid || c.id) : (c.pid || c.rpid || c.id);
  const showN = 2;
  const expanded = _expSubs.has(pid);
  const vis = expanded ? subC : subC.slice(0, showN);
  const rest = expanded ? [] : subC.slice(showN);
  const more = subC.length > showN ? `<button class="cmt-more" data-more-pid="${pid}">${expanded ? '收起' : `展开全部 ${subC.length} 条回复`}</button>` : '';
  return `<div class="cmt ${isSub ? 'cmt-sub' : ''}" data-pid="${pid}">
    <div class="cmt-user"><img src="${esc(avatar(c))}"><a href="#/u/${c.authorid || c.author_id}">${esc(c.author || '')}</a>${c.groupname ? `<span>· ${esc(c.groupname)}</span>` : ''}${c.tail_device ? `<span>· ${esc(c.tail_device)}</span>` : ''}</div>
    <div class="cmt-text">${renderMsg(c.message || c.comment)}${c.mentioned_users && c.mentioned_users.length ? `<div class="cmt-mention">@${c.mentioned_users.map(m => (typeof m === 'object' ? (m.username || m.name || '') : m)).filter(Boolean).join(' @')}</div>` : ''}</div>
    <div class="cmt-floor"><span>#${c.position || pid || ''}</span><span>${fmtTime(c.dateline)}</span>
      <button class="cmt-like ${c.user_attitude === 1 ? 'liked' : ''}" data-like-pid="${pid}" data-like-cnt="${c.like_count || 0}">${svgIcon('like', 12)}<span class="lk-cnt">${fmtNum(c.like_count || 0)}</span></button>
      <button class="cmt-reply" data-reply-pid="${pid}" data-reply-uid="${c.authorid || c.author_id || ''}" data-reply-name="${esc(c.author || '')}">回复</button>
      ${meUid && Number(c.authorid || c.author_id) === meUid ? `<button class="cmt-del" data-del-pid="${pid}">删除</button>` : ''}
    </div>
    ${subC.length ? `<div class="cmt-subs">${vis.map(s => renderComment(s, true)).join('')}${more ? `<div class="cmt-more-wrap">${more}</div>` : ''}</div>` : ''}
  </div>`;
}

let SMILEY_MAP = null;
const SMILEY_TTL = 3600000;
function getSmileyMap() {
  if (SMILEY_MAP) return Promise.resolve(SMILEY_MAP);
  try {
    const c = JSON.parse(localStorage.getItem('vcy_smileys') || 'null');
    if (c && Array.isArray(c.d) && Date.now() - c.t < SMILEY_TTL) { SMILEY_MAP = c.d; return Promise.resolve(SMILEY_MAP); }
  } catch (e) {}
  return fetch('/api/smiley/list', { headers: getAT() ? { 'Authorization': 'Bearer ' + getAT() } : {} })
    .then(r => r.json())
    .then(r => {
      const list = (r.data || (r.data && r.data.data) || []).flatMap(g => (g.smileys || []).map(s => [s.code, s.url]));
      const map = {};
      for (const [code, url] of list) map[code] = url;
      SMILEY_MAP = map;
      try { localStorage.setItem('vcy_smileys', JSON.stringify({ t: Date.now(), d: map })); } catch (e) {}
      return map;
    })
    .catch(() => ({}));
}
let SMILEY_GROUPS = null;
function getSmileyGroups() {
  if (SMILEY_GROUPS) return Promise.resolve(SMILEY_GROUPS);
  try {
    const c = JSON.parse(localStorage.getItem('vcy_smiley_groups') || 'null');
    if (c && Array.isArray(c.d) && Date.now() - c.t < SMILEY_TTL) { SMILEY_GROUPS = c.d; return Promise.resolve(SMILEY_GROUPS); }
  } catch (e) {}
  return fetch('/api/smiley/list', { headers: getAT() ? { 'Authorization': 'Bearer ' + getAT() } : {} })
    .then(r => r.json())
    .then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data && Array.isArray(r.data.data) ? r.data.data : []);
      SMILEY_GROUPS = list;
      try { localStorage.setItem('vcy_smiley_groups', JSON.stringify({ t: Date.now(), d: list })); } catch (e) {}
      return list;
    })
    .catch(() => []);
}
let _smileyPanel = null;
function ceVal(el) {
  if (!el) return '';
  let out = '';
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.textContent; continue; }
      if (c.nodeType !== 1) continue;
      if (c.dataset && c.dataset.code) { out += c.dataset.code; continue; }
      if (c.tagName === 'BR') { out += '\n'; continue; }
      if (c.tagName === 'DIV' || c.tagName === 'P') { walk(c); out += '\n'; continue; }
      walk(c);
    }
  };
  walk(el);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
function ceClear(el) { if (el) el.innerHTML = ''; }
function cePh(el, ph) { if (el) el.dataset.ph = ph; }
function attachSmileyPicker(ta, btn) {
  if (!btn || !ta) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (_smileyPanel) { _smileyPanel.remove(); _smileyPanel = null; return; }
    const groups = await getSmileyGroups();
    if (!groups.length) return toast('表情加载失败', 'error');
    const p = document.createElement('div');
    p.className = 'smiley-panel';
    p.innerHTML = `<div class="sp-tabs">${groups.map((g, i) => `<button class="sp-tab${i === 0 ? ' active' : ''}" data-i="${i}" type="button"><img src="${esc((g.smileys && g.smileys[0] && g.smileys[0].url) || '')}" loading="lazy">${esc(g.name || g.directory || '')}</button>`).join('')}</div>
      <div class="sp-body">${groups.map((g, i) => `<div class="sg-g" data-i="${i}"${i === 0 ? '' : ' style="display:none"'}>${(g.smileys || []).map(s => `<img src="${esc(s.url)}" alt="${esc(s.code)}" title="${esc(s.code)}" data-code="${esc(s.code)}">`).join('')}</div>`).join('')}</div>`;
    p.querySelector('.sp-tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('.sp-tab');
      if (!t) return;
      p.querySelectorAll('.sp-tab').forEach(x => x.classList.toggle('active', x === t));
      p.querySelectorAll('.sg-g').forEach(g => { g.style.display = g.dataset.i === t.dataset.i ? '' : 'none'; });
    });
    p.addEventListener('click', (ev) => {
      const im = ev.target.closest('img[data-code]');
      if (!im) return;
      const code = im.dataset.code;
      if (ta.isContentEditable) {
        ta.focus();
        const sel = window.getSelection();
        let r;
        if (sel.rangeCount && ta.contains(sel.anchorNode)) r = sel.getRangeAt(0);
        else { r = document.createRange(); r.selectNodeContents(ta); r.collapse(false); }
        const img = document.createElement('img');
        img.className = 'ce-smiley';
        img.src = im.src;
        img.alt = code;
        img.title = code;
        img.dataset.code = code;
        r.insertNode(img);
        r.setStartAfter(img);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const s = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + code + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + code.length;
        ta.focus();
      }
      p.remove(); _smileyPanel = null;
    });
    const r = btn.getBoundingClientRect();
    document.body.appendChild(p);
    const ph = p.offsetHeight, pw = p.offsetWidth;
    let top = r.bottom + 6;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    let left = Math.min(r.left, innerWidth - pw - 8);
    if (left < 8) left = 8;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    _smileyPanel = p;
  });
}
document.addEventListener('click', (ev) => {
  if (_smileyPanel && !_smileyPanel.contains(ev.target)) { _smileyPanel.remove(); _smileyPanel = null; }
});
function renderMsg(text) {
  if (!text) return '';
  let s = esc(text);
  const ph = [];
  const phRe = (m, rep) => { ph.push(rep); return `\u0001P${ph.length - 1}\u0002`; };
  s = s.replace(/https?:\/\/oss\.lty\.fan\/[^\s<"]+\.(?:jpg|jpeg|png|gif|webp|bmp)/gi, m => phRe(m, `<img src="${m}" loading="lazy" data-viewer="${m}">`));
  s = s.replace(/\{\:[^:}\n]+\:\}/g, m => {
    const u = SMILEY_MAP && SMILEY_MAP[m];
    return u ? phRe(m, `<img src="${esc(u)}" class="smiley" loading="lazy" data-viewer="${esc(u)}" alt="${m}">`) : m;
  });
  s = s.replace(/(https?:\/\/[^\s<"]+)/g, m => phRe(m, `<a href="${m}" target="_blank" rel="noopener">${m}</a>`));
  s = s.replace(/\bBV[0-9A-Za-z]{10}\b/g, m => phRe(m, `<a href="https://www.bilibili.com/video/${m}" target="_blank" rel="noopener" class="bv-link">${m}</a>`));
  s = s.replace(/\u0001P(\d+)\u0002/g, (m, i) => ph[Number(i)]);
  s = s.replace(/\n/g, '<br>');
  return s;
}

function openViewer(url) {
  let ov = document.getElementById('img-viewer');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'img-viewer';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    ov.innerHTML = '<img id="img-viewer-img" style="max-width:94vw;max-height:92vh;border-radius:8px;object-fit:contain">';
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
  }
  document.getElementById('img-viewer-img').src = url;
}

function postableForums(list) {
  const out = [];
  for (const f of list || []) {
    if (f.subforums && f.subforums.length) out.push(...postableForums(f.subforums));
    else if (f.can_post !== false && f.type !== 'group') out.push(f);
  }
  return out;
}

views.compose = async (el) => {
  if (!getAT()) {
    el.innerHTML = `<div class="empty"><p>发帖需要先登录</p><p style="margin-top:12px"><a class="btn primary" href="#/login" style="display:inline-flex">去登录</a></p></div>`;
    return;
  }
  if (!ME) {
    try {
      const r = await fetch('/api/auth/status', { headers: { 'Authorization': 'Bearer ' + getAT() } });
      const d = await r.json();
      if (d.logged_in) { ME = d.user; renderMe(); }
      else {
        el.innerHTML = `<div class="empty"><p>登录已过期,请重新登录</p><p style="margin-top:12px"><a class="btn primary" href="#/login" style="display:inline-flex">去登录</a></p></div>`;
        return;
      }
    } catch (e) {
      el.innerHTML = `<div class="empty"><p>发帖需要先登录</p><p style="margin-top:12px"><a class="btn primary" href="#/login" style="display:inline-flex">去登录</a></p></div>`;
      return;
    }
  }
  el.innerHTML = `<div class="card form-card" style="max-width:720px;margin:0 auto">
    <h2>发新帖</h2>
    <div class="field"><label>版块</label><select id="c-fid"></select></div>
    <div class="field"><label>标题</label><input id="c-subject" maxlength="80" placeholder="请输入标题"></div>
    <div class="field"><label>内容</label><div class="ce-in ce-lg" contenteditable="true" id="c-msg" data-ph="正文内容…(支持链接、换行)"></div><button class="btn smiley-btn" id="c-smiley" type="button">${svgIcon('smile', 16)}表情</button></div>
    <div class="row" style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn" data-href="#/">取消</button>
      <button class="btn primary" id="c-send">发布</button>
    </div>
  </div>`;
  const sel = $('#c-fid');
  const fill = () => { sel.innerHTML = postableForums(FORUMS).map(f => `<option value="${f.fid}">${esc(f.name)}</option>`).join(''); };
  if (FORUMS.length) {
    fill();
  } else {
    const r = await api('forums');
    if (r.data?.data) { FORUMS = r.data.data; cacheForums(); fill(); }
  }
  if (!sel.options.length) return toast('暂无可发帖版块', 'error');
  attachSmileyPicker($('#c-msg'), $('#c-smiley'));
  $('#c-send').onclick = async () => {
    const fid = +sel.value, subject = $('#c-subject').value.trim(), message = ceVal($('#c-msg'));
    if (!fid) return toast('请选择版块', 'error');
    if (!subject) return toast('请输入标题', 'error');
    if (!message) return toast('请输入内容', 'error');
    const r = await api('threads', { method: 'POST', body: { fid, subject, message } });
    if (r.data?.status === 'success' || r.data?.data?.tid) { toast('发布成功', 'ok'); location.hash = '#/t/' + (r.data.data.tid || r.data.tid); }
    else toast(r.data?.message || '发布失败', 'error');
  };
  bindClicks(el);
};

views.u = async (el, params) => {
  const uid = params.uid;
  const [p, bg, sigs] = await Promise.all([
    api(`user/${uid}/public-profile`),
    api('backgroundup/' + uid),
    api(`user/${uid}/cyber-signatures`),
  ]);
  const u = p.data?.data || {};
  const back = bg.data?.data?.background_url || bg.data?.data?.url || bg.data?.data?.background || '';
  const sigList = sigs.data?.data?.signatures || sigs.data?.data || [];
  const likesRes = await api(`user/${uid}/likes`, { skipCache: true }).catch(() => null);
  const totalLikes = (likesRes && likesRes.data && likesRes.data.data) ? likesRes.data.data.likes : null;
  el.innerHTML = `<div class="profile-hero">
    <div class="profile-bg">${back ? `<img src="${esc(back)}" loading="lazy">` : ''}</div>
    <div class="profile-main">
      <img class="profile-avatar" src="${esc(avatar(u))}">
      <div class="profile-name">${esc(u.username)}
        ${u.level_display ? `<span class="lv">${esc(u.level_display)}</span>` : ''}
        ${u.groupname ? `<span class="lv" style="background:#f0fdf4;color:#16a34a">${esc(u.groupname)}</span>` : ''}
      </div>
      <div class="profile-stats">
        <span><b>${fmtNum(u.followers_count)}</b> 粉丝</span>
        <span><b>${fmtNum(u.following_count)}</b> 关注</span>
        <span><b>${fmtNum(u.thread_count)}</b> 帖子</span>
        <span><b>${totalLikes !== null ? fmtNum(totalLikes) : fmtNum(u.profile_like_count)}</b> 获赞</span>
        ${u.credits ? `<span>积分 ${fmtNum(u.credits)}</span>` : ''}
      </div>
      ${u.bio ? `<div class="profile-bio">${esc(u.bio)}</div>` : ''}
      <div class="profile-actions">
        <button class="btn primary" data-action="follow" data-uid="${uid}">关注</button>
        <button class="btn" data-action="pm">私信</button>
        ${ME && ME.uid != uid ? `<button class="btn danger" data-action="block">拉黑</button>` : ''}
        <a class="btn" href="#/u/${uid}/collections">收藏夹</a>
      </div>
      ${ME && Number(ME.uid) === Number(uid) && ME.uid == 12507 ? `<button class="pin-mgr-btn" data-action="pin-mgr" title="置顶管理"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"></path></svg>置顶管理</button>` : ''}
      ${(u.current_medals || []).length ? `<div class="medal-row">${u.current_medals.map(m => `<img src="${esc(m.image)}" title="${esc(m.name)}">`).join('')}</div>` : ''}
    </div>
  </div>
  <div class="tabs">
    <button class="active" data-tab="threads">帖子</button>
    <button data-tab="followers">粉丝</button>
    ${sigList.length ? `<button data-tab="signs">签名 (${sigList.length})</button>` : ''}
    ${ME && Number(ME.uid) === Number(uid) ? '<button data-tab="history">浏览历史</button>' : ''}
  </div>
  <div id="tab-body"></div>`;
  el.querySelector('.profile-actions').addEventListener('click', async e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'follow') {
      const r = await api('follow', { method: 'POST', body: { followuid: +uid } });
      toast(r.data?.status === 'followed' ? '已关注' : r.data?.message || '操作失败', r.data?.status === 'followed' ? 'ok' : 'error');
    } else if (b.dataset.action === 'pm') {
      location.hash = `#/msg/${uid}?uid=${uid}`;
    } else if (b.dataset.action === 'block') {
      const r = await api('blacklist', { method: 'POST', body: { blackuid: +uid } });
      toast(r.data?.status === 'success' ? '已拉黑' : r.data?.message || '操作失败', 'ok');
    }
  });
  el.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('.tabs button', el).forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    loadTab(b.dataset.tab, $('#tab-body'), uid);
  });
  el.querySelector('.pin-mgr-btn')?.addEventListener('click', () => openPinManager());
  loadTab('threads', $('#tab-body'), uid);
};

async function loadTab(tab, el, uid) {
  if (tab === 'threads') {
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await api('threads', { params: { uid, page: 1, pageSize: 20 } });
    const list = r.data?.data?.threads || r.data?.data?.list || [];
    el.innerHTML = list.length ? `<div class="card">${list.map(t => renderThreadItem({ ...t, lastpost: t.dateline })).join('')}</div>` : '<div class="empty">暂无帖子</div>';
    attachDynamicPrefetch(el);
    bindClicks(el);
  } else if (tab === 'followers') {
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await api(`user/${uid}/followers`, { params: { page: 1, pageSize: 20 } });
    if (r.status === 401 || r.data?.data?.code === 'TOKEN_MISSING') {
      el.innerHTML = `<div class="empty"><p>粉丝列表需要登录后查看</p><p style="margin-top:12px"><a class="btn primary" href="#/login" style="display:inline-flex">去登录</a></p></div>`;
      return;
    }
    const list = r.data?.data?.list || [];
    el.innerHTML = list.length ? `<div class="card">${list.map(f => `
      <div class="conv" data-href="#/u/${f.follower_uid || f.uid}">
        <img src="${esc(avatar(f))}"><div class="mid"><div class="subject">${esc(f.follower_username || f.username)}</div></div>
      </div>`).join('')}</div>` : '<div class="empty">暂无粉丝</div>';
    bindClicks(el);
  } else if (tab === 'signs') {
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await api(`user/${uid}/cyber-signatures`);
    const list = r.data?.data?.signatures || r.data?.data || [];
    const renderSig = (s) => {
      const sd = s.signature_data || s.data || '';
      if (typeof sd === 'string' && sd.startsWith('data:image')) {
        return `<img src="${esc(sd)}" loading="lazy" data-viewer="${esc(sd)}" style="max-width:100%;border-radius:8px">`;
      }
      return esc(sd);
    };
    el.innerHTML = list.length ? `<div class="card">${list.map(s => `<div class="cmt"><div class="cmt-text">${renderSig(s)}</div><div class="cmt-floor">${fmtTime(s.created_at)}${s.from_username ? ' · ' + esc(s.from_username) : ''}</div></div>`).join('')}</div>` : '<div class="empty">暂无签名</div>';
    bindClicks(el);
  } else if (tab === 'history') {
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    let page = 1, loading = false, ended = false;
    const listEl = document.createElement('div');
    const sentinel = document.createElement('div');
    sentinel.className = 'empty';
    sentinel.style.padding = '20px';
    sentinel.textContent = '加载中…';
    const meUid = ME ? Number(ME.uid) : 0;
    const sortList = (arr) => arr
      .filter(h => h.type === 'thread' && !(meUid && h.thread_info && Number(h.thread_info.authorid) === meUid))
      .map(h => ({ ...h, thread_info: { ...(h.thread_info || {}), avatar: h.thread_info && h.thread_info.author_avatar } }));
    const load = async (append) => {
      if (loading || ended) return false;
      loading = true;
      const r = await api('history', { params: { page }, skipCache: true }).catch(() => ({ data: { data: {} } }));
      const d = r.data?.data || {};
      const list = sortList(d.list || []);
      page++;
      ended = page > (d.pages || 1);
      const html = list.map(h => renderThreadItem(h.thread_info || {})).join('');
      if (append) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        listEl.appendChild(wrap);
      } else {
        listEl.innerHTML = html;
        el.innerHTML = `<div class="card" id="hist-list"></div>`;
        document.getElementById('hist-list').appendChild(listEl);
      }
      attachDynamicPrefetch(listEl);
      bindClicks(el);
      loading = false;
      return list.length > 0;
    };
    const first = await load(false);
    if (!first && !ended) { el.innerHTML = '<div class="empty">暂无浏览记录,打开帖子后会自动记录</div>'; return; }
    el.appendChild(sentinel);
    if (ended) sentinel.textContent = '— 已经到底啦 —';
    const obs = new IntersectionObserver(async entries => {
      if (entries[0].isIntersecting) {
        if (ended) { sentinel.textContent = '— 已经到底啦 —'; obs.disconnect(); return; }
        const ok = await load(true);
        if (!ok && ended) { sentinel.textContent = '— 已经到底啦 —'; obs.disconnect(); }
      }
    }, { rootMargin: '300px' });
    obs.observe(sentinel);
    el._obs = obs;
  }
}

views.notifications = async (el, params) => {
  let page = 1, loading = false, ended = false;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const listEl = document.createElement('div');
  const sentinel = document.createElement('div');
  sentinel.className = 'empty';
  sentinel.style.padding = '20px';
  sentinel.textContent = '加载中…';
  const renderNoti = (n) => {
    const nav = n.data?.nav_url || '';
    const tid = n.target_id || n.data?.target_id;
    const d = n.data || {};
    let url = null;
    if (nav.startsWith('/thread/')) url = '#/t/' + nav.split('/')[2];
    else if (nav.startsWith('/video/')) url = '#/v/' + nav.split('/')[2];
    else if (nav.startsWith('/messages/likes') || nav.startsWith('/messages/replies')) url = (d.thread_id ? `#/t/${d.thread_id}?pid=${d.post_id || tid}` : '#/notifications');
    else if (nav.startsWith('/messages')) url = '#/messages';
    else if (n.type === 'private_message') url = '#/messages';
    else if (['thread_like', 'thread_reply', 'thread_like_threshold', 'user_mention_thread', 'thread_mention'].includes(n.type)) url = tid ? '#/t/' + tid : null;
    return `<div class="noti ${n.is_read ? '' : 'unread'}" ${url ? `data-href="${url}"` : ''} style="cursor:${url ? 'pointer' : 'default'}">
      <img src="${esc(n.from_user?.avatar || '')}">
      <div class="msg">
        <b>${esc(n.title || n.type || '')}</b>
        <div style="font-size:13px;color:var(--muted);margin-top:2px">${esc(n.content || (n.type || '') + ' · ' + (n.from_user?.username || ''))}</div>
      </div>
      <span class="time">${fmtTime(n.created_at || n.dateline)}</span>
    </div>`;
  };
  const load = async (append) => {
    if (loading || ended) return;
    loading = true;
    const r = await api('notifications', { params: { page, pageSize: 20 } });
    const d = r.data?.data || {};
    const list = d.notifications || [];
    const totalPages = d.total_pages || Math.ceil((d.total || 0) / 20) || 1;
    page++;
    ended = page > totalPages;
    if (append) {
      const wrap = document.createElement('div');
      wrap.innerHTML = list.map(renderNoti).join('');
      listEl.appendChild(wrap);
    } else {
      el.innerHTML = `<div class="card">
        <div style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
          <b>通知</b><button class="btn" id="mark-read">全部已读</button>
        </div>
        <div id="noti-list"></div>
        <div id="noti-sentinel" class="empty" style="padding:20px">加载中…</div>
      </div>`;
      listEl.innerHTML = list.map(renderNoti).join('');
      document.getElementById('noti-list').appendChild(listEl);
      $('#mark-read')?.addEventListener('click', async () => {
        try {
          const ids = [];
          let p = 1, more = true;
          while (more && p <= 20) {
            const rr = await api('notifications', { params: { page: p, pageSize: 50 } });
            const dd = rr.data?.data || {};
            (dd.notifications || []).forEach(n => { if (!n.is_read && n.id) ids.push(n.id); });
            const tp = dd.total_pages || Math.ceil((dd.total || 0) / 50) || 1;
            more = p < tp;
            p++;
          }
          if (ids.length) await api('notifications/mark-read', { method: 'POST', body: { notification_ids: ids } });
          toast('已全部标记为已读', 'ok');
          refreshNotiBadge();
        } catch (e) { toast('操作失败,请重试', 'err'); }
      });
    }
    bindClicks(el);
    loading = false;
    return list.length > 0;
  };
  await load(false);
  const s2 = document.getElementById('noti-sentinel');
  if (!s2) return;
  try {
    const rr = await api('notifications', { params: { page: 1, pageSize: 50 } });
    const dd = rr.data?.data || {};
    const ids = (dd.notifications || []).filter(n => !n.is_read && n.id).map(n => n.id);
    if (ids.length) {
      await api('notifications/mark-read', { method: 'POST', body: { notification_ids: ids } });
      refreshNotiBadge();
    }
  } catch (e) {}
  const obs = new IntersectionObserver(async entries => {
    if (entries[0].isIntersecting) {
      if (ended) { s2.textContent = '— 已经到底啦 —'; obs.disconnect(); return; }
      const ok = await load(true);
      if (!ok && ended) { s2.textContent = '— 已经到底啦 —'; obs.disconnect(); }
    }
  }, { rootMargin: '300px' });
  obs.observe(s2);
  el._obs = obs;
};

views.messages = async (el, params) => {
  let page = 1, loading = false, ended = false;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const listEl = document.createElement('div');
  const sentinel = document.createElement('div');
  sentinel.className = 'empty';
  sentinel.style.padding = '20px';
  sentinel.textContent = '加载中…';
  const load = async (append) => {
    if (loading || ended) return;
    loading = true;
    const r = await api('messages', { params: { page, pageSize: 20 } });
    const d = r.data?.data || {};
    const list = d.list || [];
    const totalPages = d.total_pages || Math.ceil((d.total || 0) / 20) || 1;
    page++;
    ended = page > totalPages;
    const html = list.map(c => `
      <div class="conv" data-href="#/msg/${c.plid}${c.other_user && c.other_user.uid ? '?uid=' + c.other_user.uid : ''}">
        <div class="mid"><div class="subject">${esc(c.subject || '对话')}</div><div class="preview">${esc((typeof c.last_message === 'object' ? (c.last_message.summary || '') : c.last_message) || '')}</div></div>
        <span style="font-size:12px;color:var(--muted)">${fmtTime(c.last_time || c.dateline)}</span>
      </div>`).join('');
    if (append) {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      listEl.appendChild(wrap);
    } else {
      el.innerHTML = `<div class="card">
        <div style="padding:14px 18px;border-bottom:1px solid var(--border)"><b>私信</b></div>
        <div id="msg-list"></div>
        <div id="msg-sentinel" class="empty" style="padding:20px">加载中…</div>
      </div>`;
      listEl.innerHTML = html || '<div class="empty">暂无私信</div>';
      document.getElementById('msg-list').appendChild(listEl);
      el._firstPlids = new Set(list.map(c => String(c.plid)));
    }
    loading = false;
    return list.length > 0;
  };
  await load(false);
  autoReadAll();
  if (getAT()) {
    const timer = setInterval(async () => {
      const r = await api('messages', { params: { page: 1, pageSize: 20 } }).catch(() => null);
      const nl = r?.data?.data?.list || [];
      if (nl.length && nl.some(c => !el._firstPlids || !el._firstPlids.has(String(c.plid)))) {
        clearInterval(timer);
        refreshMsgBadge();
        views.messages(el, params);
      }
    }, 30000);
    el._timer = timer;
  }
  const s2 = document.getElementById('msg-sentinel');
  if (!s2) return;
  const obs = new IntersectionObserver(async entries => {
    if (entries[0].isIntersecting) {
      if (ended) { s2.textContent = '— 已经到底啦 —'; obs.disconnect(); return; }
      const ok = await load(true);
      if (!ok && ended) { s2.textContent = '— 已经到底啦 —'; obs.disconnect(); }
    }
  }, { rootMargin: '300px' });
  obs.observe(s2);
  bindClicks(el);
  el._obs = obs;
};

views.msg = async (el, params) => {
  const id = params.id;
  let otherUid = params.uid ? (parseInt(params.uid) || null) : null;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const [r, rl] = await Promise.all([
    api('messages/' + id, { params: { page: 1, pageSize: 50 } }),
    api('messages', { params: { page: 1, pageSize: 50 } }).catch(() => ({ status: 0, data: null })),
  ]);
  const d = r.data?.data || {};
  const list = (d.messages || []).slice().sort((a, b) => (a.dateline || 0) - (b.dateline || 0));
  const mine = ME?.uid;
  const isPlid = !!(d.plid && String(d.plid) === String(id));
  const convs = rl.data?.data?.list || rl.data?.data || [];
  if (!otherUid && Array.isArray(convs)) {
    const conv = convs.find(c => String(c.plid) === String(id));
    otherUid = conv?.other_user?.uid || null;
  }
  if (!otherUid && Array.isArray(d.members)) {
    const m = d.members.find(x => x && x.uid !== mine);
    otherUid = m?.uid || null;
  }
  if (!otherUid && list.length) {
    const otherMsg = list.find(m => m.author_id !== mine);
    otherUid = otherMsg?.author_id || null;
  }
  if (!otherUid && !isPlid) {
    otherUid = parseInt(id) || null;
  }
  el.innerHTML = `<div class="card">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border)"><b>${esc(d.subject || '对话')}</b></div>
    <div class="pm-scroll">${list.map(m => `<div class="msg-bubble ${m.author_id === mine ? 'mine' : 'theirs'}" data-pmid="${m.pmid}">${renderMsg(m.message)}<div style="font-size:11px;opacity:.6;margin-top:4px">${fmtTime(m.dateline)}${m.can_recall ? ' <a href="javascript:;" class="pm-recall" data-pmid="' + m.pmid + '" style="color:var(--muted)">撤回</a>' : ''}</div></div>`).join('') || '<div class="empty">暂无消息</div>'}</div>
    <div class="chat-box">
      <div class="chat-tool"><button class="btn smiley-btn" id="pm-smiley" type="button">${svgIcon('smile', 16)}表情</button></div>
      <div class="chat-row">
        <div class="ce-in ce-pm" contenteditable="true" id="pm-input" data-ph="输入消息…"></div>
        <button class="btn primary" id="pm-send">发送</button>
      </div>
    </div>
  </div>`;
  attachSmileyPicker($('#pm-input'), $('#pm-smiley'));
  $('#pm-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#pm-send').click(); }
  });
  $('#pm-send').onclick = async () => {
    const v = ceVal($('#pm-input'));
    if (!v) return;
    if (v.length > 1000) return toast('消息过长(最多1000字)', 'error');
    const targetUid = otherUid || (!isPlid ? (parseInt(id) || null) : null);
    if (!targetUid) return toast('无法确定对方用户', 'error');
    const r = await api('messages', { method: 'POST', body: { touserid: +targetUid, message: v } });
    if (r.data?.status === 'success' || r.status === 200) {
      toast('已发送', 'ok'); ceClear($('#pm-input'));
      const plid = r.data?.data?.plid || r.data?.plid;
      if (plid && String(plid) !== String(id)) location.hash = `#/msg/${plid}?uid=${targetUid}`;
      else views.msg(el, params);
    }
    else toast(r.data?.message || '发送失败', 'error');
  };
  const sc0 = el.querySelector('.pm-scroll');
  if (sc0) sc0.scrollTop = sc0.scrollHeight;
  el.querySelectorAll?.('.pm-recall').forEach(x => {
    x.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!confirm('确定撤回这条消息?')) return;
      const pmid = x.dataset.pmid;
      const r = await api('messages/' + pmid, { method: 'DELETE' });
      if (r.status === 200 || r.data?.status === 'success') { toast('已撤回', 'ok'); views.msg(el, params); }
      else toast(r.data?.message || '撤回失败', 'error');
    };
  });
  if (getAT()) {
    const lastPmid = () => {
      const ms = el.querySelectorAll('.pm-scroll .msg-bubble');
      return ms.length ? (ms[ms.length - 1].dataset.pmid || '') : '';
    };
    const timer = setInterval(async () => {
      const r = await api('messages/' + id, { params: { page: 1, pageSize: 50 } }).catch(() => null);
      const msgs = (r?.data?.data?.messages || []).slice().sort((a, b) => (a.dateline || 0) - (b.dateline || 0));
      if (!msgs.length) return;
      const newLast = msgs[msgs.length - 1];
      const curLastId = lastPmid();
      const newId = String(newLast.pmid || '');
      if (!curLastId || newId !== curLastId) {
        const sc = el.querySelector('.pm-scroll');
        const wasAtBottom = sc ? (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 30) : true;
        const pos = sc ? sc.scrollTop : 0;
        el._timer = null;
        await views.msg(el, params);
        const sc2 = el.querySelector('.pm-scroll');
        if (sc2) {
          if (wasAtBottom) sc2.scrollTop = sc2.scrollHeight;
          else sc2.scrollTop = pos;
        }
      }
    }, 15000);
    el._timer = timer;
  }
};

 views.videos = async (el, params) => {
   let page = 1, loading = false, ended = false;
   el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
   const entry = document.createElement('div');
   entry.className = 'shorts-entry';
   entry.innerHTML = `<a class="btn" href="#/shorts" style="width:100%;justify-content:center">▶ 竖屏模式</a>`;
   const grid = document.createElement('div');
  grid.className = 'videos';
  const sentinel = document.createElement('div');
  sentinel.className = 'empty';
  sentinel.style.padding = '20px';
  sentinel.textContent = '加载中…';
  const load = async (append) => {
    if (loading || ended) return;
    loading = true;
    const r = await api('homepage', { params: { page, pageSize: 18, sort: 'video' } });
    const d = r.data?.data || {};
    const list = d.list || [];
    const totalPages = d.total_pages || Math.ceil((d.total || 0) / 18) || 1;
    page++;
    ended = page > totalPages;
    if (append) {
      const wrap = document.createElement('div');
      wrap.style.display = 'contents';
      wrap.innerHTML = list.map(v => `
        <div class="video" data-href="#/v/${v.video_id}">
          <div class="thumb"><img src="${esc((v.images && v.images[0] && v.images[0].url) || '')}" loading="lazy" decoding="async" onerror="this.style.display='none'"><span class="dur">视频</span></div>
          <div class="info"><div class="title">${esc(v.subject)}</div>
          <div class="sub"><span>${esc(v.author || '')}</span><span>${fmtNum(v.views)} 浏览</span></div></div>
        </div>`).join('');
      grid.appendChild(wrap);
    } else {
      if (list.length) {
        grid.innerHTML = list.map(v => `
          <div class="video" data-href="#/v/${v.video_id}">
            <div class="thumb"><img src="${esc((v.images && v.images[0] && v.images[0].url) || '')}" loading="lazy" decoding="async" onerror="this.style.display='none'"><span class="dur">视频</span></div>
            <div class="info"><div class="title">${esc(v.subject)}</div>
            <div class="sub"><span>${esc(v.author || '')}</span><span>${fmtNum(v.views)} 浏览</span></div></div>
          </div>`).join('');
        el.innerHTML = '';
        el.appendChild(entry);
        el.appendChild(grid);
        el.appendChild(sentinel);
      } else {
        el.innerHTML = '<div class="empty">暂无视频</div>';
      }
    }
    bindClicks(el);
    loading = false;
    return list.length > 0;
  };
  await load(false);
  if (!el.querySelector('.videos')) return;
  const obs = new IntersectionObserver(async entries => {
    if (entries[0].isIntersecting) {
      if (ended) { sentinel.textContent = '— 已经到底啦 —'; obs.disconnect(); return; }
      sentinel.textContent = '加载中…';
      const ok = await load(true);
      if (!ok && ended) { sentinel.textContent = '— 已经到底啦 —'; obs.disconnect(); }
    }
  }, { rootMargin: '300px' });
  obs.observe(sentinel);
  el._obs = obs;
};

  views.video = async (el, params) => {
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const [dr, pr] = await Promise.all([
      api(`public/videos/${params.id}/detail`),
      api(`video/stream/${params.id}`).catch(() => ({ status: 0, data: null })),
    ]);
    const v = dr.data?.data?.video || dr.data?.data || {};
    const pv = pr.data || {};
    const cr = v.tid ? await api('thread/getThreadComments', { params: { tid: v.tid, page: 1, pageSize: 20 } }).catch(() => ({ status: 0, data: null })) : { status: 0, data: null };
    const comments = cr.data?.data || {};
    const list = comments.list || [];
    const playUrl = pv.url || '';
   el.innerHTML = `<div class="card" style="padding:20px 22px">
      <h2 style="font-size:20px;margin-bottom:12px">${esc(v.title)}${resTag(v.width, v.height) ? `<span class="res" style="vertical-align:2px">${resTag(v.width, v.height)}</span>` : ''}</h2>
     <div class="td-sub" style="border-bottom:0;padding-bottom:0">
       <img src="${esc(v.author_avatar || 'https://oss.lty.fan/avatar/default.png')}"><a href="#/u/${v.author_id}">${esc(v.author_name || v.author)}</a>
       <span>${fmtNum(v.view_count || v.play_count)} 播放</span><span>${fmtTime(v.created_at)}</span>
     </div>
      ${playUrl ? `<video id="v-main" controls preload="metadata" style="width:100%;border-radius:10px;margin-top:14px;background:#000" onerror="this.outerHTML='<div class=empty style=padding:40px;text-align:center;color:#888>视频已失效或暂不可用</div>'"></video>` : '<div class="empty">视频播放地址获取失败</div>'}
     ${v.description ? `<div style="margin-top:14px;color:#555f6e">${esc(v.description)}</div>` : ''}
     <div class="td-actions" style="margin-top:14px">
       <button class="btn like-btn ${v.user_attitude === 1 ? 'active-like' : ''}" data-action="attitude" data-v="1">${svgIcon('like')}赞 ${fmtNum(v.likes)}</button>
       <button class="btn ${v.user_attitude === -1 ? 'active-like' : ''}" data-action="attitude" data-v="-1">${svgIcon('dislike')}踩 ${fmtNum(v.dislikes)}</button>
       ${v.tid ? `<a class="btn" href="#/t/${v.tid}">查看原帖</a>` : ''}
     </div>
   </div>
   <div class="card">
     <div class="cmt-head">评论 (${comments.total || 0})</div>
     <div id="cmt-list">${list.length ? list.map(c => renderComment(c)).join('') : '<div class="empty">暂无评论</div>'}</div>
     <div class="compose-box">
       <div class="ce-in" contenteditable="true" id="cmt-input" data-ph="说点什么…"></div>
       <div class="row"><button class="btn smiley-btn" id="cmt-smiley" type="button">${svgIcon('smile', 16)}表情</button><button class="btn primary" id="cmt-send">发表评论</button></div>
     </div>
   </div>`;
    attachSmileyPicker($('#cmt-input'), $('#cmt-smiley'));
    if (playUrl) {
      const vMain = $('#v-main');
      if (vMain) playHls(vMain, playUrl, () => {
        vMain.outerHTML = '<div class="empty" style="padding:40px;text-align:center;color:#888">视频已失效或暂不可用</div>';
      });
    }
    let vReplyingTo = null;
    document.getElementById('cmt-list')?.addEventListener('click', async e => {
      const mb = e.target.closest('[data-more-pid]');
      if (mb) {
        const p = +mb.dataset.morePid;
        if (_expSubs.has(p)) _expSubs.delete(p); else _expSubs.add(p);
        views.video(el, params);
        return;
      }
      const rb = e.target.closest('[data-reply-pid]');
      const db = e.target.closest('[data-del-pid]');
      const lb = e.target.closest('[data-like-pid]');
      if (lb) {
        if (!getAT()) { toast('请先登录', 'error'); return; }
        const pid = +lb.dataset.likePid;
        const wasLiked = lb.classList.contains('liked');
        const r = await api('comment/attitude', { method: 'POST', body: { pid, attitude: wasLiked ? 0 : 1 } });
        if (r.data?.status === 'success') {
          toast(wasLiked ? '已取消点赞' : '已点赞', 'ok');
          const cnt = r.data.data?.like_count ?? Math.max(0, (+lb.dataset.likeCnt + (wasLiked ? -1 : 1)));
          lb.classList.toggle('liked', !wasLiked);
          lb.dataset.likeCnt = cnt;
          lb.querySelector('.lk-cnt').textContent = fmtNum(cnt || 0);
        } else toast(r.data?.message || '操作失败', 'error');
        return;
      }
      if (rb) {
        if (!getAT()) { toast('请先登录', 'error'); return; }
        vReplyingTo = { pid: +rb.dataset.replyPid, name: rb.dataset.replyName };
        const inp = $('#cmt-input');
        inp.focus(); cePh(inp, `回复 ${rb.dataset.replyName}…`);
        $('#cmt-send').textContent = `回复 ${rb.dataset.replyName}`;
        return;
      }
      if (db) {
        if (!getAT()) { toast('请先登录', 'error'); return; }
        if (!confirm('确定删除这条评论?')) return;
        const rr = await api(`posts/${db.dataset.delPid}`, { method: 'DELETE' });
        toast(rr.data?.status === 'success' ? '评论已删除' : rr.data?.message || '删除失败', rr.data?.status === 'success' ? 'ok' : 'error');
        views.video(el, params);
      }
    });
    $('#cmt-send').onclick = async () => {
      const val = ceVal($('#cmt-input'));
      if (!val) return toast('请输入内容', 'error');
      if (val.length > 2000) return toast('内容过长(最多2000字)', 'error');
      const body = { tid: +v.tid, message: val };
      if (vReplyingTo) body.pid = vReplyingTo.pid;
      const r = await api('post/postPosts', { method: 'POST', body });
      if (r.data && r.data.status === 'success') {
        toast('评论发布成功', 'ok');
        ceClear($('#cmt-input'));
        cePh($('#cmt-input'), '说点什么…');
        $('#cmt-send').textContent = '发表评论';
        vReplyingTo = null;
        views.video(el, params);
      }
      else toast(r.data?.message || '发布失败', 'error');
    };
   el.querySelector('.td-actions')?.addEventListener('click', async e => {
     const b = e.target.closest('[data-action]');
     if (!b || b.dataset.action !== 'attitude') return;
     const val = +b.dataset.v;
     const cur = v.user_attitude === val ? 0 : val;
     const r = await api(`threads/${v.tid}/attitude`, { method: 'POST', body: { attitude: cur } });
     toast(r.data?.status === 'success' ? (cur === 0 ? '已取消' : '已点赞') : r.data?.message || '操作失败', r.data?.status === 'success' ? 'ok' : 'error');
     views.video(el, params);
   });
 };

 views.shorts = async (el, params) => {
   const wrap = document.createElement('div');
   wrap.className = 'shorts';
    wrap.innerHTML = '<div class="top"><button class="x" id="sh-x">&times;</button><span class="idx" id="sh-idx"></span><div class="seg" id="sh-mode"><button data-m="normal" type="button">正常</button><button data-m="eco" type="button">省内存</button><button data-m="turbo" type="button">极速</button></div></div><div class="stage" id="sh-stage"></div><div class="side" id="sh-side"><button data-act="like"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg><span class="n">赞</span></button><button data-act="fav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"></path></svg><span class="n">收藏</span></button><button data-act="cmt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg><span class="n" id="cmt-cnt">评论</span></button><button data-act="thread"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg><span class="n">原帖</span></button></div><div class="panel" id="sh-panel"><div class="ph"><span>评论</span><button class="cl" id="sh-panel-close">&times;</button></div><div class="pl" id="sh-pl"></div><div class="pb"><div class="ce-in ce-sh" contenteditable="true" id="sh-cmt" data-ph="说点什么…"></div><button class="btn smiley-btn" id="sh-smiley" type="button">' + svgIcon('smile', 16) + '</button><button class="btn primary" id="sh-cmt-send">发送</button></div></div>';
   el.appendChild(wrap);
   document.body.style.overflow = 'hidden';
    let list = [], cur = 0, loading = false, ended = false, page = 1 + Math.floor(Math.random() * 6), detailCache = {}, playing = null, seenVids = new Set();
    const MODES = { normal: { W: 2, pre: 1, cap: 60, label: '正常' }, eco: { W: 1, pre: 0, cap: 20, label: '省内存' }, turbo: { W: 3, pre: 2, cap: 120, label: '极速' } };
    let mode = 'normal';
    try { const m = localStorage.getItem('vcy_short_mode'); if (MODES[m]) mode = m; } catch (e) {}
    const modeBtn = $('#sh-mode');
    const setMode = (m) => {
      mode = m;
      try { localStorage.setItem('vcy_short_mode', m); } catch (e) {}
      if (modeBtn) {
        modeBtn.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
        modeBtn.querySelector('.x2')?.remove();
      }
      const ks = Object.keys(detailCache);
      while (ks.length > MODES[m].cap) delete detailCache[ks.shift()];
      ensureWindow();
    };
    if (modeBtn) {
      modeBtn.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
      modeBtn.onclick = (ev) => {
        const btn = ev.target.closest('button[data-m]');
        if (!btn || btn.dataset.m === mode) return;
        setMode(btn.dataset.m);
        toast(`已切换到${MODES[mode].label}模式`, 'ok');
      };
    }
    const stage = $('#sh-stage');
    const shuffle = a => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const load = async () => {
      if (loading || ended) return;
      loading = true;
      let fresh = [];
      let guard = 0;
      while (!fresh.length && !ended && guard < 10) {
        guard++;
        const r = await api('homepage', { params: { page, pageSize: 18, sort: 'video' }, skipCache: true }).catch(() => ({ status: 0, data: null }));
        const d = r.data?.data || {};
        fresh = (d.list || []).filter(v => {
          if (!v || seenVids.has(v.video_id)) return false;
          seenVids.add(v.video_id);
          return true;
        });
        const tp = d.total_pages || Math.ceil((d.total || 0) / 18) || 1;
        page++;
        if (page > tp) ended = true;
      }
      const arr = shuffle(fresh);
      list = list.concat(arr);
      loading = false;
      ensureWindow();
    };
    const makeItem = (v, i) => {
      const d = document.createElement('div');
      d.className = 'item';
      d._idx = i;
      d.style.transform = `translateY(${(i - cur) * 100}%)`;
      d.innerHTML = `<div class="err" style="display:none"><span>视频加载失败</span><button class="btn" data-rl="1">重试</button></div><video playsinline preload="none"></video>
          <div class="info">
            <div class="t">${esc(v.subject || '')} <span class="res"></span></div>
            <div class="s"><a href="#/u/${v.author_id || ''}">@${esc(v.author || '')}</a><span>${fmtNum(v.views)} 浏览</span></div>
            <div class="desc"></div>
          </div>`;
      d.querySelector('video').addEventListener('click', () => {
        const vv = d.querySelector('video');
        if (vv.paused) vv.play().catch(() => {});
        else vv.pause();
      });
      return d;
    };
    const W = () => MODES[mode].W;
    const ensureWindow = () => {
      const lo = Math.max(0, cur - W()), hi = Math.min(list.length - 1, cur + W());
      const have = {};
      for (let j = stage.children.length - 1; j >= 0; j--) {
        const it = stage.children[j];
        if (it._idx < lo || it._idx > hi) {
          const vv = it.querySelector('video');
          if (vv) { vv.pause(); destroyHls(vv); vv.removeAttribute('src'); vv.load(); }
          it.remove();
        } else have[it._idx] = true;
      }
      for (let i = lo; i <= hi; i++) {
        if (!have[i] && list[i]) stage.appendChild(makeItem(list[i], i));
      }
      refreshInfo();
    };
    const refreshInfo = () => {
      const v = list[cur];
      $('#sh-idx').textContent = `${cur + 1} / ${list.length}${ended ? '' : '+'}`;
      if (!v) return;
      const items = stage.children;
      for (let i = 0; i < items.length; i++) {
        items[i].style.transform = `translateY(${(items[i]._idx - cur) * 100}%)`;
      }
      let item = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i]._idx === cur) { item = items[i]; break; }
      }
      if (!item) return;
      const vid = v.video_id;
      if (!item._vid) item._vid = vid;
      if (detailCache[vid]) applyDetail(item, detailCache[vid]);
      else api(`public/videos/${vid}/detail`).then(r => {
        const dd = r.data?.data?.video || r.data?.data || {};
        detailCache[vid] = dd;
        const ks = Object.keys(detailCache);
        while (ks.length > MODES[mode].cap) delete detailCache[ks.shift()];
        applyDetail(item, dd);
      }).catch(() => {});
      const err = item.querySelector('.err');
      const vidEl = item.querySelector('video');
      const tryPlay = () => {
        if (item._idx !== cur || !vidEl.isConnected) { vidEl.pause(); return; }
        vidEl.play().catch(e => {
          if (!e || e.name !== 'NotAllowedError') err.style.display = 'flex';
        });
        playing = vidEl;
      };
      if (!vidEl.src) {
        const retryOnce = () => {
          if (item._idx !== cur) return;
          if (!item._retried) {
            item._retried = true;
            api(`video/stream/${vid}`).then(r2 => {
              const u2 = (r2.data || {}).url || '';
              if (!u2 || item._idx !== cur) { err.style.display = 'flex'; return; }
              vidEl.dataset.src = u2;
              playHls(vidEl, u2, () => {
                if (item._idx !== cur) return;
                destroyHls(vidEl);
                vidEl.removeAttribute('src');
                vidEl.load();
                err.style.display = 'flex';
              });
              vidEl.play().catch(e2 => { if (!e2 || e2.name !== 'NotAllowedError') err.style.display = 'flex'; });
            }).catch(() => { err.style.display = 'flex'; });
          } else {
            err.style.display = 'flex';
          }
        };
        const applyUrl = (u) => {
          if (!u) { if (item._idx === cur) err.style.display = 'flex'; return; }
          vidEl.dataset.src = u;
          playHls(vidEl, u, () => {
            if (item._idx !== cur) return;
            destroyHls(vidEl);
            vidEl.removeAttribute('src');
            vidEl.load();
            retryOnce();
          });
          vidEl.onloadeddata = () => { if (item._idx === cur) err.style.display = 'none'; };
          tryPlay();
        };
        if (item._playUrl && Date.now() - (item._pt || 0) < 15000) {
          const u = item._playUrl;
          item._playUrl = '';
          applyUrl(u);
          api(`video/stream/${vid}`).then(r => {
            const u2 = (r.data || {}).url || '';
            if (u2 && item._idx === cur) { item._playUrl = u2; item._pt = Date.now(); }
          }).catch(() => {});
        } else {
          api(`video/stream/${vid}`).then(r => {
            applyUrl((r.data || {}).url || '');
          }).catch(() => { if (item._idx === cur) err.style.display = 'flex'; });
        }
      } else if (vidEl !== playing) {
        tryPlay();
      }
      for (const vv of stage.querySelectorAll('video')) {
        if (vv !== vidEl) vv.pause();
      }
      if (mode !== 'eco') {
        const pn = MODES[mode].pre;
        for (let k = 1; k <= pn; k++) { preload(cur + k); preload(cur - k); }
        const nx = list[cur + 1];
        if (nx && !detailCache[nx.video_id]) {
          api(`public/videos/${nx.video_id}/detail`).then(r => {
            const dd = r.data?.data?.video || r.data?.data || {};
            if (Object.keys(dd).length && !detailCache[nx.video_id]) {
              detailCache[nx.video_id] = dd;
              const ks = Object.keys(detailCache);
              while (ks.length > MODES[mode].cap) delete detailCache[ks.shift()];
            }
          }).catch(() => {});
        }
        if (mode === 'turbo') {
          const nx2 = list[cur + 2];
          if (nx2 && !detailCache[nx2.video_id]) {
            api(`public/videos/${nx2.video_id}/detail`).then(r => {
              const dd = r.data?.data?.video || r.data?.data || {};
              if (Object.keys(dd).length && !detailCache[nx2.video_id]) {
                detailCache[nx2.video_id] = dd;
                const ks = Object.keys(detailCache);
                while (ks.length > MODES[mode].cap) delete detailCache[ks.shift()];
              }
            }).catch(() => {});
          }
        }
      }
    };
    const preload = (i) => {
      if (i < 0 || i >= list.length) return;
      let nitem = null;
      for (let j = 0; j < stage.children.length; j++) {
        if (stage.children[j]._idx === i) { nitem = stage.children[j]; break; }
      }
      if (!nitem || nitem._playUrl) return;
      const vid = list[i].video_id;
      const turbo = mode === 'turbo';
      api(`video/stream/${vid}`).then(r => {
        const u = (r.data || {}).url || '';
        if (!u || nitem._playUrl) return;
        nitem._playUrl = u; nitem._pt = Date.now();
        if (turbo) {
          const vv = nitem.querySelector('video');
          vv.preload = 'auto';
          playHls(vv, u, () => {});
        }
      }).catch(() => {});
    };
    const applyDetail = (item, d) => {
      if (item._vid !== d.id) return;
      const side = $('#sh-side');
      const like = side.querySelector('[data-act="like"]');
      like.classList.toggle('on', d.user_attitude === 1);
      like.querySelector('.n').textContent = `赞 ${fmtNum(d.likes)}`;
      const fav = side.querySelector('[data-act="fav"]');
      fav.classList.toggle('on', !!d.is_favorite);
      fav.querySelector('.n').textContent = d.is_favorite ? '已收藏' : '收藏';
      const cnt = side.querySelector('[data-act="cmt"] .n');
      cnt.textContent = `评论 ${fmtNum(d.comment_count)}`;
      const desc = item.querySelector('.desc');
      desc.textContent = d.description || '';
      const resEl = item.querySelector('.res');
      if (resEl) {
        const tag = resTag(d.width, d.height);
        resEl.textContent = tag;
        resEl.style.display = tag ? 'inline-block' : 'none';
      }
      if (d.width && d.height && d.height > d.width) {
        const v = item.querySelector('video');
        v.style.width = 'auto';
      }
      item._detail = d;
    };
    const goto = (i) => {
      if (i < 0 || i >= list.length) return;
      if (i >= list.length - 3) load();
      cur = i;
      ensureWindow();
    };
   stage.addEventListener('wheel', e => {
     e.preventDefault();
     if (Math.abs(e.deltaY) < 12) return;
     if (e.deltaY > 0) goto(cur + 1);
     else goto(cur - 1);
   }, { passive: false });
   let ty = null;
   stage.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
   stage.addEventListener('touchend', e => {
     if (ty === null) return;
     const dy = e.changedTouches[0].clientY - ty;
     if (Math.abs(dy) > 50) goto(dy < 0 ? cur + 1 : cur - 1);
     ty = null;
   }, { passive: true });
    const closeShorts = () => {
      document.body.style.overflow = '';
      location.hash = '#/videos';
    };
    $('#sh-x').onclick = closeShorts;
    wrap.addEventListener('click', async e => {
     const rb = e.target.closest('[data-rl]');
      if (rb) {
        rb.closest('.err').style.display = 'none';
        const it = rb.closest('.item');
        it._retried = false;
        const vv = it.querySelector('video');
        vv.removeAttribute('src');
        vv.load();
        const vid = (list[cur] || {}).video_id;
        if (!vid) { rb.closest('.err').style.display = 'flex'; return; }
        api(`video/stream/${vid}`).then(r => {
          const u = (r.data || {}).url || '';
          if (!u) { rb.closest('.err').style.display = 'flex'; return; }
          vv.dataset.src = u;
          playHls(vv, u, () => { rb.closest('.err').style.display = 'flex'; });
          vv.play().catch(e => {
            if (!e || e.name !== 'NotAllowedError') rb.closest('.err').style.display = 'flex';
          });
        }).catch(() => { rb.closest('.err').style.display = 'flex'; });
        return;
      }
      const b = e.target.closest('[data-act]');
      let cv = null;
      for (let i = 0; i < stage.children.length; i++) {
        if (stage.children[i]._idx === cur) { cv = stage.children[i]; break; }
      }
      const v = list[cur];
      const d = cv?._detail || {};
     if (!b) return;
     const act = b.dataset.act;
      if (act === 'like') {
        if (!v?.tid) return toast('无法操作', 'error');
        const curV = (detailCache[v.video_id] || {}).user_attitude === 1 ? 0 : 1;
        const r = await api(`threads/${v.tid}/attitude`, { method: 'POST', body: { attitude: curV } });
        if (r.data?.status === 'success') {
          if (detailCache[v.video_id]) detailCache[v.video_id].user_attitude = curV;
          const lb = $('#sh-side').querySelector('[data-act="like"]');
          if (lb) {
            lb.classList.toggle('on', curV === 1);
            const lc = r.data?.data?.like_count ?? (detailCache[v.video_id] || {}).likes ?? 0;
            lb.querySelector('.n').textContent = `赞 ${fmtNum(lc)}`;
          }
          refreshInfo();
          toast(curV ? '已点赞' : '已取消', 'ok');
        } else toast(r.data?.message || '操作失败', 'error');
      } else if (act === 'fav') {
       const r = await api('collections', { method: 'GET' });
       const cols = r.data?.data?.collections || r.data?.data || [];
       if (!cols.length) {
         const c = await api('collections', { method: 'POST', body: { title: '默认收藏夹' } });
         if (c.status !== 201 && c.status !== 200) return toast('创建收藏夹失败', 'error');
         cols.push({ id: c.data?.data?.id, title: '默认收藏夹' });
       }
       const r2 = await api(`collections/${cols[0].id}/items`, { method: 'POST', body: { content_type: 'thread', content_id: +v.tid } });
       if (r2.status === 201 || r2.status === 200) {
         if (detailCache[v.video_id]) detailCache[v.video_id].is_favorite = true;
         refreshInfo();
         toast('已收藏', 'ok');
       } else toast(r2.data?.message || '收藏失败', 'error');
     } else if (act === 'cmt') {
       openPanel();
     } else if (act === 'thread') {
       if (v?.tid) location.hash = '#/t/' + v.tid;
       else toast('无原帖', 'error');
     }
   });
   const panel = $('#sh-panel');
   const openPanel = async () => {
     panel.classList.add('open');
     const v = list[cur];
     const d = stage.children[cur]?._detail || {};
     const pl = $('#sh-pl');
     pl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
     const tid = v?.tid;
     if (!tid) { pl.innerHTML = '<div class="empty">无法加载评论</div>'; return; }
      const r = await api('thread/getThreadComments', { params: { tid, page: 1, pageSize: 20 } }).catch(() => ({ status: 0, data: null }));
      const c = r.data?.data || {};
      const l = c.list || [];
      pl.innerHTML = l.length ? l.map(c => renderComment(c)).join('') : '<div class="empty">暂无评论</div>';
      let replyingTo = null;
      pl.onclick = async ev => {
        const mb = ev.target.closest('[data-more-pid]');
        if (mb) {
          const p = +mb.dataset.morePid;
          if (_expSubs.has(p)) _expSubs.delete(p); else _expSubs.add(p);
          openPanel();
          return;
        }
        const rb = ev.target.closest('[data-reply-pid]');
        const db = ev.target.closest('[data-del-pid]');
        if (rb) {
          if (!getAT()) { toast('请先登录', 'error'); return; }
          replyingTo = { pid: +rb.dataset.replyPid, name: rb.dataset.replyName };
          const inp = $('#sh-cmt');
          inp.focus(); cePh(inp, `回复 ${rb.dataset.replyName}…`);
          $('#sh-cmt-send').textContent = `回复 ${rb.dataset.replyName}`;
          return;
        }
        if (db) {
          if (!getAT()) { toast('请先登录', 'error'); return; }
          if (!confirm('确定删除这条评论?')) return;
          const rr = await api(`posts/${db.dataset.delPid}`, { method: 'DELETE' });
          toast(rr.data?.status === 'success' ? '评论已删除' : rr.data?.message || '删除失败', rr.data?.status === 'success' ? 'ok' : 'error');
          openPanel();
        }
      };
      if (!document.getElementById('sh-smiley')._spBound) {
        attachSmileyPicker($('#sh-cmt'), $('#sh-smiley'));
        document.getElementById('sh-smiley')._spBound = true;
      }
      $('#sh-cmt-send').onclick = async () => {
        const val = ceVal($('#sh-cmt'));
        if (!val) return toast('请输入内容', 'error');
        if (val.length > 2000) return toast('内容过长(最多2000字)', 'error');
        const body = { tid: +tid, message: val };
        if (replyingTo) body.pid = replyingTo.pid;
        const rr = await api('post/postPosts', { method: 'POST', body });
        if (rr.data && rr.data.status === 'success') {
          toast('评论发布成功', 'ok');
          ceClear($('#sh-cmt'));
          cePh($('#sh-cmt'), '说点什么…');
          $('#sh-cmt-send').textContent = '发送';
          replyingTo = null;
          openPanel();
        }
        else toast(rr.data?.message || '发布失败', 'error');
      };
   };
   $('#sh-panel-close').onclick = () => panel.classList.remove('open');
   document.addEventListener('keydown', shKey);
   function shKey(e) {
     if (!wrap.parentNode) { document.removeEventListener('keydown', shKey); return; }
     if (e.key === 'Escape') { if (panel.classList.contains('open')) panel.classList.remove('open'); else closeShorts(); }
     else if (!panel.classList.contains('open') && (e.key === 'ArrowDown')) goto(cur + 1);
     else if (!panel.classList.contains('open') && (e.key === 'ArrowUp')) goto(cur - 1);
   }
   load();
 };

views.collections = async (el, params) => {
  const uid = params.uid || (ME && ME.uid);
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let list = [];
  if (uid) {
    const r = await api(`users/${uid}/collections`, { params: { page: 1, pageSize: 20 } });
    list = r.data?.data?.collections || r.data?.data?.list || r.data?.data || [];
  } else {
    const r = await api('collections');
    list = r.data?.data?.collections || r.data?.data || [];
  }
  const isMine = uid ? (ME && String(uid) === String(ME.uid)) : !!ME;
  el.innerHTML = `<div class="card">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <b>收藏夹</b>${isMine ? '<button class="btn" id="new-col">新建</button>' : ''}
    </div>
    ${list.length ? list.map(c => `<div class="col-item" data-href="#/col/${c.id}"><span class="t">${esc(c.title)}</span><span class="c">${fmtNum(c.item_count || c.count || 0)} 项</span></div>`).join('') : '<div class="empty">暂无收藏夹</div>'}
  </div>`;
  $('#new-col')?.addEventListener('click', async () => {
    const title = prompt('收藏夹名称');
    if (!title) return;
    const r = await api('collections', { method: 'POST', body: { title } });
    if (r.status === 201) { toast('已创建', 'ok'); views.collections(el, params); }
    else toast(r.data?.message || '创建失败', 'error');
  });
  bindClicks(el);
};

views.col = async (el, params) => {
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const r = await api('collections/' + params.id);
  const d = r.data?.data || {};
  const items = d.items || d.contents || [];
  el.innerHTML = `<div class="card">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <b>${esc(d.title || '收藏夹')}</b>
      ${ME ? '<button class="btn danger" id="del-col">删除</button>' : ''}
    </div>
    ${items.length ? items.map(it => `
      <div class="conv" data-href="#/t/${it.content_id || it.thread_id || it.tid}">
        <div class="mid"><div class="subject">${esc(it.title || it.thread_title || it.subject || '帖子')}</div></div>
      </div>`).join('') : '<div class="empty">暂无内容</div>'}
  </div>`;
  $('#del-col')?.addEventListener('click', async () => {
    if (!confirm('确定删除该收藏夹?')) return;
    const r = await api('collections/' + params.id, { method: 'DELETE' });
    toast(r.status === 200 ? '已删除' : '删除失败', r.status === 200 ? 'ok' : 'error');
    if (r.status === 200) location.hash = '#/collections';
  });
  bindClicks(el);
};

views.ranking = async (el, params) => {
  const type = params.type === 'week' ? 'week' : 'total';
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const r = await api('ranking', { params: { type }, skipCache: true });
  const d = r.data?.data || {};
  const items = d.items || [];
  const medal = ['1', '2', '3'];
  const fmtTs = ts => {
    if (!ts) return '';
    const d2 = new Date(ts * 1000);
    return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
  };
  el.innerHTML = `<div class="card">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px;font-weight:700">帖子排行榜</span>
        <span id="rk-info" class="rk-info" title="查看算法说明"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg></span>
        <span style="margin-left:auto;font-size:12px;color:var(--muted)">${d.updated_at ? '更新于 ' + new Date(d.updated_at * 1000).toLocaleString() : ''}</span>
      </div>
      <div class="rk-mode" id="rk-mode" style="margin-top:10px">
        <a href="#/ranking" class="${type === 'total' ? 'on' : ''}">总榜</a>
        <a href="#/ranking?type=week" class="${type === 'week' ? 'on' : ''}">周榜</a>
      </div>
    </div>
    <div id="rk-list">${items.length ? items.map((x, i) => `
      <div class="rk-item" data-href="#/t/${x.tid}">
        <span class="rk-rank ${i === 0 ? 'rk-1' : i === 1 ? 'rk-2' : i === 2 ? 'rk-3' : ''}">${medal[i] || (i + 1)}</span>
        <span class="rk-main">
          <span class="rk-title">${esc(x.subject) || '(无标题)'}</span>
          <span class="rk-sub">${esc(x.author || '')}${x.forum_name ? ' · ' + esc(x.forum_name) : ''}${x.digest ? ' · <span class="digest-badge">精</span>' : ''}</span>
        </span>
        <span class="rk-score">${fmtNum(x.score)}<small>分</small></span>
      </div>`).join('') : '<div class="empty">暂无数据</div>'}</div>
  </div>`;
  const modeEl = $('#rk-mode');
  if (modeEl) modeEl.onclick = (ev) => {
    const a = ev.target.closest('a[href]');
    if (a) { location.hash = a.getAttribute('href'); route(true); }
  };
  $('#rk-info')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const ov = document.createElement('div');
    ov.className = 'sv-pop';
    ov.innerHTML = `<div class="sv-pop-card">
      <button class="rk-info-x" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:18px;color:var(--muted);cursor:pointer;line-height:1">×</button>
      <div class="sv-pop-t">排行榜算法说明</div>
      <div class="sv-pop-d" style="font-size:13px;line-height:1.9">
        综合分 = 浏览 × 1 + 点赞 × 3 + 评论 × 5<br><br>
        总榜:统计全站帖子<br>
        周榜:仅统计 7 天内发布的帖子<br><br>
        数据每小时更新一次<br>
        ${d.updated_at ? '上次更新:' + new Date(d.updated_at * 1000).toLocaleString() : ''}
      </div>
      <div class="sv-pop-b"><button class="btn primary rk-info-ok" style="flex:1">知道了</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('.rk-info-x')?.addEventListener('click', close);
    ov.querySelector('.rk-info-ok')?.addEventListener('click', close);
    ov.addEventListener('click', (ev) => { if (ev.target === ov) close(); });
  });
  bindClicks(el);
};

views.search = async (el, params) => {
  const kw = params.q || '';
  const type = params.type || 'thread';
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const r = await api('search', { params: { q: kw, type } });
  const d = r.data?.data || {};
  let threads = d.results?.threads || d.threads || [];
  const users = d.results?.users || d.users || [];
  threads = threads.map(t => {
    if (typeof t.subject === 'string') {
      t.subject = t.subject.replace(/<mark>([^<]*)<\/mark>/gi, (m, s) => `%%HILITE%%${s}%%/HILITE%%`);
    }
    return t;
  });
  el.innerHTML = `<div class="card">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border)">
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="search-page-input" placeholder="搜索帖子 / 用户…" value="${esc(kw)}" style="flex:1;border:1px solid var(--border);border-radius:10px;padding:10px 12px;font:inherit;outline:none">
        <button class="btn primary" id="search-page-btn">搜索</button>
      </div>
      <b>搜索: ${esc(kw)}</b> <span style="color:var(--muted);font-size:13px">共 ${d.total || 0} 条</span>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn ${type === 'thread' ? 'primary' : ''}" id="sw-thread">帖子</button>
        <button class="btn ${type === 'user' ? 'primary' : ''}" id="sw-user">用户</button>
      </div>
    </div>
    ${type === 'thread' ? (threads.length ? threads.map(renderThreadItem).join('') : '<div class="empty">无结果</div>')
      : (users.length ? `<div class="card">${users.map(u => `<div class="conv" data-href="#/u/${u.uid}"><img src="${esc(avatar(u))}"><div class="mid"><div class="subject">${esc(u.username)}</div></div></div>`).join('')}</div>` : '<div class="empty">无结果</div>')}
  </div>`;
  attachDynamicPrefetch(el);
  $('#sw-thread')?.addEventListener('click', () => { location.hash = `#/search?q=${encodeURIComponent(kw)}&type=thread`; });
  $('#sw-user')?.addEventListener('click', () => { location.hash = `#/search?q=${encodeURIComponent(kw)}&type=user`; });
  const doSearch = () => {
    const q = $('#search-page-input')?.value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}&type=${type}`;
  };
  $('#search-page-btn')?.addEventListener('click', doSearch);
  $('#search-page-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  bindClicks(el);
};

function openPinManager() {
  const ov = document.createElement('div');
  ov.className = 'sv-pop';
  ov.innerHTML = `<div class="sv-pop-card" style="max-width:480px">
    <button class="pin-mgr-x" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:18px;color:var(--muted);cursor:pointer;line-height:1">×</button>
    <div class="sv-pop-t">置顶管理</div>
    <div class="sv-pop-d" style="font-size:13px">
      <div style="display:flex;gap:8px;margin-bottom:14px" class="pin-mgr-row">
        <input id="pm-tid" type="number" placeholder="帖子 tid" style="flex:1;height:34px;padding:0 10px;border:1px solid var(--border);border-radius:8px;font:inherit;outline:none;min-width:0">
        <input id="pm-hours" type="number" placeholder="置顶小时" style="width:90px;height:34px;padding:0 10px;border:1px solid var(--border);border-radius:8px;font:inherit;outline:none;min-width:0">
        <button class="btn primary" id="pm-add" style="flex-shrink:0">置顶</button>
      </div>
      <div id="pm-list" style="display:flex;flex-direction:column;gap:8px"><div class="empty" style="padding:10px">加载中…</div></div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('.pin-mgr-x')?.addEventListener('click', close);
  ov.addEventListener('click', (ev) => { if (ev.target === ov) close(); });

  const listEl = ov.querySelector('#pm-list');
  const render = (items) => {
    if (!items.length) { listEl.innerHTML = '<div class="empty" style="padding:10px">暂无置顶帖子</div>'; return; }
    listEl.innerHTML = items.map(p => `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8fafc;border:1px solid var(--border);border-radius:8px">
      <span style="flex:1;min-width:0"><b>tid ${p.tid}</b><span style="color:var(--muted);font-size:12px;margin-left:8px">剩余 ${p.remain_hours} 小时</span></span>
      <button class="btn" data-del-tid="${p.tid}" style="height:28px;padding:0 10px;font-size:12px;color:#e03e3e">取消</button>
    </div>`).join('');
    listEl.querySelectorAll('[data-del-tid]').forEach(btn => {
      btn.onclick = async () => {
        const r = await api('pin-manage', { method: 'DELETE', body: { tid: +btn.dataset.delTid } });
        toast(r.data?.status === 'success' ? '已取消置顶' : r.data?.message || '操作失败', r.data?.status === 'success' ? 'ok' : 'error');
        load();
      };
    });
  };
  const load = async () => {
    const r = await api('pin-manage', { method: 'GET', skipCache: true });
    render(r.data?.data || []);
  };
  ov.querySelector('#pm-add').onclick = async () => {
    const tid = ov.querySelector('#pm-tid').value.trim();
    const hours = ov.querySelector('#pm-hours').value.trim();
    if (!tid || !hours) return toast('请填写 tid 和置顶小时数', 'error');
    const r = await api('pin-manage', { method: 'POST', body: { tid: +tid, hours: +hours } });
    if (r.data?.status === 'success') {
      toast(r.data?.message || '已置顶', 'ok');
      ov.querySelector('#pm-tid').value = '';
      ov.querySelector('#pm-hours').value = '';
      load();
    } else toast(r.data?.message || '操作失败', 'error');
  };
  load();
}

function showFeedbackModal(opt) {
  opt = opt || {};
  const ov = document.createElement('div');
  ov.id = 'fb-pop';
  ov.className = 'sv-pop';
  ov.innerHTML = `<div class="sv-pop-card">
    <button class="fb-pop-x" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:18px;color:var(--muted);cursor:pointer;line-height:1" title="关闭">×</button>
    <div class="sv-pop-t" style="text-align:center">${esc(opt.title || '优化反馈')}</div>
    <div class="sv-pop-d" style="font-size:13px;line-height:2">${opt.body || ''}</div>
    <div class="sv-pop-b">
      <button class="btn primary fb-pop-ok" style="flex:1">${esc(opt.btn || '好的,这就去看看')}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => {
    ov.remove();
    try { localStorage.setItem(opt.seenKey || 'vcy_feedback_seen', '1'); } catch (e) {}
    showUpdateModal();
  };
  ov.querySelector('.fb-pop-ok')?.addEventListener('click', close);
  ov.querySelector('.fb-pop-x')?.addEventListener('click', close);
}

function showUpdateModal() {
  try {
    if (ME && !document.getElementById('fb-pop')) {
      if (Number(ME.uid) === 10803 && !localStorage.getItem('vcy_feedback_seen')) {
        showFeedbackModal({
          title: '优化反馈',
          body: `你在问卷里建议的<b>帖子排行榜</b>已经上线啦:<br>
            · 总榜 / 周榜,每小时更新<br>
            · 综合分 = 浏览×1 + 点赞×3 + 评论×5<br>
            · 点击导航栏的奖杯图标即可查看<br><br>
            感谢你对 V次元 的支持,以后有任何想法,都可以通过页面底部的<b>反馈建议</b>随时告诉我们～`,
          btn: '好的,这就去看看',
          seenKey: 'vcy_feedback_seen',
        });
        return;
      }
      if (Number(ME.uid) === 16370 && !localStorage.getItem('vcy_feedback_seen_hist')) {
        showFeedbackModal({
          title: '优化反馈',
          body: `你提的<b>浏览历史</b>已经上线啦:<br>
            · 同步官网记录,帖子看过就能在主页看到<br>
            · 用户主页新增「浏览历史」标签,点开即看<br>
            · 每条都带标题、作者和时间,点一下直接跳回帖子<br><br>
            感谢你对 V次元 的支持,以后有任何想法,都可以通过页面底部的<b>反馈建议</b>随时告诉我们～`,
          btn: '好的,这就去看看',
          seenKey: 'vcy_feedback_seen_hist',
        });
        return;
      }
    }
  } catch (e) {}
  try {
    const cfg = window.VCY_UPDATES;
    if (!cfg || !cfg.version || !cfg.items || !cfg.items.length) {
      setTimeout(showSurveyModal, 700);
      return;
    }
    if (localStorage.getItem('vcy_update_seen') === String(cfg.version)) {
      setTimeout(showSurveyModal, 700);
      return;
    }
    if (document.getElementById('up-pop')) return;
    const ov = document.createElement('div');
    ov.id = 'up-pop';
    ov.className = 'sv-pop';
    ov.innerHTML = `<div class="sv-pop-card">
      <button id="up-pop-x" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:18px;color:var(--muted);cursor:pointer;line-height:1" title="关闭">×</button>
      <div class="sv-pop-t">${esc(cfg.title || 'V次元 更新')}</div>
      <div class="sv-pop-d"><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;max-height:44vh;overflow-y:auto">${cfg.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>
      <div class="sv-pop-b">
        <button class="btn primary" id="up-pop-ok" style="flex:1">知道了</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => {
      ov.remove();
      try { localStorage.setItem('vcy_update_seen', String(cfg.version)); } catch (e) {}
      setTimeout(showSurveyModal, 400);
    };
    $('#up-pop-ok')?.addEventListener('click', close);
    $('#up-pop-x')?.addEventListener('click', close);
  } catch (e) {
    setTimeout(showSurveyModal, 700);
  }
}

function showSurveyModal() {
  try {
    if (localStorage.getItem('vcy_survey_done')) return;
    const ds = localStorage.getItem('vcy_survey_dismissed');
    if (ds && Date.now() - Number(ds) < 86400000 * 7) return;
    if (sessionStorage.getItem('sv_seen')) return;
    sessionStorage.setItem('sv_seen', '1');
    localStorage.setItem('vcy_survey_dismissed', String(Date.now()));
  } catch (e) {}
  if (document.getElementById('sv-pop') || document.getElementById('up-pop') || document.getElementById('fb-pop')) return;
  const ov = document.createElement('div');
  ov.id = 'sv-pop';
  ov.className = 'sv-pop';
  ov.innerHTML = `<div class="sv-pop-card">
    <button id="sv-pop-x" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:18px;color:var(--muted);cursor:pointer;line-height:1" title="关闭">×</button>
    <div class="sv-pop-t">V次元 用户问卷</div>
    <div class="sv-pop-d">我们在努力让 V次元变得更好!花 1 分钟告诉我们你的想法,你的每一条建议都会被认真看到。</div>
    <div class="sv-pop-b">
      <button class="btn primary" id="sv-pop-go" style="flex:1.4">填写问卷</button>
      <button class="btn" id="sv-pop-later" style="flex:1">7天后再说</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  $('#sv-pop-go')?.addEventListener('click', () => { ov.remove(); location.hash = '#/survey'; });
  $('#sv-pop-later')?.addEventListener('click', () => { ov.remove(); });
  $('#sv-pop-x')?.addEventListener('click', () => { ov.remove(); });
};

views.survey = async (el) => {
  el.innerHTML = `<div class="card login-box">
    <h2>用户问卷</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">花 1 分钟帮我们做得更好</p>
    <div class="field" style="text-align:left;margin-top:16px">
      <label>1. 你是怎么知道本站的?</label>
      <select id="sv-src" style="width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;background:var(--card)">
        <option value="">请选择</option>
        <option>朋友推荐</option>
        <option>搜索引擎</option>
        <option>原站跳转/官方渠道</option>
        <option>论坛/贴吧/群聊</option>
        <option>其他</option>
      </select>
    </div>
    <div class="field" style="text-align:left">
      <label>2. 你使用本站的频率?</label>
      <select id="sv-freq" style="width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;background:var(--card)">
        <option value="">请选择</option>
        <option>每天</option>
        <option>每周几次</option>
        <option>偶尔</option>
        <option>第一次来</option>
      </select>
    </div>
    <div class="field" style="text-align:left">
      <label>3. 你最常用哪些功能?(可多选)</label>
      <div id="sv-feats" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
        <button type="button" class="sv-f" data-v="浏览帖子">浏览帖子</button>
        <button type="button" class="sv-f" data-v="看视频">看视频</button>
        <button type="button" class="sv-f" data-v="竖屏短视频">竖屏短视频</button>
        <button type="button" class="sv-f" data-v="私信">私信</button>
        <button type="button" class="sv-f" data-v="发帖/评论">发帖/评论</button>
        <button type="button" class="sv-f" data-v="表情包">表情包</button>
      </div>
    </div>
    <div class="field" style="text-align:left">
      <label>4. 你期望新增什么功能?</label>
      <textarea id="sv-want" rows="3" placeholder="如: 深色模式、消息实时推送、排行榜…(选填)" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;resize:vertical;font-family:inherit;font-size:14px"></textarea>
    </div>
    <div class="field" style="text-align:left">
      <label>5. 有什么建议或意见?</label>
      <textarea id="sv-sug" rows="3" placeholder="随便说,我们都看(选填)" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;resize:vertical;font-family:inherit;font-size:14px"></textarea>
    </div>
    <div class="hint" id="sv-err" style="display:none;color:var(--danger);text-align:left"></div>
    <div style="margin-top:20px"><button class="btn primary" id="sv-submit" style="width:100%">提交问卷</button></div>
  </div>`;
  $('#sv-submit')?.addEventListener('click', async () => {
    const src = $('#sv-src').value, freq = $('#sv-freq').value;
    if (!src || !freq) { const e = $('#sv-err'); e.style.display = 'block'; e.textContent = '请先选择前两个问题'; return; }
    const feats = [...document.querySelectorAll('.sv-f.on')].map(b => b.dataset.v);
    if (!feats.length) { const e = $('#sv-err'); e.style.display = 'block'; e.textContent = '请至少选一个常用功能'; return; }
    try {
      const r = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(ME?.uid || '') },
        body: JSON.stringify({ answers: { src, freq, feats, want: $('#sv-want').value.trim(), sug: $('#sv-sug').value.trim() } }),
      });
      const d = await r.json();
      if (d.status === 'success') {
        try { localStorage.setItem('vcy_survey_done', '1'); localStorage.removeItem('vcy_survey_dismissed'); } catch (e) {}
        el.innerHTML = `<div class="card login-box"><h2 style="color:var(--ok)">已提交</h2><p style="color:var(--muted);font-size:13px">感谢参与!你的回答会帮助本站变得更好。</p><div style="margin-top:20px"><button class="btn primary" style="width:100%" data-href="#/">返回首页</button></div></div>`;
        bindClicks(el);
      } else {
        const e = $('#sv-err'); e.style.display = 'block'; e.textContent = d.message || '提交失败';
      }
    } catch (err) {
      const e = $('#sv-err'); e.style.display = 'block'; e.textContent = '提交失败:网络错误';
    }
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.sv-f');
    if (b) b.classList.toggle('on');
  });
};

views.feedback = async (el) => {
  el.innerHTML = `<div class="card login-box">
    <h2>反馈建议</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">遇到 bug 或有建议?告诉我们</p>
    <div class="tabs" style="margin-top:0">
      <button id="fb-type-bug">Bug</button>
      <button id="fb-type-suggestion" class="active">建议</button>
    </div>
    <div class="field" style="text-align:left;margin-top:16px">
      <label>内容</label>
      <textarea id="fb-content" rows="5" placeholder="请描述你遇到的问题或建议…" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;resize:vertical;font-family:inherit;font-size:14px"></textarea>
    </div>
    <div class="field" style="text-align:left">
      <label>联系方式(选填)</label>
      <input id="fb-contact" type="text" placeholder="邮箱 / QQ / 微信号">
    </div>
    <div class="hint" id="fb-err" style="display:none;color:var(--danger);text-align:left"></div>
    <div style="margin-top:20px"><button class="btn primary" id="fb-submit" style="width:100%">提交</button></div>
  </div>`;
  let type = 'suggestion';
  $('#fb-type-bug')?.addEventListener('click', () => { type = 'bug'; $('#fb-type-bug').classList.add('active'); $('#fb-type-suggestion')?.classList.remove('active'); });
  $('#fb-type-suggestion')?.addEventListener('click', () => { type = 'suggestion'; $('#fb-type-suggestion').classList.add('active'); $('#fb-type-bug')?.classList.remove('active'); });
  $('#fb-submit')?.addEventListener('click', async () => {
    const content = $('#fb-content').value.trim();
    if (!content) { const e = $('#fb-err'); e.style.display = 'block'; e.textContent = '内容不能为空'; return; }
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(ME?.uid || '') },
        body: JSON.stringify({ type, content, contact: $('#fb-contact').value.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        el.innerHTML = `<div class="card login-box"><h2 style="color:var(--ok)">已提交</h2><p style="color:var(--muted);font-size:13px">感谢你的反馈,我们会尽快处理。</p><div style="margin-top:20px"><button class="btn primary" style="width:100%" data-href="#/">返回首页</button></div></div>`;
        bindClicks(el);
      } else {
        const e = $('#fb-err'); e.style.display = 'block'; e.textContent = d.message || '提交失败';
      }
    } catch (err) {
      const e = $('#fb-err'); e.style.display = 'block'; e.textContent = '提交失败:网络错误';
    }
  });
};

views.login = async (el) => {
  let state = 'idle';
  try {
    const r = await fetch('/api/auth/status');
    const d = await r.json();
    state = d.logged_in ? 'in' : 'out';
  } catch (e) {}
  el.innerHTML = `<div class="card login-box">
    <h2>登录 V次元</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">使用你的 V次元账号登录</p>
    ${state === 'in' ? `
      <div style="text-align:left;font-size:13px;color:#555f6e;line-height:2">
        <div>· 当前状态: <b style="color:var(--ok)" id="lg-state">已登录</b></div>
      </div>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:center">
        <button class="btn" data-href="#/">返回首页</button>
        <button class="btn danger" id="lg-logout">退出登录</button>
      </div>` : `
      <div class="tabs" style="margin-top:0">
        <button id="tab-pw" class="active">账号密码</button>
        <button id="tab-qr">扫码登录</button>
      </div>
      <div id="lg-pw-panel">
        <div class="field" style="text-align:left">
          <label>账号(邮箱 / 用户名 / 手机号)</label>
          <input id="lg-account" type="text" placeholder="请输入账号" autocomplete="username">
        </div>
        <div class="field" style="text-align:left">
          <label>密码</label>
          <input id="lg-password" type="password" placeholder="请输入密码" autocomplete="current-password">
        </div>
        <div class="hint" id="lg-err" style="display:none;color:var(--danger);text-align:left"></div>
        <div style="margin-top:20px"><button class="btn primary" id="lg-submit" style="width:100%">登 录</button></div>
      </div>
      <div id="lg-qr-panel" style="display:none">
        <div style="text-align:center;padding:10px 0">
          <div id="lg-qr-box" style="display:inline-block;background:#fff;padding:12px;border-radius:10px;border:1px solid var(--border)"><div class="loading"><div class="spinner"></div></div></div>
          <div id="lg-qr-tip" style="margin-top:10px;font-size:13px;color:var(--muted)">请使用 V次元 App 扫码登录</div>
        </div>
      </div>`}
  </div>`;
  const submit = $('#lg-submit');
  const err = $('#lg-err');
  const doLogin = async () => {
    const account = $('#lg-account').value.trim();
    const password = $('#lg-password').value;
    if (!account || !password) { err.style.display = 'block'; err.textContent = '请输入账号和密码'; return; }
    submit.disabled = true; submit.textContent = '登录中…';
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password }),
      });
      const d = await r.json();
      if (d.status === 'success') {
        setTokens(d.access_token, d.refresh_token || '');
        toast('登录成功', 'ok');
        await loadMe();
        location.hash = '#/';
      }
      else { err.style.display = 'block'; err.textContent = d.message || '登录失败'; }
    } catch (e) { err.style.display = 'block'; err.textContent = '网络错误: ' + e.message; }
    submit.disabled = false; submit.textContent = '登 录';
  };
  submit?.addEventListener('click', doLogin);
  $('#lg-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#lg-logout')?.addEventListener('click', async () => {
    clearTokens();
    toast('已退出登录', 'ok'); loadMe(); location.hash = '#/';
  });

  // 扫码登录
  let qrTimer = null;
  const qrToken = { cur: '' };
  const stopQr = () => { if (qrTimer) { clearInterval(qrTimer); qrTimer = null; } };
  const startQr = async () => {
    const box = $('#lg-qr-box');
    const tip = $('#lg-qr-tip');
    try {
      const g = await fetch('/api/auth/qr/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const gd = await g.json();
      if (!gd.data || !gd.data.qr_url) { tip.textContent = '二维码获取失败'; return; }
      qrToken.cur = gd.data.token;
      box.innerHTML = '';
      const qrSize = Math.min(340, (window.innerWidth || 375) - 80);
      const cv = document.createElement('canvas');
      await QRCode.toCanvas(cv, gd.data.qr_url, { width: qrSize, margin: 4, errorCorrectionLevel: 'H' });
      box.appendChild(cv);
      tip.textContent = '请使用 V次元 App 扫码登录(10 秒内有效,过期自动刷新)';
      let scanned = false;
      stopQr();
      qrTimer = setInterval(async () => {
        if (!qrToken.cur) return;
        try {
          const s = await fetch('/api/auth/qr/status?token=' + encodeURIComponent(qrToken.cur));
          const sd = await s.json();
          const st = sd.data?.status;
          if (st === 'pending') { if (tip.textContent.startsWith('请使用')) tip.textContent = '请使用 V次元 App 扫码登录…'; return; }
          if (st === 'confirmed' || (sd.data && sd.data.access_token)) {
            stopQr();
            const tk = sd.data.access_token;
            if (tk) {
              const c = await fetch('/api/auth/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: qrToken.cur, access_token: tk }) });
              const cd = await c.json();
              if (cd.status === 'success') { setTokens(cd.access_token || tk, ''); toast('登录成功', 'ok'); await loadMe(); location.hash = '#/'; }
              else tip.textContent = '登录失败: ' + (cd.message || '');
            } else {
              tip.textContent = '扫码成功,正在登录…';
            }
          } else if (st === 'expired') { startQr(); }
        } catch (e) {}
      }, 5000);
    } catch (e) { tip.textContent = '二维码生成失败: ' + (e.message || ''); }
  };
  $('#tab-pw')?.addEventListener('click', () => {
    $('#tab-pw').classList.add('active'); $('#tab-qr').classList.remove('active');
    $('#lg-pw-panel').style.display = ''; $('#lg-qr-panel').style.display = 'none';
    stopQr();
  });
  $('#tab-qr')?.addEventListener('click', () => {
    $('#tab-qr').classList.add('active'); $('#tab-pw').classList.remove('active');
    $('#lg-pw-panel').style.display = 'none'; $('#lg-qr-panel').style.display = '';
    startQr();
  });
  bindClicks(el);
};

/* ============ 路由 ============ */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [pathPart, query] = h.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  const params = {};
  if (query) for (const kv of query.split('&')) { const [k, v] = kv.split('='); if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
  return { seg, params };
}

function bindClicks(el) {
  el.querySelectorAll?.('[data-viewer]').forEach(x => {
    x.onclick = e => { e.stopPropagation(); openViewer(x.dataset.viewer); };
  });
  el.querySelectorAll?.('[data-href]').forEach(x => {
    x.onclick = e => { e.stopPropagation(); location.hash = x.dataset.href; };
  });
  el.querySelectorAll?.('[data-tid]').forEach(x => {
    x.onclick = () => { location.hash = x.dataset.href; };
  });
  el.querySelectorAll?.('[data-fid]').forEach(x => {
    x.onclick = () => { location.hash = '#/f/' + x.dataset.fid; };
  });
  el.querySelectorAll?.('img').forEach(x => {
    if (!x._errBound) {
      x._errBound = true;
      x.onerror = () => { if (x.dataset.err === '1') return; x.dataset.err = '1'; x.src = ''; x.style.display = 'none'; };
    }
  });
}

let lastRoute = '';
const _scrollPos = {};
const _domCache = {};
const DOM_CACHE_TTL = 60000;
const DOM_CACHE_KEYS = ['home', 'new', 'forums', 'search', 'f', 'cols', 'vids', 'ucol'];
function isDomCacheKey(k) {
  return DOM_CACHE_KEYS.some(p => k === p || k.startsWith(p));
}
let _touchScroll = false, _touchScrollAt = 0;
document.addEventListener('touchmove', () => { _touchScroll = true; _touchScrollAt = Date.now(); }, { passive: true });
document.addEventListener('touchstart', () => { _touchScroll = false; }, { passive: true });
document.addEventListener('click', (ev) => {
  if (_smileyPanel && !_smileyPanel.contains(ev.target)) {
    const b = ev.target.closest && ev.target.closest('.smiley-btn');
    if (!b) { _smileyPanel.remove(); _smileyPanel = null; }
  }
}, true);
document.addEventListener('click', (e) => {
  if (_touchScroll && Date.now() - _touchScrollAt < 800) {
    e.preventDefault();
    e.stopPropagation();
    _touchScroll = false;
  }
}, true);

document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && !t.dataset.er) {
    t.dataset.er = '1';
    t.style.display = 'none';
  }
}, true);

async function route(force) {
  const { seg, params } = parseHash();
  const main = $('#main');
  document.body.style.overflow = '';
  let view = views.home, key = 'home' + (params.page || '') + (params.fid || '');
  if (seg[0] === 'u' && seg[1] && seg[2] === 'collections') { view = views.collections; params.uid = seg[1]; key = 'ucol' + seg[1]; }
  else if (seg[0] === 't' && seg[1]) { view = views.thread; params.tid = seg[1]; key = 't' + seg[1] + (params.page || ''); }
  else if (seg[0] === 'new') { view = views.latest; key = 'new'; }
  else if (seg[0] === 'forums') { view = views.forums; key = 'forums'; }
  else if (seg[0] === 'f' && seg[1]) { params.fid = seg[1]; key = 'f' + seg[1] + (params.page || ''); }
  else if (seg[0] === 'u' && seg[1]) { view = views.u; params.uid = seg[1]; key = 'u' + seg[1]; }
  else if (seg[0] === 'u' && seg[1] === undefined) { view = views.u; params.uid = ME?.uid; key = 'me' + (ME?.uid || ''); }
  else if (seg[0] === 'compose') { view = views.compose; key = 'compose'; }
  else if (seg[0] === 'notifications') { view = views.notifications; key = 'noti' + (params.page || ''); }
  else if (seg[0] === 'messages') { view = views.messages; key = 'msgs' + (params.page || ''); }
  else if (seg[0] === 'msg' && seg[1]) { view = views.msg; params.id = seg[1]; key = 'msg' + seg[1]; }
   else if (seg[0] === 'videos') { view = views.videos; key = 'vids' + (params.page || ''); }
   else if (seg[0] === 'shorts') { view = views.shorts; key = 'shorts'; }
  else if (seg[0] === 'v' && seg[1]) { view = views.video; params.id = seg[1]; key = 'v' + seg[1]; }
  else if (seg[0] === 'collections') { view = views.collections; key = 'cols'; }
  else if (seg[0] === 'col' && seg[1]) { view = views.col; params.id = seg[1]; key = 'col' + seg[1]; }
  else if (seg[0] === 'search') { view = views.search; key = 'search' + (params.q || '') + (params.type || ''); }
  else if (seg[0] === 'login') { view = views.login; key = 'login'; }
  else if (seg[0] === 'feedback') { view = views.feedback; key = 'feedback'; }
  else if (seg[0] === 'ranking') { view = views.ranking; params.type = params.type; key = 'ranking' + (params.type || 'total'); }
  else if (seg[0] === 'survey') { view = views.survey; key = 'survey'; }

  if (key === lastRoute && !force) return;
  if (lastRoute) _scrollPos[lastRoute] = window.scrollY;

  const cached = _domCache[key];
  if (cached && Date.now() - cached.ts < DOM_CACHE_TTL && cached.el.isConnected === false) {
    main.innerHTML = '';
    main.appendChild(cached.el);
    delete _domCache[key];
    if (cached.obs && !main._obs) main._obs = cached.obs;
    attachDynamicPrefetch(main);
    lastRoute = key;
    window.scrollTo(0, _scrollPos[key] || 0);
    setTimeout(() => window.scrollTo(0, _scrollPos[key] || 0), 120);
    return;
  }
  delete _domCache[key];

  const cur = main.firstElementChild;
  if (cur && !cur.classList.contains('loading') && isDomCacheKey(lastRoute)) {
    _domCache[lastRoute] = { el: cur, obs: main._obs, ts: Date.now() };
    main._obs = null;
  }
  if (main._obs) { main._obs.disconnect(); main._obs = null; }
  main.querySelectorAll('.thread[data-tid]').forEach(x => { if (x._pf) { x._pf.disconnect(); x._pf = null; } });
  if (main._timer) { clearInterval(main._timer); main._timer = null; }
  lastRoute = key;
  if (view === views.u && !params.uid) { main.innerHTML = '<div class="empty">请先登录</div>'; return; }
  if (!params.uid && !params.tid && ['u', 'msg', 'col'].includes(seg[0]) && !ME) { main.innerHTML = '<div class="empty">请先登录</div>'; return; }
  if (!FORUMS.length) {
    api('forums').then(r => { if (r.data?.data) { FORUMS = r.data.data; cacheForums(); if (key === 'home') route(); } }).catch(() => {});
  }
  main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    await view(main, params);
    const tt = main.querySelector('.thread-title, .video .title, .td-title, .conv .subject, .col-item .subject');
    if (tt && tt.textContent.trim()) document.title = tt.textContent.trim().slice(0, 40) + ' - V次元';
    else document.title = (key === 'new' ? '最新' : key.startsWith('f') ? '版块' : key.startsWith('v') ? '视频' : key.startsWith('msg') ? '私信' : key.startsWith('shorts') ? '竖屏' : '首页') + ' - V次元';
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty">加载出错: ${esc(e.message)}</div>`;
  }
  window.scrollTo(0, _scrollPos[key] || 0);
  if (_scrollPos[key]) {
    setTimeout(() => window.scrollTo(0, _scrollPos[key] || 0), 120);
    setTimeout(() => window.scrollTo(0, _scrollPos[key] || 0), 500);
  }
}

$('#search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    location.hash = '#/search?q=' + encodeURIComponent(e.target.value.trim());
  }
});

document.addEventListener('paste', (e) => {
  const ce = e.target.closest?.('.ce-in');
  if (!ce) return;
  e.preventDefault();
  const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, txt);
});

window.addEventListener('hashchange', route);
loadMe().then(() => { route(); setTimeout(showUpdateModal, 800); });
setTimeout(() => { fetch('/api/ranking?type=total').catch(() => {}); }, 1000);
getSmileyMap();
setInterval(refreshNotiBadge, 60000);
setInterval(refreshMsgBadge, 60000);
setInterval(() => { if (getAT() && getRT()) tryRefresh(); }, 25 * 60 * 1000);
