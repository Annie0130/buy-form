import { bottomFields, certUrl, guestMessage, SHOP, DEFAULT_TERMS } from './shared/warranty.js';
import { renderFillRows } from './fill-dom.js';

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

function termSections(text) {
  const sections = [];
  let currentSection = { title: '', lines: [] };
  for (const line of String(text || '').split('\n')) {
    if (/^[一二三四五六七八九十]+、/.test(line)) {
      sections.push(currentSection);
      currentSection = { title: line, lines: [] };
    } else currentSection.lines.push(line);
  }
  sections.push(currentSection);
  return sections.filter((s) => s.title || s.lines.some(Boolean));
}

function render(cert) {
  current = cert;
  const wrap = $('sheet-wrap');
  wrap.replaceChildren();
  const sheet = document.createElement('article');
  sheet.className = 'sheet';
  sheet.id = 'sheet';

  const head = document.createElement('header');
  head.className = 'sheet-head';
  const brand = document.createElement('div');
  brand.className = 'brand';
  const mark = document.createElement('div');
  mark.className = 'mark';
  mark.textContent = '林';
  const names = document.createElement('div');
  const brandName = document.createElement('div');
  brandName.className = 'brand-name';
  brandName.textContent = SHOP.name;
  const brandEn = document.createElement('div');
  brandEn.className = 'brand-en';
  brandEn.textContent = SHOP.en;
  names.append(brandName, brandEn);
  brand.append(mark, names);
  const kicker = document.createElement('div');
  kicker.className = 'sheet-kicker';
  kicker.textContent = '電子保固書';
  const no = document.createElement('div');
  no.className = 'doc-no';
  no.textContent = cert.no ? `保固編號 ${cert.no}` : '';
  const seal = document.createElement('div');
  seal.className = `seal ${sealClass(cert.displayStatus)}`;
  seal.textContent = cert.displayStatus || '';
  head.append(brand, kicker, no, seal);
  sheet.append(head);

  if (cert.displayStatus === '已作廢') {
    const banner = document.createElement('div');
    banner.className = 'status-banner void';
    banner.textContent = '本保固書已作廢，不具保固效力。';
    sheet.append(banner);
  } else if (cert.displayStatus === '已到期') {
    const banner = document.createElement('div');
    banner.className = 'status-banner expired';
    banner.textContent = '店保已過期。公司貨若仍在原廠保固內，請看下方到期日。';
    sheet.append(banner);
  }

  const sections = termSections(cert.terms);
  sections.forEach((section, index) => {
    if (!section.title) {
      const intro = document.createElement('div');
      intro.className = 'terms-intro';
      section.lines.filter(Boolean).forEach((line, i) => {
        const p = document.createElement('p');
        p.className = i === 0 ? 'terms-title' : 'terms-lead';
        p.textContent = line;
        intro.append(p);
      });
      sheet.append(intro);
      return;
    }
    const details = document.createElement('details');
    details.className = 'term-block';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = section.title;
    details.append(summary);
    section.lines.filter((line) => line !== '').forEach((line) => {
      const p = document.createElement('p');
      p.className = 'term-line';
      p.textContent = line;
      details.append(p);
    });
    if (index === sections.length - 1) details.style.marginBottom = '8px';
    sheet.append(details);
  });

  const fills = document.createElement('section');
  fills.className = 'fills';
  const fillsTitle = document.createElement('div');
  fillsTitle.className = 'fills-title';
  fillsTitle.textContent = '本張保固記載';
  fills.append(fillsTitle);
  const rows = document.createElement('div');
  renderFillRows(rows, bottomFields(cert, todayOf()));
  fills.append(rows);
  sheet.append(fills);

  const foot = document.createElement('div');
  foot.className = 'sheet-foot';
  const qr = document.createElement('div');
  qr.id = 'cert-qr';
  const meta = document.createElement('div');
  const shopLine = document.createElement('small');
  shopLine.textContent = SHOP.name;
  const addr = document.createElement('small');
  addr.textContent = SHOP.address;
  const hours = document.createElement('small');
  hours.textContent = `${SHOP.phone}　${SHOP.hours}`;
  const hint = document.createElement('small');
  hint.textContent = '掃描 QR Code 可核對這張保固書';
  meta.append(shopLine, addr, hours, hint);
  foot.append(qr, meta);
  sheet.append(foot);
  wrap.append(sheet);

  const url = certUrl(location.origin, cert.token);
  if (window.QRCode && cert.token) {
    new window.QRCode(qr, { text: url, width: 112, height: 112, correctLevel: window.QRCode.CorrectLevel.M });
  }
  $('tools').hidden = false;
  $('btn-line').href = `https://line.me/R/msg/text/?${encodeURIComponent(guestMessage({
    product: cert.product, no: cert.no, periodLabel: cert.periodLabel, shopEnd: cert.shopEnd,
    url, company: cert.company, mfgEnd: cert.mfgEnd,
  }))}`;
  document.title = `${SHOP.name}電子保固書 — ${cert.product || cert.no}`;
}

function todayOf() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
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
    btn.className = 'pick';
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

function showDemo() {
  const ribbon = document.createElement('div');
  ribbon.className = 'preview-ribbon noprint';
  ribbon.textContent = '版面預覽範例，不是正式保固書';
  document.body.insertBefore(ribbon, $('sheet-wrap'));
  $('lookup').hidden = true;
  render({
    no: 'LW20261101-DEMO',
    token: 'demo-preview-not-a-real-warranty',
    product: 'Sony A7 III 機身（預覽範例）',
    serial: 'DEMO-A7III-0001',
    periodLabel: '6個月',
    shopStart: '2026-11-01',
    shopEnd: '2027-05-01',
    transactionDate: '2026-11-01',
    memberName: '王小明',
    phone: '0912345678',
    company: true,
    mfgEnd: '2027-06-30',
    displayStatus: '有效',
    status: '有效',
    terms: DEFAULT_TERMS,
  });
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
  if (new URLSearchParams(location.search).get('demo') === '1') {
    showDemo();
    return;
  }
  const token = new URLSearchParams(location.search).get('t') || new URLSearchParams(location.search).get('token');
  if (token) lookupToken(token);
}

bind();
