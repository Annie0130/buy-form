import {
  DEFAULT_PERIOD, DEFAULT_TERMS, PERIODS, bottomFields, certUrl, formatPhone,
  guestMessage, inferPeriod, normPhone, normalizePeriod, parsePosRecords,
  periodEnd, periodLabel, prepareIssue, taipeiToday,
} from './shared/warranty.js';
import { renderFillRows } from './fill-dom.js';

const PW_KEY = 'linscamWarrantyPw';
const PW_DAYS = 30;
const EMAIL_API = 'https://linscam-email-api-lpvi.vercel.app/api/send-email';
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

let editingId = '';
let listOffset = '';
let posItems = [];
let last = null;
let password = '';
const DEMO = new URLSearchParams(location.search).get('demo') === '1';

const $ = (id) => document.getElementById(id);

function readSavedPassword() {
  try {
    const saved = JSON.parse(localStorage.getItem(PW_KEY) || 'null');
    if (saved && saved.expires > Date.now() && saved.pw) return saved.pw;
  } catch { /* 壞掉的紀錄就當沒有 */ }
  return '';
}

function showGate(message) {
  document.body.classList.add('locked');
  const err = $('login-error');
  if (!err) return;
  err.hidden = !message;
  err.textContent = message || '';
  $('login-pw')?.focus();
}

function hideGate() {
  document.body.classList.remove('locked');
}

const DEMO_CERTS = [
  { id: 'demo1', no: 'LW20261101-DEMO', token: 'demo-1', product: 'Sony A7 III 機身（預覽範例）', serial: 'DEMO-A7III-0001', memberName: '王小明', phone: '0912345678', periodLabel: '6個月', shopEnd: '2027-05-01', company: true, displayStatus: '有效', status: '有效' },
  { id: 'demo2', no: 'LW20260920-EXAM', token: 'demo-2', product: 'Sony FE 24-70mm F2.8 GM（預覽範例）', serial: 'DEMO-2470-0002', memberName: '王小明', phone: '0912345678', periodLabel: '1個月', shopEnd: '2026-10-20', company: false, displayStatus: '已到期', status: '有效' },
  { id: 'demo3', no: 'LW20260801-VOID', token: 'demo-3', product: 'Canon EOS R6 機身（預覽範例）', serial: 'DEMO-R6-0003', memberName: '示範客人', phone: '0987654321', periodLabel: '6個月', shopEnd: '2027-02-01', company: true, displayStatus: '已作廢', status: '已作廢' },
];

async function api(path, opts = {}) {
  if (DEMO) {
    const reading = !opts.method || opts.method === 'GET';
    if (!reading) return { res: { ok: false, status: 400 }, data: { error: '預覽模式不會寫入資料' } };
    if (path.includes('op=status')) return { res: { ok: true, status: 200 }, data: { tables: { members: 'ok', certs: 'ok', terms: 'ok' }, hint: '' } };
    if (path.includes('op=certs')) return { res: { ok: true, status: 200 }, data: { certificates: DEMO_CERTS, offset: '' } };
    if (path.includes('op=member&')) {
      return { res: { ok: true, status: 200 }, data: { found: true, member: { phone: '0912345678', name: '王小明', line: 'xiaoming-demo', email: 'preview@example.com', code: '246810', created: '2026-10-15' } } };
    }
    if (path.includes('op=members')) return { res: { ok: true, status: 200 }, data: { members: [{ id: 'm1', phone: '0912345678', name: '王小明', line: 'xiaoming-demo', email: 'preview@example.com', code: '246810', created: '2026-10-15', note: '' }], offset: '' } };
    if (path.includes('op=terms')) return { res: { ok: true, status: 200 }, data: { terms: DEFAULT_TERMS } };
    return { res: { ok: false, status: 400 }, data: { error: '預覽模式沒有這筆資料' } };
  }
  if (!password) {
    showGate();
    return { res: { ok: false, status: 401 }, data: { error: '請先登入' } };
  }
  let res;
  let data = {};
  try {
    res = await fetch(path, {
      ...opts,
      headers: {
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
        'x-admin-password': password,
      },
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    return { res: { ok: false, status: 0 }, data: { error: '連不上伺服器' } };
  }
  if (res.status === 401) {
    password = '';
    localStorage.removeItem(PW_KEY);
    showGate('密碼不正確，請再試一次');
  }
  return { res, data };
}

function show(id, on, text) {
  const el = $(id);
  if (!el) return;
  el.hidden = !on;
  if (text !== undefined) el.textContent = text;
}

function tab(name) {
  for (const key of ['issue', 'list', 'members', 'terms']) {
    $(`tab-${key}`).setAttribute('aria-selected', key === name ? 'true' : 'false');
    $(`view-${key}`).hidden = key !== name;
  }
  $('issue-bar').hidden = name !== 'issue';
  if (name === 'list') loadCerts(true);
  if (name === 'members') loadMembers();
  if (name === 'terms') loadTerms();
}

function staffValue() {
  const sel = $('f-staff').value;
  return sel === '其他' ? $('f-staff-other').value : sel;
}

function collect() {
  return {
    phone: $('f-phone').value,
    name: $('f-name').value,
    line: $('f-line').value,
    email: $('f-email').value,
    product: $('f-product').value,
    serial: $('f-serial').value,
    purchaseDate: $('f-date').value,
    period: $('f-period').value,
    company: $('f-company').checked,
    mfgEnd: $('f-mfg').value,
    price: $('f-price').value,
    staff: staffValue(),
    note: $('f-note').value,
  };
}

function paintPreview() {
  const today = taipeiToday();
  const period = normalizePeriod($('f-period').value) || DEFAULT_PERIOD;
  const start = $('f-date').value;
  const end = start ? periodEnd(start, period) : '';
  $('end-preview').textContent = end
    ? `${periodLabel(period)}：${start}～${end}（交易日是第 1 天，迄日當天仍有效）`
    : '請先選交易日期。一個月、六個月的迄日是往後的同一天；那個月沒有這一天就用月底。';
  // 日期欄被藏起來時，有的瀏覽器會再送一次 input。只在狀態真的改變時改 hidden，避免反覆重畫。
  const hideMfg = !$('f-company').checked;
  if ($('mfg-wrap').hidden !== hideMfg) $('mfg-wrap').hidden = hideMfg;
  const hideStaff = $('f-staff').value !== '其他';
  if ($('staff-other-wrap').hidden !== hideStaff) $('staff-other-wrap').hidden = hideStaff;
  const periodKey = normalizePeriod($('f-period').value) || DEFAULT_PERIOD;
  const box = $('bottom-preview');
  const draft = {
    product: $('f-product').value.trim(),
    serial: $('f-serial').value.trim(),
    periodLabel: periodLabel(periodKey),
    shopStart: start,
    shopEnd: end,
    transactionDate: start,
    memberName: $('f-name').value.trim(),
    phone: $('f-phone').value,
    company: $('f-company').checked,
    mfgEnd: $('f-company').checked ? $('f-mfg').value : '',
  };
  renderFillRows(box, bottomFields(draft, today));
}

function fillMember(member) {
  if (!member) return;
  $('f-phone').value = member.phone || '';
  $('f-name').value = member.name || '';
  $('f-line').value = member.line || '';
  $('f-email').value = member.email || '';
  const code = member.code ? `驗證碼 ${member.code}` : '';
  const created = member.created ? `建立於 ${member.created}` : '';
  $('member-hint').textContent = ['已是會員', created, code].filter(Boolean).join('，') + '。請只把驗證碼告訴這位客人。';
}

async function lookupMember() {
  const phone = normPhone($('f-phone').value);
  if (!phone) { $('member-hint').textContent = '請填有效的電話'; return; }
  const { res, data } = await api(`/.netlify/functions/admin?op=member&phone=${encodeURIComponent(phone)}`);
  if (!res.ok) { $('member-hint').textContent = data.error || '查詢失敗'; return; }
  if (!data.found) {
    $('member-hint').textContent = '新電話。開立保固時會建立會員並產生驗證碼。';
    return;
  }
  fillMember(data.member);
  paintPreview();
}

function resetIssue({ keepMember = false } = {}) {
  editingId = '';
  $('edit-banner').hidden = true;
  $('refresh-wrap').hidden = true;
  $('f-refresh').checked = false;
  $('btn-submit').textContent = '開立保固書';
  if (!keepMember) {
    $('f-phone').value = '';
    $('f-name').value = '';
    $('f-line').value = '';
    $('f-email').value = '';
    $('member-hint').textContent = '';
  }
  $('f-product').value = '';
  $('f-serial').value = '';
  $('f-price').value = '';
  $('f-date').value = taipeiToday();
  $('f-period').value = DEFAULT_PERIOD;
  $('f-company').checked = false;
  $('f-mfg').value = '';
  $('f-note').value = '';
  show('notice', false);
  show('form-error', false);
  paintPreview();
}

function applyCert(cert, member) {
  editingId = cert.id;
  $('edit-banner').hidden = false;
  $('refresh-wrap').hidden = false;
  $('btn-submit').textContent = '儲存修改';
  $('f-phone').value = cert.phone || '';
  $('f-name').value = cert.memberName || '';
  $('f-product').value = cert.product || '';
  $('f-serial').value = cert.serial || '';
  $('f-price').value = cert.price ?? '';
  $('f-date').value = cert.transactionDate || '';
  $('f-period').value = inferPeriod(cert.transactionDate, cert.shopEnd, cert.periodLabel);
  $('f-company').checked = !!cert.company;
  $('f-mfg').value = cert.mfgEnd || '';
  $('f-note').value = cert.note || '';
  if (member) {
    $('f-line').value = member.line || '';
    $('f-email').value = member.email || '';
    fillMember(member);
  }
  const known = ['', 'Annie', '陳貢丸', 'AMY', 'EASON', '孟'];
  if (known.includes(cert.staff || '')) $('f-staff').value = cert.staff || '';
  else { $('f-staff').value = '其他'; $('f-staff-other').value = cert.staff || ''; }
  tab('issue');
  paintPreview();
}

async function submitIssue() {
  show('form-error', false);
  const prepared = prepareIssue(collect(), taipeiToday());
  if (prepared.error) { show('form-error', true, prepared.error); return; }
  const payload = collect();
  if (editingId) {
    payload.id = editingId;
    payload.refreshTerms = $('f-refresh').checked;
  }
  $('btn-submit').disabled = true;
  const op = editingId ? 'update' : 'issue';
  let { res, data } = await api(`/.netlify/functions/admin?op=${op}`, { method: 'POST', body: JSON.stringify(payload) });
  if (res.status === 409 && data.existing && confirm(`${data.error}\n${data.existing.no || ''} ${data.existing.product || ''}\n仍要繼續嗎？`)) {
    payload.force = true;
    ({ res, data } = await api(`/.netlify/functions/admin?op=${op}`, { method: 'POST', body: JSON.stringify(payload) }));
  }
  $('btn-submit').disabled = false;
  if (!res.ok) { show('form-error', true, data.error || '沒有寫入'); return; }
  const wasEdit = !!editingId;
  editingId = '';
  $('btn-submit').textContent = '開立保固書';
  $('edit-banner').hidden = true;
  openDone(data, wasEdit ? '已更新保固書' : '已開立保固書');
}

function openDone(data, title) {
  const cert = data.certificate;
  const member = data.member || {};
  const url = certUrl(location.origin, cert.token);
  last = { cert, member, url };
  $('done-title').textContent = title;
  const body = $('done-body');
  body.replaceChildren();
  const head = document.createElement('p');
  head.style.fontWeight = '700';
  head.textContent = `${cert.no}　${cert.product}`;
  body.append(head);
  const fills = document.createElement('div');
  renderFillRows(fills, bottomFields({ ...cert, phone: cert.phone }, taipeiToday()));
  body.append(fills);
  $('done-code').textContent = member.code || '';
  $('done-open').href = url;
  $('done-line').href = `https://line.me/R/msg/text/?${encodeURIComponent(guestMessage({
    product: cert.product, no: cert.no, periodLabel: cert.periodLabel, shopEnd: cert.shopEnd,
    phone: cert.phone, code: $('done-include-code').checked ? member.code : '', url,
    company: cert.company, mfgEnd: cert.mfgEnd,
  }))}`;
  $('done-mail').hidden = !member.email;
  const qr = $('done-qr');
  qr.replaceChildren();
  if (window.QRCode) new window.QRCode(qr, { text: url, width: 140, height: 140, correctLevel: window.QRCode.CorrectLevel.M });
  $('done-modal').hidden = false;
}

function messageText() {
  if (!last) return '';
  return guestMessage({
    product: last.cert.product,
    no: last.cert.no,
    periodLabel: last.cert.periodLabel,
    shopEnd: last.cert.shopEnd,
    phone: last.cert.phone,
    code: $('done-include-code').checked ? last.member.code : '',
    url: last.url,
    company: last.cert.company,
    mfgEnd: last.cert.mfgEnd,
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); alert('已複製'); }
  catch { prompt('請手動複製', text); }
}

async function sendMail() {
  if (!last?.member.email) return;
  const cert = last.cert;
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<p>${esc(cert.memberName)} 您好，</p><p>您在林相攝影的電子保固書已開立。</p><p>商品：${esc(cert.product)}<br>序號：${esc(cert.serial)}<br>保固期間：${esc(cert.periodLabel)}（至 ${esc(cert.shopEnd)}）</p><p><a href="${esc(last.url)}">查看保固書</a></p>${$('done-include-code').checked ? `<p>驗證碼 ${esc(last.member.code)}（可查此電話名下所有保固，請勿轉傳）</p>` : ''}<p>林相攝影<br>台北市文山區羅斯福路六段5號<br>02-2930-3697</p>`;
  try {
    const res = await fetch(EMAIL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: last.member.email,
        cc: 'linscamerastore@gmail.com',
        subject: `【林相攝影】電子保固書 — ${cert.product}（${cert.no}）`,
        html,
      }),
    });
    const data = await res.json().catch(() => ({}));
    alert(res.ok ? '已寄出' : `信沒送出：${data.error || res.status}`);
  } catch (err) {
    alert(`保固書已存在，但信沒送出：${err.message}`);
  }
}

function badge(status) {
  const cls = status === '有效' ? 'ok' : status === '已作廢' ? 'void' : 'expired';
  return `<span class="badge ${cls}">${status}</span>`;
}

async function loadCerts(reset) {
  if (reset) listOffset = '';
  const q = $('list-q').value.trim();
  const { res, data } = await api(`/.netlify/functions/admin?op=certs&q=${encodeURIComponent(q)}${listOffset && !reset ? `&offset=${encodeURIComponent(listOffset)}` : ''}`);
  const box = $('list-body');
  if (!res.ok) { box.textContent = data.error || '讀取失敗'; return; }
  const rows = data.certificates || [];
  if (reset) box.replaceChildren();
  if (reset && !rows.length) { box.textContent = '沒有保固書'; }
  const table = box.querySelector('table') || document.createElement('table');
  if (!box.querySelector('table') && rows.length) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.innerHTML = '<thead><tr><th>編號</th><th>商品</th><th>會員</th><th>期間</th><th>狀態</th><th></th></tr></thead>';
    wrap.append(table);
    box.replaceChildren(wrap);
  }
  let body = table.querySelector('tbody');
  if (!body && rows.length) { body = document.createElement('tbody'); table.append(body); }
  for (const cert of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="date">${escapeHtml(cert.no || '')}</span></td><td>${escapeHtml(cert.product)}<br><span class="hint">${escapeHtml(cert.serial)}</span></td><td>${escapeHtml(cert.memberName)}<br><span class="date">${formatPhone(cert.phone)}</span></td><td><span class="date">${escapeHtml(cert.periodLabel)}</span><br><span class="date">${escapeHtml(cert.shopEnd || '')}</span>${cert.company ? ' <span class="badge co">公司貨</span>' : ''}</td><td>${badge(cert.displayStatus)}</td><td></td>`;
    const cell = tr.lastElementChild;
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const open = document.createElement('a');
    open.className = 'btn tiny secondary';
    open.href = certUrl(location.origin, cert.token);
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = '證書';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn tiny secondary';
    edit.textContent = '修改';
    edit.addEventListener('click', () => editCert(cert.id));
    const voidBtn = document.createElement('button');
    voidBtn.type = 'button';
    const voided = cert.status === '已作廢';
    voidBtn.className = voided ? 'btn tiny secondary' : 'btn tiny danger';
    voidBtn.textContent = voided ? '恢復' : '作廢';
    voidBtn.addEventListener('click', () => toggleVoid(cert));
    actions.append(open, edit, voidBtn);
    cell.append(actions);
    body.append(tr);
  }
  listOffset = data.offset || '';
  $('btn-more').hidden = !listOffset;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function editCert(id) {
  const { res, data } = await api(`/.netlify/functions/admin?op=cert&id=${encodeURIComponent(id)}`);
  if (!res.ok) { alert(data.error || '讀取失敗'); return; }
  applyCert(data.certificate, data.member);
}

async function toggleVoid(cert) {
  const undoing = cert.status === '已作廢';
  if (!confirm(undoing ? '確定恢復這張保固書？' : '確定作廢？客人頁面會顯示已作廢。')) return;
  const { res, data } = await api('/.netlify/functions/admin?op=void', {
    method: 'POST', body: JSON.stringify({ id: cert.id, void: !undoing }),
  });
  if (!res.ok) { alert(data.error || '沒有更新'); return; }
  loadCerts(true);
}

async function loadMembers() {
  const q = $('mem-q').value.trim();
  const { res, data } = await api(`/.netlify/functions/admin?op=members&q=${encodeURIComponent(q)}`);
  const box = $('mem-body');
  if (!res.ok) { box.textContent = data.error || '讀取失敗'; return; }
  const rows = data.members || [];
  if (!rows.length) { box.textContent = q ? '找不到會員' : '還沒有會員'; return; }
  box.replaceChildren();
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>會員</th><th>聯絡</th><th>驗證碼</th><th></th></tr></thead>';
  const body = document.createElement('tbody');
  for (const m of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(m.name)}<br>${formatPhone(m.phone)}<br><span class="hint">${escapeHtml(m.created || '')}</span></td><td>${escapeHtml(m.line || '—')}<br>${escapeHtml(m.email || '')}</td><td>${escapeHtml(m.code || '')}${m.lockedUntil ? '<br><span class="hint">暫時鎖定</span>' : ''}</td><td></td>`;
    const cell = tr.lastElementChild;
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'secondary';
    use.textContent = '帶入開立';
    use.addEventListener('click', () => { fillMember(m); tab('issue'); paintPreview(); });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary';
    edit.style.marginLeft = '4px';
    edit.textContent = '修改';
    edit.addEventListener('click', () => {
      $('mem-id').value = m.id;
      $('mem-phone').value = m.phone;
      $('mem-name').value = m.name;
      $('mem-line').value = m.line || '';
      $('mem-email').value = m.email || '';
      $('mem-note').value = m.note || '';
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'secondary';
    reset.style.marginLeft = '4px';
    reset.textContent = '重設驗證碼';
    reset.addEventListener('click', () => resetCode(m.phone));
    const certs = document.createElement('button');
    certs.type = 'button';
    certs.className = 'secondary';
    certs.style.marginLeft = '4px';
    certs.textContent = '看保固';
    certs.addEventListener('click', () => { $('list-q').value = m.phone; tab('list'); });
    cell.append(use, edit, reset, certs);
    body.append(tr);
  }
  table.append(body);
  box.append(table);
}

async function saveMember() {
  show('mem-error', false);
  const payload = {
    id: $('mem-id').value,
    phone: $('mem-phone').value,
    name: $('mem-name').value,
    line: $('mem-line').value,
    email: $('mem-email').value,
    note: $('mem-note').value,
  };
  const { res, data } = await api('/.netlify/functions/admin?op=member', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) { show('mem-error', true, data.error || '沒有儲存'); return; }
  $('mem-id').value = data.member.id;
  alert(data.created ? `已建立。驗證碼 ${data.member.code}` : '已儲存');
  loadMembers();
}

function clearMemberForm() {
  for (const id of ['mem-id', 'mem-phone', 'mem-name', 'mem-line', 'mem-email', 'mem-note']) $(id).value = '';
  show('mem-error', false);
}

async function resetCode(phone) {
  if (!confirm('重設後，舊驗證碼就不能用。確定？')) return;
  const { res, data } = await api('/.netlify/functions/admin?op=reset-code', { method: 'POST', body: JSON.stringify({ phone }) });
  if (!res.ok) { alert(data.error || '沒有重設'); return; }
  alert(`新驗證碼 ${data.member.code}`);
  loadMembers();
}

async function loadTerms() {
  if (!$('terms-text').value) $('terms-text').value = DEFAULT_TERMS;
  const { res, data } = await api('/.netlify/functions/admin?op=terms');
  if (res.ok && data.terms) $('terms-text').value = data.terms;
}

async function saveTerms() {
  const { res, data } = await api('/.netlify/functions/admin?op=terms', {
    method: 'POST', body: JSON.stringify({ terms: $('terms-text').value }),
  });
  $('terms-msg').textContent = res.ok ? '已儲存。已開立的保固書不會被改寫。' : (data.error || '沒有儲存');
}

async function refreshStatus() {
  const { res, data } = await api('/.netlify/functions/admin?op=status');
  const banner = $('banner');
  if (!res.ok) {
    if (res.status !== 401) {
      banner.hidden = false;
      banner.textContent = data.error || '還連不上資料';
    }
    return { res, data };
  }
  const missing = Object.values(data.tables || {}).some((v) => v !== 'ok');
  banner.hidden = !missing && !data.hint;
  banner.textContent = missing || data.hint ? `${data.hint || '資料表還沒準備好。'} 請按右上角「建立資料表」。` : '';
  return { res, data };
}

async function runSetup() {
  $('btn-setup').disabled = true;
  const { res, data } = await api('/.netlify/functions/setup', { method: 'POST', body: '{}' });
  $('btn-setup').disabled = false;
  if (!res.ok) { alert(data.error || '沒有建成'); return; }
  const lines = [
    data.created?.length ? `新建：${data.created.join('、')}` : '資料表都已存在',
    data.linked ? '保固書已連到會員' : '會員連結欄位沒建成（仍可用電話對會員）',
    data.termsSeeded ? '已寫入店家定稿條款' : '條款範本已有內容，沒有覆蓋',
    ...(data.warnings || []),
  ];
  alert(lines.join('\n'));
  refreshStatus();
}

function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  return new Promise((ok, fail) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = ok;
    el.onerror = () => fail(new Error('無法載入試算表元件'));
    document.head.appendChild(el);
  });
}

function renderPos() {
  const q = $('pos-q').value.trim().toLowerCase();
  const hideAcc = $('pos-hide-acc').checked;
  const vis = posItems.filter((it) => (hideAcc ? !/配件/.test(it.category || '') : true)
    && (!q || it.name.toLowerCase().includes(q) || it.sn.toLowerCase().includes(q)));
  const box = $('pos-body');
  box.replaceChildren();
  if (!vis.length) { box.textContent = posItems.length ? '沒有符合的列' : '請選擇檔案'; return; }
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = `共 ${vis.length} 筆`;
  box.append(note);
  for (const it of vis) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.marginBottom = '6px';
    btn.style.textAlign = 'left';
    btn.textContent = `${it.name}　${it.sn}　${it.periodLabel}${it.company ? '　公司貨' : ''}${it.mfgEnd ? '　原廠至' + it.mfgEnd : ''}${it.caution ? '　⚠' : ''}`;
    btn.addEventListener('click', () => applyPos(it));
    box.append(btn);
  }
}

function applyPos(it) {
  $('f-product').value = it.name;
  $('f-serial').value = it.sn;
  if (it.price) $('f-price').value = it.price;
  $('f-period').value = PERIODS.some((p) => p.value === it.period) ? it.period : DEFAULT_PERIOD;
  $('f-company').checked = !!it.company;
  $('f-mfg').value = it.company ? (it.mfgEnd || '') : '';
  if (it.rawNote) $('f-note').value = it.rawNote;
  show('notice', !!it.caution, it.caution || '');
  $('pos-modal').hidden = true;
  paintPreview();
}

async function onPosFile(file) {
  if (!file) return;
  $('pos-body').textContent = '讀取中…';
  try {
    await loadScript(XLSX_SRC);
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    const parsed = parsePosRecords(rows);
    if (parsed.error) { $('pos-body').textContent = parsed.error; posItems = []; return; }
    posItems = parsed.items;
    renderPos();
  } catch (err) {
    $('pos-body').textContent = err.message || '讀取失敗';
  }
}

function bind() {
  $('f-date').value = taipeiToday();
  $('terms-text').value = DEFAULT_TERMS;
  for (const id of ['f-phone', 'f-name', 'f-line', 'f-email', 'f-product', 'f-serial', 'f-price', 'f-date', 'f-period', 'f-mfg', 'f-note', 'f-staff', 'f-staff-other']) {
    $(id).addEventListener('input', paintPreview);
    $(id).addEventListener('change', paintPreview);
  }
  $('f-company').addEventListener('change', paintPreview);
  $('btn-lookup').addEventListener('click', lookupMember);
  $('btn-submit').addEventListener('click', submitIssue);
  $('btn-cancel-edit').addEventListener('click', () => resetIssue());
  $('tab-issue').addEventListener('click', () => tab('issue'));
  $('tab-list').addEventListener('click', () => tab('list'));
  $('tab-members').addEventListener('click', () => tab('members'));
  $('tab-terms').addEventListener('click', () => tab('terms'));
  $('btn-list').addEventListener('click', () => loadCerts(true));
  $('list-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadCerts(true); });
  $('btn-more').addEventListener('click', () => loadCerts(false));
  $('btn-mem').addEventListener('click', loadMembers);
  $('mem-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadMembers(); });
  $('btn-mem-save').addEventListener('click', saveMember);
  $('btn-mem-clear').addEventListener('click', clearMemberForm);
  $('btn-terms-save').addEventListener('click', saveTerms);
  $('btn-terms-reset').addEventListener('click', () => { $('terms-text').value = DEFAULT_TERMS; $('terms-msg').textContent = '已載入定稿，按儲存才會寫入。'; });
  $('btn-setup').addEventListener('click', runSetup);
  $('btn-reload').addEventListener('click', () => { refreshStatus(); if (!$('view-list').hidden) loadCerts(true); });
  $('btn-pos').addEventListener('click', () => { $('pos-modal').hidden = false; });
  $('pos-close').addEventListener('click', () => { $('pos-modal').hidden = true; });
  $('pos-file').addEventListener('change', (e) => onPosFile(e.target.files[0]));
  $('pos-q').addEventListener('input', renderPos);
  $('pos-hide-acc').addEventListener('change', renderPos);
  $('pos-modal').addEventListener('click', (e) => { if (e.target === $('pos-modal')) $('pos-modal').hidden = true; });
  $('done-close').addEventListener('click', () => { $('done-modal').hidden = true; });
  $('done-next').addEventListener('click', () => { $('done-modal').hidden = true; resetIssue({ keepMember: true }); });
  $('done-copy-link').addEventListener('click', () => last && copyText(last.url));
  $('done-copy-msg').addEventListener('click', () => copyText(messageText()));
  $('done-include-code').addEventListener('change', () => {
    if (!last) return;
    $('done-line').href = `https://line.me/R/msg/text/?${encodeURIComponent(messageText())}`;
  });
  $('done-mail').addEventListener('click', sendMail);
  $('done-modal').addEventListener('click', (e) => { if (e.target === $('done-modal')) $('done-modal').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('pos-modal').hidden = true; $('done-modal').hidden = true; } });
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('login-pw').value;
    if (!pw) { showGate('請輸入密碼'); return; }
    password = pw;
    localStorage.setItem(PW_KEY, JSON.stringify({ pw, expires: Date.now() + PW_DAYS * 86400000 }));
    hideGate();
    const status = await refreshStatus();
    if (status?.res?.status === 401) return;
  });
  paintPreview();
  if (DEMO) {
    hideGate();
    $('banner').hidden = false;
    $('banner').textContent = '這是版面預覽，用的是範例資料，不會寫進店裡的紀錄。';
    $('f-phone').value = '0912345678';
    $('f-name').value = '王小明';
    $('f-line').value = 'xiaoming-demo';
    $('f-email').value = 'preview@example.com';
    $('f-product').value = 'Sony A7 III 機身（預覽範例）';
    $('f-serial').value = 'DEMO-A7III-0001';
    $('f-price').value = '28000';
    $('f-date').value = '2026-11-01';
    $('f-period').value = '6m';
    $('f-company').checked = true;
    $('f-mfg').value = '2027-06-30';
    $('f-staff').value = 'Annie';
    $('member-hint').textContent = '已是會員，建立於 2026-10-15，驗證碼 246810。請只把驗證碼告訴這位客人。';
    paintPreview();
    return;
  }
  password = readSavedPassword();
  if (password) {
    hideGate();
    refreshStatus();
  } else showGate();
}

bind();
