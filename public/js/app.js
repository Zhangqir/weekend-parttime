// 前端入口：hash 路由 + 视图渲染（命名链路与后端 / api 层 / store 层一一对应）
import { useAuthStore, useJobStore, useApplicationStore, useReviewStore } from './store.js';

const CATEGORY = { catering: '餐饮', retail: '零售', promotion: '促销', delivery: '配送', tutor: '家教', other: '其他' };
const WAGE_TYPE = { hourly: '时薪', daily: '日薪', piece: '计件' };
const JOB_STATUS = { draft: '草稿', published: '已发布', matched: '已满员', completed: '已完成', settled: '已结算', cancelled: '已取消' };
const APP_STATUS = { pending: '待确认', accepted: '已接受', rejected: '已拒绝', checked_in: '已签到', finished: '已完成', no_show: '爽约', cancelled: '已取消' };

const $app = () => document.getElementById('app');
const $header = () => document.getElementById('app-header');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = (status, map) => `<span class="badge ${esc(status)}">${esc(map[status] || status)}</span>`;
const fmtDate = (s) => (s ? s : '-');

function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('当前环境不支持定位'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (e) => reject(new Error('定位失败：' + e.message + '（请允许定位权限）')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ---------- 路由 ----------
function currentRoute() {
  const parts = (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  return { name: parts[0] || 'home', arg: parts[1] || null };
}

function render() {
  const { name, arg } = currentRoute();
  renderHeader(name);
  const app = $app();
  if (name === 'login') return renderLogin(app);
  if (name === 'register') return renderRegister(app);
  if (name === 'job' && arg) return renderJobDetail(app, arg);
  if (name === 'student') return renderStudent(app);
  if (name === 'merchant') return renderMerchant(app);
  if (name === 'profile') return renderProfile(app);
  renderHome(app);
}

// ---------- Header ----------
function renderHeader(active) {
  const u = useAuthStore.user;
  const links = [`<a class="nav-link ${active === 'home' ? 'active' : ''}" href="#/">首页</a>`];
  if (u) {
    if (u.role === 'student') links.push(`<a class="nav-link ${active === 'student' ? 'active' : ''}" href="#/student">我的兼职</a>`);
    if (u.role === 'merchant') links.push(`<a class="nav-link ${active === 'merchant' ? 'active' : ''}" href="#/merchant">商家后台</a>`);
    const name = u.real_name || u.shop_name || u.phone;
    links.push(`<button class="btn-sm" data-action="logout" style="background:rgba(255,255,255,.22);color:#fff">退出 · ${esc(name)}</button>`);
  } else {
    links.push(`<a class="nav-link ${active === 'login' ? 'active' : ''}" href="#/login">登录</a>`);
    links.push(`<a class="nav-link ${active === 'register' ? 'active' : ''}" href="#/register">注册</a>`);
  }
  $header().innerHTML = `<div class="topbar"><div class="topbar-inner">
    <div class="brand" onclick="location.hash='#/'"><span class="logo">💼</span>周末兼职</div>
    <nav>${links.join('')}</nav>
  </div></div>`;
}

// ---------- 首页 ----------
const filters = { category: 'all', q: '', sort: 'default' };

async function renderHome(app) {
  app.innerHTML = `
    <form class="filter-bar" data-action="filter">
      <input name="q" placeholder="搜索岗位 / 地点 / 关键词…" value="${esc(filters.q)}" />
      <select name="category">
        <option value="all">全部分类</option>
        ${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}" ${filters.category === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <select name="sort">
        <option value="default" ${filters.sort === 'default' ? 'selected' : ''}>最新发布</option>
        <option value="wage" ${filters.sort === 'wage' ? 'selected' : ''}>薪资最高</option>
        <option value="date" ${filters.sort === 'date' ? 'selected' : ''}>日期最近</option>
      </select>
      <button class="btn btn-primary" type="submit">筛选</button>
    </form>
    <div id="job-list"><div class="empty">加载中…</div></div>`;

  const jobs = await useJobStore.list(filters);
  const listEl = app.querySelector('#job-list');
  if (!jobs.jobs.length) {
    listEl.innerHTML = `<div class="empty">暂无符合条件的岗位</div>`;
    return;
  }
  listEl.innerHTML = `<div class="grid jobs">${jobs.jobs.map(jobCard).join('')}</div>`;
}

function jobCard(j) {
  const full = j.acceptedCount >= j.headcount;
  return `<div class="card" style="cursor:pointer" onclick="location.hash='#/job/${j.id}'">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <h3>${esc(j.title)}</h3>
      <span class="chip">${esc(CATEGORY[j.category] || j.category)}</span>
    </div>
    <div class="wage">¥${j.wage}<small>/${esc(WAGE_TYPE[j.wageType] || j.wageType)}</small></div>
    <div class="meta">
      <span>📅 ${fmtDate(j.workDate)} ${esc(j.startTime)}-${esc(j.endTime)}</span>
      <span>📍 ${esc(j.location)}</span>
    </div>
    <div class="meta">
      <span>已招 <b>${j.acceptedCount}/${j.headcount}</b></span>
      <span>${esc(j.shopName || '')}</span>
      <span>${full ? '<b style="color:var(--green)">已满员</b>' : badge(j.status, JOB_STATUS)}</span>
    </div>
  </div>`;
}

// ---------- 登录 / 注册 ----------
function renderLogin(app) {
  app.innerHTML = `<div class="form"><div class="auth-box">
    <h2>登录</h2>
    <p class="muted">使用手机号登录平台</p>
    <form data-action="login">
      <div class="field"><label>手机号</label><input name="phone" placeholder="例如 13800000001" required /></div>
      <div class="field"><label>密码</label><input name="password" type="password" required /></div>
      <button class="btn btn-primary btn-block" type="submit">登录</button>
    </form>
    <div class="auth-switch">还没有账号？<a href="#/register">立即注册</a></div>
    <div class="auth-switch muted">演示：学生 13800000001 / 商家 13800000002，密码均为 123456</div>
  </div></div>`;
}

function renderRegister(app) {
  app.innerHTML = `<div class="form wide"><div class="auth-box">
    <h2>注册</h2>
    <p class="muted">学生找兼职，商家招人，一个账号搞定</p>
    <form data-action="register">
      <div class="field"><label>角色</label>
        <select name="role"><option value="student">我是学生（找兼职）</option><option value="merchant">我是商家（招人）</option></select>
      </div>
      <div class="field"><label>手机号</label><input name="phone" required /></div>
      <div class="field"><label>密码（至少 6 位）</label><input name="password" type="password" required /></div>
      <div class="row">
        <div class="field" data-if="student"><label>姓名</label><input name="realName" placeholder="你的姓名" /></div>
        <div class="field" data-if="student"><label>学校</label><input name="school" /></div>
        <div class="field" data-if="merchant"><label>店铺名称</label><input name="shopName" /></div>
        <div class="field" data-if="merchant"><label>联系人</label><input name="contactPerson" /></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">注册</button>
    </form>
    <div class="auth-switch">已有账号？<a href="#/login">去登录</a></div>
  </div></div>`;

  const roleSel = app.querySelector('select[name=role]');
  const sync = () => {
    const r = roleSel.value;
    app.querySelectorAll('[data-if]').forEach((el) => { el.style.display = el.dataset.if === r ? '' : 'none'; });
  };
  roleSel.addEventListener('change', sync);
  sync();
}

// ---------- 岗位详情 ----------
async function renderJobDetail(app, id) {
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const { job } = await useJobStore.detail(id);
  const u = useAuthStore.user;
  const full = job.acceptedCount >= job.headcount;

  app.innerHTML = `<div class="hero">
    <div class="detail-head">
      <div>
        <div style="margin-bottom:8px">${badge(job.status, JOB_STATUS)} <span class="chip">${esc(CATEGORY[job.category] || job.category)}</span></div>
        <h1 style="margin:0 0 6px">${esc(job.title)}</h1>
        <div class="muted">${esc(job.shopName || '')} · 发布于 ${fmtDate(job.createdAt?.slice(0, 10))}</div>
      </div>
      <div class="wage">¥${job.wage}<small style="color:rgba(255,255,255,.85)">/${esc(WAGE_TYPE[job.wageType] || job.wageType)}</small></div>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="num">${job.acceptedCount}/${job.headcount}</div><div class="lbl">已招 / 需要</div></div>
    <div class="stat"><div class="num">${esc(job.workDate)}</div><div class="lbl">工作日期</div></div>
    <div class="stat"><div class="num">${esc(job.startTime)}</div><div class="lbl">开始时间</div></div>
    <div class="stat"><div class="num">${esc(job.endTime)}</div><div class="lbl">结束时间</div></div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="meta"><span>📍 ${esc(job.location)}</span></div>
    <h3 style="margin:8px 0 4px">岗位描述</h3>
    <p style="white-space:pre-wrap">${esc(job.description || '（暂无描述）')}</p>
    ${job.requirements ? `<h3 style="margin:12px 0 4px">任职要求</h3><p style="white-space:pre-wrap">${esc(job.requirements)}</p>` : ''}
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap" id="detail-actions"></div>
  </div>

  <div class="card"><h3 style="margin:0 0 8px">评价（${0}）</h3><div id="review-list"><div class="muted">加载中…</div></div></div>`;

  const actions = app.querySelector('#detail-actions');
  if (u && u.role === 'student' && !full) {
    actions.innerHTML = `<button class="btn btn-primary" data-action="apply" data-id="${job.id}">一键报名</button>`;
  } else if (full) {
    actions.innerHTML = `<span class="muted">该岗位已满员</span>`;
  } else if (!u) {
    actions.innerHTML = `<a class="btn btn-primary" href="#/login">登录后报名</a>`;
  } else if (u.role === 'merchant') {
    actions.innerHTML = `<span class="muted">商家账号请前往「商家后台」管理</span>`;
  }

  try {
    const { reviews } = await useReviewStore.forJob(id);
    app.querySelector('#review-list').innerHTML = reviews.length
      ? reviews.map((r) => `<div class="review-item">
          <div><b>${esc(r.fromName || '用户')}</b> <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></div>
          <div class="muted">${esc(r.comment || '')}</div></div>`).join('')
      : '<div class="muted">暂无评价</div>';
  } catch { /* 忽略评价加载失败 */ }
}

// ---------- 学生中心 ----------
async function renderStudent(app) {
  app.innerHTML = `<div class="section-title"><h2>我的报名</h2><a class="btn btn-ghost" href="#/">去逛逛岗位</a></div>
    <div id="apps"><div class="empty">加载中…</div></div>`;

  const { applications } = await useApplicationStore.mine();
  const el = app.querySelector('#apps');
  if (!applications.length) {
    el.innerHTML = `<div class="empty">还没有报名记录，<a href="#/">去看看岗位</a></div>`;
    return;
  }
  el.innerHTML = applications.map((a) => `
    <div class="list-item">
      <div class="info">
        <div style="display:flex;gap:8px;align-items:center">
          <b>${esc(a.jobTitle)}</b>${badge(a.status, APP_STATUS)}
        </div>
        <div class="meta"><span>📅 ${fmtDate(a.workDate)} ${esc(a.startTime)}-${esc(a.endTime)}</span><span>📍 ${esc(a.location)}</span></div>
      </div>
      <div class="actions">${appActions(a)}</div>
    </div>`).join('');
}

function appActions(a) {
  const b = [];
  if (a.status === 'pending') b.push(`<button class="btn btn-danger btn-xs" data-action="cancel" data-id="${a.id}">取消报名</button>`);
  if (a.status === 'accepted') b.push(`<button class="btn btn-green btn-xs" data-action="checkin" data-id="${a.id}">到岗签到</button>`);
  if (a.status === 'finished') b.push(`<button class="btn btn-ghost btn-xs" data-action="review" data-id="${a.id}" data-jobid="${a.jobId}">评价商家</button>`);
  return b.join('');
}

// ---------- 商家后台 ----------
async function renderMerchant(app) {
  app.innerHTML = `<div class="section-title"><h2>商家后台</h2><button class="btn btn-primary" data-action="toggleForm">＋ 发布新岗位</button></div>
    <div id="create-form" style="display:none"></div>
    <div id="my-jobs"><div class="empty">加载中…</div></div>`;
  await refreshMerchantJobs(app);
}

function merchantForm() {
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="card" style="margin-bottom:18px"><h3>发布新岗位</h3>
    <form data-action="createJob" class="form" style="margin:0;max-width:none">
      <div class="field"><label>岗位标题</label><input name="title" required placeholder="例如：周末奶茶店店员" /></div>
      <div class="row">
        <div class="field"><label>分类</label><select name="category">${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>结算方式</label><select name="wageType">${Object.entries(WAGE_TYPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div>
      <div class="row">
        <div class="field"><label>薪资（时薪/日薪/计件单价）</label><input name="wage" type="number" required placeholder="22" /></div>
        <div class="field"><label>需要人数</label><input name="headcount" type="number" required min="1" value="1" /></div>
      </div>
      <div class="row">
        <div class="field"><label>工作日期</label><input name="workDate" type="date" required value="${today}" /></div>
        <div class="field"><label>工作地点</label><input name="location" required placeholder="大学城商业街 12 号" /></div>
      </div>
      <div class="row">
        <div class="field"><label>开始时间</label><input name="startTime" type="time" required value="09:00" /></div>
        <div class="field"><label>结束时间</label><input name="endTime" type="time" required value="18:00" /></div>
      </div>
      <div class="field"><label>岗位描述</label><textarea name="description"></textarea></div>
      <div class="field"><label>任职要求</label><textarea name="requirements"></textarea></div>
      <button class="btn btn-primary" type="submit">保存为草稿</button>
    </form></div>`;
}

async function refreshMerchantJobs(app) {
  const { jobs } = await useJobStore.mine();
  const el = app.querySelector('#my-jobs');
  if (!jobs.length) { el.innerHTML = `<div class="empty">还没有岗位，点右上角「发布新岗位」开始</div>`; return; }
  el.innerHTML = jobs.map((j) => `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div><b>${esc(j.title)}</b> ${badge(j.status, JOB_STATUS)}
          <div class="meta"><span>已招 <b>${j.acceptedCount}/${j.headcount}</b></span><span>📅 ${fmtDate(j.workDate)}</span><span>¥${j.wage}/${esc(WAGE_TYPE[j.wageType] || j.wageType)}</span></div>
        </div>
        <div class="actions">
          ${j.status === 'draft' ? `<button class="btn btn-primary btn-xs" data-action="publish" data-id="${j.id}">发布</button>` : ''}
          ${j.status === 'published' ? `<button class="btn btn-danger btn-xs" data-action="jobCancel" data-id="${j.id}">取消</button>` : ''}
          ${j.status === 'matched' ? `<button class="btn btn-green btn-xs" data-action="jobStatus" data-id="${j.id}" data-status="completed">标记完成</button>` : ''}
          ${j.status === 'completed' ? `<button class="btn btn-green btn-xs" data-action="jobStatus" data-id="${j.id}" data-status="settled">结算</button>` : ''}
          ${['published', 'matched'].includes(j.status) ? `<button class="btn btn-ghost btn-xs" data-action="manage" data-id="${j.id}">管理报名</button>` : ''}
        </div>
      </div>
      <div class="app-slot" data-job="${j.id}" style="margin-top:12px"></div>
    </div>`).join('');
}

async function loadApplications(slot) {
  const jobId = slot.dataset.job;
  slot.innerHTML = `<div class="muted">加载报名中…</div>`;
  const { applications } = await useApplicationStore.forJob(jobId);
  if (!applications.length) { slot.innerHTML = `<div class="muted">暂无报名</div>`; return; }
  slot.innerHTML = applications.map((a) => `
    <div class="list-item" style="margin-bottom:8px;padding:12px 14px">
      <div class="info">
        <b>${esc(a.studentName)}</b> <span class="muted">${esc(a.school || '')}</span> ${badge(a.status, APP_STATUS)}
        ${a.message ? `<div class="muted">留言：${esc(a.message)}</div>` : ''}
      </div>
      <div class="actions">
        ${a.status === 'pending' ? `<button class="btn btn-primary btn-xs" data-action="accept" data-id="${a.id}">接受</button><button class="btn btn-danger btn-xs" data-action="reject" data-id="${a.id}">拒绝</button>` : ''}
        ${a.status === 'accepted' ? `<button class="btn btn-amber btn-xs" data-action="noShow" data-id="${a.id}">标记爽约</button>` : ''}
        ${a.status === 'checked_in' ? `<button class="btn btn-green btn-xs" data-action="finish" data-id="${a.id}">标记完成</button>` : ''}
        ${a.status === 'finished' ? `<button class="btn btn-ghost btn-xs" data-action="review" data-id="${a.id}" data-jobid="${a.jobId}" data-to="${a.studentId}" data-who="${esc(a.studentName)}">评价学生</button>` : ''}
      </div>
    </div>`).join('');
}

// ---------- 个人资料 ----------
function renderProfile(app) {
  const u = useAuthStore.user;
  if (!u) { app.innerHTML = `<div class="empty">请先<a href="#/login">登录</a></div>`; return; }
  const rows = u.role === 'student'
    ? [['姓名', u.real_name], ['学校', u.school], ['年级', u.grade], ['评分', u.rating], ['完成次数', u.total_jobs]]
    : [['店铺', u.shop_name], ['地址', u.address], ['联系人', u.contact_person], ['评分', u.rating]];
  app.innerHTML = `<div class="card" style="max-width:480px;margin:24px auto">
    <h2>个人资料</h2>
    <p class="muted">角色：${u.role === 'student' ? '学生' : '商家'} · 手机号 ${esc(u.phone)}</p>
    ${rows.map(([k, v]) => `<div class="list-item"><span class="muted">${k}</span><b>${esc(v ?? '—')}</b></div>`).join('')}
    <button class="btn btn-danger btn-block" data-action="logout" style="margin-top:12px">退出登录</button>
  </div>`;
}

// ---------- 事件处理 ----------
const handlers = {
  logout() { useAuthStore.logout(); toast('已退出登录'); render(); },

  async login(form) {
    const d = Object.fromEntries(new FormData(form));
    try {
      const u = await useAuthStore.login(d.phone, d.password);
      toast('欢迎回来，' + (u.real_name || u.shop_name || u.phone));
      location.hash = u.role === 'merchant' ? '#/merchant' : '#/student';
    } catch (e) { toast(e.message, true); }
  },

  async register(form) {
    const d = Object.fromEntries(new FormData(form));
    const payload = { phone: d.phone, password: d.password, role: d.role };
    if (d.role === 'student') Object.assign(payload, { realName: d.realName, school: d.school });
    else Object.assign(payload, { shopName: d.shopName, contactPerson: d.contactPerson });
    try {
      await useAuthStore.register(payload);
      toast('注册成功');
      location.hash = d.role === 'merchant' ? '#/merchant' : '#/student';
    } catch (e) { toast(e.message, true); }
  },

  async filter(form) {
    const d = Object.fromEntries(new FormData(form));
    filters.category = d.category; filters.q = d.q; filters.sort = d.sort;
    render();
  },

  async apply(el) {
    const id = el.dataset.id;
    const msg = prompt('给商家留句话（可选）', '');
    if (msg === null) return;
    try {
      await useApplicationStore.apply(id, msg);
      toast('报名成功，等待商家确认');
      setTimeout(render, 300);
    } catch (e) { toast(e.message, true); }
  },

  async cancel(el) {
    if (!confirm('确定取消这次报名吗？')) return;
    try { await useApplicationStore.update(el.dataset.id, 'cancelled'); toast('已取消'); render(); }
    catch (e) { toast(e.message, true); }
  },

  async checkin(el) {
    try {
      const pos = await getPosition();
      await useApplicationStore.checkin(el.dataset.id, pos.latitude, pos.longitude);
      toast('签到成功 ✅');
      render();
    } catch (e) { toast(e.message, true); }
  },

  async accept(el) { await merchantAct(el.dataset.id, 'accepted'); },
  async reject(el) { await merchantAct(el.dataset.id, 'rejected'); },
  async noShow(el) { await merchantAct(el.dataset.id, 'no_show'); },
  async finish(el) { await merchantAct(el.dataset.id, 'finish'); },

  async publish(el) {
    try { await useJobStore.publish(el.dataset.id); toast('已发布'); render(); }
    catch (e) { toast(e.message, true); }
  },
  async jobCancel(el) {
    if (!confirm('确定取消该岗位吗？')) return;
    try { await fetch(`/api/jobs/${el.dataset.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('wp_token') }, body: JSON.stringify({ status: 'cancelled' }) }); toast('已取消'); render(); }
    catch (e) { toast(e.message, true); }
  },
  async jobStatus(el) {
    try { await fetch(`/api/jobs/${el.dataset.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('wp_token') }, body: JSON.stringify({ status: el.dataset.status }) }); toast('已更新'); render(); }
    catch (e) { toast(e.message, true); }
  },

  async manage(el) {
    const slot = el.closest('.card').querySelector('.app-slot');
    if (slot) await loadApplications(slot);
  },

  toggleForm() {
    const box = document.getElementById('create-form');
    if (!box) return;
    if (box.style.display === 'none') { box.style.display = ''; box.innerHTML = merchantForm(); }
    else { box.style.display = 'none'; box.innerHTML = ''; }
  },

  async createJob(form) {
    const d = Object.fromEntries(new FormData(form));
    const payload = {
      title: d.title, category: d.category, wageType: d.wageType, wage: Number(d.wage),
      headcount: Number(d.headcount), workDate: d.workDate, location: d.location,
      startTime: d.startTime, endTime: d.endTime, description: d.description, requirements: d.requirements,
    };
    try {
      const { job } = await useJobStore.create(payload);
      toast('已保存为草稿，记得发布');
      const box = document.getElementById('create-form');
      if (box) { box.style.display = 'none'; box.innerHTML = ''; }
      const app = $app();
      await refreshMerchantJobs(app);
      const slot = app.querySelector(`.app-slot[data-job="${job.id}"]`);
      if (slot) await loadApplications(slot);
    } catch (e) { toast(e.message, true); }
  },

  async review(el) {
    const { jobid, id, to, who } = el.dataset;
    let toUserId = to;
    let targetName = who || '对方';
    if (!toUserId) {
      // 学生评价商家：取岗位的商家 id
      try { const { job } = await useJobStore.detail(jobid); toUserId = job.merchantId; targetName = job.shopName || '商家'; }
      catch (e) { toast(e.message, true); return; }
    }
    const rating = prompt(`给「${targetName}」打分（1-5 星）`, '5');
    if (rating == null) return;
    const comment = prompt('写一句评价（可选）', '');
    if (comment === null) return;
    try {
      await useReviewStore.create({ jobId: jobid, toUserId, rating: Number(rating), comment: comment || '' });
      toast('评价成功');
      render();
    } catch (e) { toast(e.message, true); }
  },
};

async function merchantAct(id, action) {
  try { await useApplicationStore.update(id, action); toast('操作成功'); render(); }
  catch (e) { toast(e.message, true); }
}

// ---------- 事件委托 ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = handlers[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  const fn = handlers[form.dataset.action];
  if (fn) fn(form);
});

window.addEventListener('hashchange', render);
render();
