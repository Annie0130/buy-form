// 電子保固書與會員的純邏輯。瀏覽器與 Netlify Functions 共用，不能 import Node 模組。
// 日期一律用台北日曆的 YYYY-MM-DD 字串比較。

export const DEFAULT_BASE_ID = 'appAuc0SgpUMOFLsv';

export const SHOP = {
  name: '林相攝影',
  en: "LIN'S CAMERA",
  address: '台北市文山區羅斯福路六段5號',
  phone: '02-2930-3697',
  hours: '14:00–21:00（週二、三公休）',
  line: 'https://lin.ee/pmgns9U',
  shopUrl: 'https://linscam.fslol.com/',
};

export const STAFF = ['Annie', '陳貢丸', 'AMY', 'EASON', '孟'];

export const STATUS_ACTIVE = '有效';
export const STATUS_VOID = '已作廢';

// 老闆定的三種期間。6 個月是預設。
export const PERIODS = [
  { value: '7d', label: '7天' },
  { value: '1m', label: '1個月' },
  { value: '6m', label: '6個月' },
];
export const DEFAULT_PERIOD = '6m';

// 店家 2026-11-10 定稿。字句不要在程式裡改；後台「條款範本」改的是 Airtable 那份，只影響新開的證書。
const TERMS_LINES = [
  '林相攝影 二手器材保固書',
  '感謝您選購林相攝影的商品。每件器材出貨前都經過檢測與清潔，為保障雙方權益，請詳閱以下保固條款。',
  '一、保固期間',
  '1. 保固期間依商品標示，分為七天、一個月及六個月三種，以本保固書記載的期間為準。',
  '2. 保固自交易日起算，請妥善保存本保固書及購買憑證。',
  '二、保固範圍',
  '保固期內，在正常使用下發生的功能性故障，例如對焦、快門、光圈、電子接點、測光與讀卡等，本店提供免費檢測與維修。無法修復時，本店可依情況提供同等級商品更換或其他處理方案。',
  '三、不在保固範圍內的項目',
  '1. 螢幕（含觸控功能、亮點、壞點、漏光、色偏）。',
  '2. 鏡頭入塵、感光元件入塵、觀景窗入塵。灰塵是使用過程中正常會出現的狀況，不影響成像品質，不屬於故障。',
  '3. 人為因素造成的損壞，包括摔落、撞擊、擠壓、進水、受潮、發霉、沙塵侵入、高溫或日照損傷。',
  '4. 自行或交由非本店人員拆解、改裝、維修。',
  '5. 使用非原廠或不相容的電池、充電器、轉接環及配件造成的故障。',
  '6. 外觀磨損、刮傷、掉漆、橡皮老化等使用痕跡，以及耗材，如電池、背帶、鏡頭蓋、橡膠眼罩。',
  '7. 天災、意外、電壓異常等不可抗力因素造成的損壞。',
  '8. 序號或本店保固標籤遭撕毀、塗改。',
  '9. 軟體、韌體問題或資料遺失。檢測前請自行備份記憶卡資料。',
  '四、退換貨說明',
  '1. 本店為實體店面交易，不適用七天鑑賞期，也不接受買錯或不喜歡的退貨。',
  '2. 購買前歡迎在店內完整試用與檢查商品。',
  '3. 若日後需要轉售器材，本店可依租金或其他回購方案協助回收，詳情請洽門市人員。',
  '五、原廠保固（公司貨商品）',
  '1. 公司貨商品在售出前，本店都會與前手確認原廠保固狀態並提供相關憑證。',
  '2. 原廠保固權益不會因為沒有辦理保固轉移而受到影響，因此本店不提供保固轉移服務。',
  '3. 原廠保固期間內的故障，可持憑證直接送原廠維修，本店也可協助送修。',
  '4. 原廠保固到期後，維修一律由本店合作師傅處理，恕不接受指定送原廠。',
  '六、送修流程',
  '1. 請攜帶商品與本保固書（或會員資料）到門市辦理，或先聯絡本店安排寄修。',
  '2. 寄修的來回運費，保固內由本店負擔寄回運費，寄出運費由客戶自付。',
  '3. 維修期間約 7 到 21 個工作天，需要調貨零件或送原廠（限原廠保固期內）時會另行通知。',
  '4. 保固期滿或不在保固範圍內的維修，本店會先報價，經您同意後才進行。',
  '七、其他',
  '1. 保固只適用於原購買者本人，商品轉售後保固不隨之移轉。',
  '2. 本店保留檢測後判定是否屬於保固範圍的權利。',
  '3. 本保固書未盡事宜，依中華民國相關法律規定辦理。',
];

export const DEFAULT_TERMS = TERMS_LINES.join('\n');

export function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso, n) {
  if (!isIsoDate(iso) || !Number.isInteger(n)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// 該月沒有同日（例如 1/31 加一個月）就用月底。
export function addMonths(iso, n) {
  if (!isIsoDate(iso) || !Number.isInteger(n)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

// 交易日為第 1 天，迄日當天仍有效。一個月、六個月的迄日是往後的同一天。
export function periodEnd(start, period) {
  if (period === '7d') return addDays(start, 6);
  if (period === '1m') return addMonths(start, 1);
  if (period === '6m') return addMonths(start, 6);
  return '';
}

export function normalizePeriod(value) {
  const s = String(value ?? '').trim();
  if (s === '7d' || s === '7天' || s === '七天') return '7d';
  if (s === '1m' || s === '1個月' || s === '一個月') return '1m';
  if (s === '6m' || s === '6個月' || s === '六個月') return '6m';
  return '';
}

export function periodLabel(period) {
  return PERIODS.find((p) => p.value === period)?.label || '';
}

export function periodDisplay(label, start, end) {
  if (label && isIsoDate(start) && isIsoDate(end)) return `${label}（${start}～${end}）`;
  return label || '—';
}

// 畫面把「6個月（2026-11-01～2027-05-01）」拆開，日期各自不換行。字串本身不變。
export function fillValueParts(value) {
  const text = String(value || '—');
  const ranged = text.match(/^(.*?)（(\d{4}-\d{2}-\d{2})～(\d{4}-\d{2}-\d{2})）$/);
  if (ranged) return { name: ranged[1], start: ranged[2], end: ranged[3] };
  const single = text.match(/^(\d{4}-\d{2}-\d{2})(（已過期）)?$/);
  if (single) return { date: single[1], note: single[2] || '' };
  return { plain: text };
}

export function inferPeriod(start, end, label) {
  const fromLabel = normalizePeriod(label);
  if (fromLabel && periodEnd(start, fromLabel) === end) return fromLabel;
  for (const p of ['7d', '1m', '6m']) {
    if (periodEnd(start, p) === end) return p;
  }
  return fromLabel || DEFAULT_PERIOD;
}

export function normPhone(input) {
  let s = String(input ?? '').trim();
  s = s.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48));
  s = s.replace(/[\s\u3000().\-－—]/g, '');
  if (s.startsWith('+886')) s = s.slice(4);
  else if (s.startsWith('886') && s.length >= 11) s = s.slice(3);
  if (s && !s.startsWith('0')) s = '0' + s;
  if (!/^0\d{8,9}$/.test(s)) return '';
  return s;
}

export function formatPhone(input) {
  const n = normPhone(input);
  if (/^09\d{8}$/.test(n)) return `${n.slice(0, 4)}-${n.slice(4, 7)}-${n.slice(7)}`;
  return n || '—';
}

export function maskPhone(input) {
  const p = normPhone(input);
  if (!p) return '—';
  return `${p.slice(0, 4)}-***-${p.slice(-3)}`;
}

export function formatTwd(n) {
  if (n === null || n === undefined || n === '') return '—';
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return '—';
  const body = String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${x < 0 ? '-' : ''}NT$ ${body}`;
}

export function formulaString(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function safeQuery(s) {
  return String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
}

export function displayStatus(cert, today) {
  if (cert.status === STATUS_VOID) return STATUS_VOID;
  if (!isIsoDate(cert.shopEnd)) return '—';
  return cert.shopEnd >= today ? STATUS_ACTIVE : '已到期';
}

function clip(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function inRange(iso) {
  return isIsoDate(iso) && iso >= '1990-01-01' && iso <= '2100-12-31';
}

function asCompany(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

// 開立與修改共用。條款內文由伺服器從範本快照，不收畫面傳來的條款。
export function prepareIssue(input, today) {
  const src = input || {};
  const phone = normPhone(src.phone);
  if (!phone) return { error: '請填寫有效的電話（例：0912345678）' };
  const name = clip(src.name, 40);
  if (!name) return { error: '請填寫會員姓名（40 字以內）' };
  const emailRaw = clip(src.email, 80);
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) return { error: '電子信箱格式不正確' };
  const line = clip(src.line, 40);
  const product = clip(src.product, 120);
  if (!product) return { error: '請填寫商品名稱' };
  const serial = clip(src.serial, 80);
  if (!serial) return { error: '請填寫序號（沒有序號時請填「無」）' };
  const transactionDate = String(src.transactionDate || src.purchaseDate || src.date || '').trim();
  if (!inRange(transactionDate)) return { error: '請填寫交易日期' };
  if (transactionDate > addDays(today, 1)) return { error: '交易日期不能是未來' };

  let period;
  if (src.period === undefined || src.period === null || src.period === '') period = DEFAULT_PERIOD;
  else {
    period = normalizePeriod(src.period);
    if (!period) return { error: '保固期間請選 7天、1個月或 6個月' };
  }
  const shopEnd = periodEnd(transactionDate, period);
  if (!shopEnd) return { error: '保固迄日算不出來' };

  const company = asCompany(src.company);
  const mfgEnd = company ? String(src.mfgEnd || '').trim() : '';
  if (mfgEnd && !inRange(mfgEnd)) return { error: '原廠保固到期日不正確' };

  if (src.price === '' || src.price === null || src.price === undefined) return { error: '請填售價（沒有售價請填 0）' };
  const price = Math.round(Number(String(src.price).replace(/[,$\s]/g, '').replace(/^NT\$?/i, '')));
  if (!Number.isInteger(price) || price < 0 || price > 10000000) return { error: '售價請填 0 以上的整數' };

  return {
    phone,
    name,
    memberName: name,
    email: emailRaw,
    line,
    product,
    serial,
    transactionDate,
    period,
    periodLabel: periodLabel(period),
    shopStart: transactionDate,
    shopEnd,
    company,
    mfgEnd,
    price,
    staff: clip(src.staff, 40),
    note: clip(src.note, 1000),
    status: STATUS_ACTIVE,
  };
}

// 證書最底下這幾列一律用這張保固書的欄位填，不寫進條款範本。
export function bottomFields(cert, today) {
  const rows = [
    ['商品名稱', cert.product || '—'],
    ['序號', cert.serial || '—'],
    ['保固期間', periodDisplay(cert.periodLabel, cert.shopStart || cert.transactionDate, cert.shopEnd)],
    ['交易日期', cert.transactionDate || '—'],
    ['會員姓名/電話', `${cert.memberName || '—'} / ${formatPhone(cert.phone)}`],
  ];
  if (cert.company) {
    let value = '—';
    if (isIsoDate(cert.mfgEnd)) value = cert.mfgEnd + (cert.mfgEnd >= today ? '' : '（已過期）');
    rows.push(['公司貨 / 原廠保固到期日', value]);
  }
  return rows;
}

export function certView(fields, today, { token = false, note = false, phone = false } = {}) {
  const f = fields || {};
  const shopEnd = f['店保迄日'] || '';
  const shopStart = f['店保起日'] || '';
  const cert = {
    no: f['保固編號'] || '',
    product: f['商品名稱'] || '',
    serial: f['序號'] || '',
    transactionDate: f['交易日期'] || '',
    periodLabel: f['保固期間'] || '',
    shopStart,
    shopEnd,
    company: f['公司貨'] === true,
    mfgEnd: f['原廠保固到期'] || '',
    price: f['售價'] ?? null,
    terms: f['保固條款'] || '',
    status: f['狀態'] || '',
    staff: f['經手人員'] || '',
    issuedOn: f['開立日期'] || '',
    memberName: f['會員姓名'] || '',
    phoneMasked: maskPhone(f['會員電話'] || ''),
  };
  cert.displayStatus = displayStatus(cert, today);
  if (phone) cert.phone = f['會員電話'] || '';
  if (token) cert.token = f['查詢代碼'] || '';
  if (note) cert.note = f['備註'] || '';
  return cert;
}

export function certUrl(origin, token) {
  return `${String(origin || '').replace(/\/$/, '')}/c?t=${encodeURIComponent(token)}`;
}

export function guestMessage({ product, no, periodLabel, shopEnd, phone, code, url, company, mfgEnd }) {
  return [
    `${SHOP.name} 電子保固書`,
    product || '',
    no ? `保固編號 ${no}` : '',
    periodLabel ? `保固期間 ${periodLabel}${shopEnd ? `（至 ${shopEnd}，當天仍有效）` : ''}` : '',
    company ? `公司貨 / 原廠保固到期日 ${mfgEnd || '—'}` : '',
    url ? `查看證書 ${url}` : '',
    code ? `若連結打不開，可到同一網站輸入電話 ${formatPhone(phone)} 與驗證碼 ${code}。驗證碼可查到此電話名下所有保固，請勿轉傳。` : '',
  ].filter(Boolean).join('\n');
}

export const POS_HEADER_ALIASES = {
  name: ['名称', '名稱', '商品名稱', '商品名称'],
  category: ['分类', '分類'],
  sn: ['条码', '條碼', '商品条码', '商品條碼', '商品編號', '商品编号', '编号', '編號', '货号', '貨號', '序號', '序号', 'SN', 'S/N'],
  qty: ['库存量', '庫存量'],
  price: ['销售价', '銷售價', '商品售價', '售價'],
  notes: ['快門數', '備註', 'POS備註'],
  origin: ['公/水', '貨源', '貨品來源', '公水'],
  supplier: ['供货商', '供貨商'],
};

export function matchHeader(headers, aliases) {
  return headers.find((h) => aliases.includes(String(h).replace(/[（(]必填[)）]/g, '').trim())) || '';
}

export function posYear(y) {
  const n = parseInt(y, 10);
  if (!Number.isFinite(n)) return NaN;
  return n >= 100 && n < 200 ? n + 1911 : n < 100 ? 2000 + n : n;
}

export function mfgEndFromText(text) {
  const re = /(?:在保|保固|保)(?:至)?\s*(\d{2,4})[\/.\-](\d{1,2})(?:[\/.\-](\d{1,2}))?/g;
  let last = '';
  for (const m of String(text || '').matchAll(re)) {
    const y = posYear(m[1]);
    const mo = Number(m[2]);
    const d = m[3] ? Number(m[3]) : new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (!Number.isInteger(y) || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (isIsoDate(iso)) last = iso;
  }
  return last;
}

export function periodFromText(text) {
  const s = String(text || '');
  if (/(^|[^\d])7\s*天|七天/.test(s)) return '7d';
  if (/(^|[^\d])1\s*個月|一個月|(^|[^\d])30\s*天/.test(s)) return '1m';
  if (/6\s*個月|六個月|半年|180\s*天/.test(s)) return '6m';
  return '';
}

export function isCompanyOrigin(origin) {
  const s = String(origin || '').trim();
  if (!s || (/水/.test(s) && !/公司/.test(s))) return false;
  return /公司/.test(s);
}

export function posCaution(text, period) {
  const s = String(text || '');
  if (/寄賣|寄售|不保固|無保固/.test(s)) return '備註含有寄賣或不保固，請確認是否要開立、以及保固期間。';
  if (!period && /天|個月|保固|半年/.test(s)) return 'POS 的保固不是 7天／1個月／6個月，已先用預設 6個月，請再確認。';
  return '';
}

export function parsePosRecords(rows) {
  if (!Array.isArray(rows) || !rows.length) return { error: '檔案裡沒有資料', items: [] };
  const headers = Object.keys(rows[0] || {});
  const col = {};
  for (const [k, names] of Object.entries(POS_HEADER_ALIASES)) col[k] = matchHeader(headers, names);
  if (!col.name || !col.sn) return { error: '找不到「名稱」或「條碼」欄位，請確認是 POS 匯出的商品資料', items: [] };
  const items = [];
  for (const r of rows) {
    const get = (k) => (col[k] ? String(r[col[k]] ?? '').trim() : '');
    const name = get('name').replace(/\s+/g, ' ').trim();
    const sn = get('sn');
    if (!name || !sn) continue;
    if (col.qty && !(parseFloat(get('qty')) > 0)) continue;
    const rawNote = get('notes');
    const blob = [rawNote, name, get('supplier')].join(' ');
    const found = periodFromText(blob);
    const price = Math.round(parseFloat(get('price')) || 0);
    const company = isCompanyOrigin(get('origin'));
    items.push({
      name,
      sn,
      price: price > 0 ? String(price) : '',
      category: get('category'),
      period: found || DEFAULT_PERIOD,
      periodLabel: periodLabel(found || DEFAULT_PERIOD),
      company,
      mfgEnd: company ? mfgEndFromText(rawNote) : '',
      caution: posCaution(blob, found),
      rawNote,
    });
  }
  return { items };
}

export const MAX_CODE_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function isLocked(lockedUntil, nowMs) {
  if (!lockedUntil) return false;
  const t = Date.parse(lockedUntil);
  return Number.isFinite(t) && t > nowMs;
}

export function registerFailure(fails, nowMs) {
  const n = (Number(fails) || 0) + 1;
  if (n >= MAX_CODE_FAILS) return { fails: 0, lockedUntil: new Date(nowMs + LOCK_MS).toISOString() };
  return { fails: n, lockedUntil: '' };
}
