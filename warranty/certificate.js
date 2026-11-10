import { bottomFields, certUrl, guestMessage } from './shared/warranty.js';

const $ = (id) => document.getElementById(id);
let current = null;
let all = [];

function showError(text) {
  const el = $('q-error');
  el.hidden = !text;
  el.textContent = text || '';
}

function sealClass(status) {
  if (status === '有效') return 'ok';
  if (status === '已作廢') return 'void';
  return 'expired';
}

function render(cert) {
  current = cert;
  const wrap = $('sheet-wrap');
  wrap.replaceChildren();
  const sheet = document.createElement('article');
  sheet.className = 'sheet';
  sheet.id = 'sheet';

  const head = document.createElement('div');
  head.className = 'sheet-head';
  const titles = document.createElement('div');
  const no = document.createElement('div');
  no.textContent = cert.no ? `保固編號 ${cert.no}` : '';
  no.style.fontSize = '13px';
  no.style.opacity = '.75';
  no.style.marginTop = '8px';
  titles.append(no);
  const seal = document.createElement('div');
  seal.className = `seal ${sealClass(cert.displayStatus)}`;
  seal.textContent = cert.displayStatus || '';
  head.append(titles, seal);

  if (cert.displayStatus === '已作廢') {
    const banner = document.createElement('div');
    banner.className = 'status-banner void';
    banner.textContent = '本保固書已作廢，不具保固效力。';
    sheet.append(head, banner);
  } else if (cert.displayStatus === '已到期') {
    const banner = document.createElement('div');
    banner.className = 'status-banner expired';
    banner.textContent = '店保已過期。公司貨若仍在原廠保固內，請看下方到期日。';
    sheet.append(head, banner);
  } else sheet.append(head);

  const terms = document.createElement('pre');
  terms.className = 'terms';
  terms.textContent = cert.terms || '';
  const fills = document.createElement('div');
  fills.className = 'fills';
  for (const [label, value] of bottomFields(cert, todayOf(cert))) {
    const row = document.createElement('div');
    row.className = 'fill-row';
    const a = document.createElement('div');
    a.className = 'fill-label';
    a.textContent = label;
    const b = document.createElement('div');
    b.className = 'fill-value';
    b.textContent = value;
    row.append(a, b);
    fills.append(row);
  }
  const foot = document.createElement('div');
  foot.className = 'sheet-foot';
  const qr = document.createElement('div');
  qr.id = 'cert-qr';
  const meta = document.createElement('div');
  const shopLine = document.createElement('small');
  shopLine.textContent = '林相攝影　台北市文山區羅斯福路六段5號　02-2930-3697';
  const hours = document.createElement('small');
  hours.textContent = '14:00–21:00（週二、三公休）　掃描 QR Code 可核對這張保固書';
  meta.append(shopLine, hours);
  foot.append(qr, meta);
  sheet.append(terms, fills, foot);
  wrap.append(sheet);

  const url = certUrl(location.origin, cert.token);
  if (window.QRCode) new window.QRCode(qr, { text: url, width: 108, height: 108, correctLevel: window.QRCode.CorrectLevel.M });
  $('tools').hidden = false;
  $('btn-line').href = `https://line.me/R/msg/text/?${encodeURIComponent(guestMessage({
    product: cert.product, no: cert.no, periodLabel: cert.periodLabel, shopEnd: cert.shopEnd,
    url, company: cert.company, mfgEnd: cert.mfgEnd,
  }))}`;
  document.title = `林相攝影電子保固書 — ${cert.product || cert.no}`;
}

function todayOf(cert) {
  // 狀態已由伺服器依台北日期算好；底部「已過期」仍用同一天比較，跟證書一起回來的 shopEnd 為準。
  // 這裡用瀏覽器的台北今天，跟後台同一套日期格式。
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function showList(certs) {
  all = certs;
  const box = $('result-list');
  box.replaceChildren();
  $('btn-back').hidden = certs.length < 2;
  if (certs.length < 2) {
    if (certs[0]) render(certs[0]);
    $('lookup').hidden = true;
    return;
  }
  for (const cert of certs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${cert.product}　${cert.serial}　${cert.periodLabel}　${cert.displayStatus}`;
    btn.addEventListener('click', () => { render(cert); box.hidden = true; });
    box.append(btn);
  }
  render(certs[0]);
  $('lookup').hidden = true;
}

async function lookupToken(token) {
  const res = await fetch(`/.netlify/functions/lookup?t=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { showError(data.error || '找不到這張保固書'); return; }
  $('lookup').hidden = true;
  render(data.certificate);
}

async function lookupMember() {
  showError('');
  const res = await fetch('/.netlify/functions/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: $('q-phone').value, code: $('q-code').value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { showError(data.error || '查詢失敗'); return; }
  if (!data.certificates?.length) { showError('這個電話目前沒有保固書'); return; }
  showList(data.certificates);
}

function bind() {
  $('q-go').addEventListener('click', lookupMember);
  $('q-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupMember(); });
  $('btn-print').addEventListener('click', () => window.print());
  $('btn-copy').addEventListener('click', async () => {
    if (!current?.token) return;
    const url = certUrl(location.origin, current.token);
    try { await navigator.clipboard.writeText(url); $('btn-copy').textContent = '已複製'; }
    catch { prompt('請手動複製', url); }
  });
  $('btn-back').addEventListener('click', () => { $('result-list').hidden = false; });
  const token = new URLSearchParams(location.search).get('t') || new URLSearchParams(location.search).get('token');
  if (token) lookupToken(token);
}

bind();
