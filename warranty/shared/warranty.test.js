import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERMS, PERIODS, DEFAULT_PERIOD, normPhone, formatPhone, maskPhone,
  addDays, addMonths, periodEnd, prepareIssue, displayStatus, bottomFields, fillValueParts,
  inferPeriod, formatTwd, periodFromText, mfgEndFromText, parsePosRecords,
  guestMessage, registerFailure, isLocked, MAX_CODE_FAILS, formulaString, escHtml,
  STATUS_VOID,
} from './warranty.js';

const today = '2026-11-10';
const valid = {
  phone: '0912-345-678',
  name: '王小明',
  product: 'Sony A7C',
  serial: '1234567',
  purchaseDate: today,
  price: '28,000',
  staff: 'Annie',
};

test('條款是店家定稿，逐行固定', () => {
  const lines = DEFAULT_TERMS.split('\n');
  assert.equal(lines.length, 35);
  assert.equal(lines.every((l) => l.length > 0), true);
  assert.equal(lines[0], '林相攝影 二手器材保固書');
  assert.equal(lines[1], '感謝您選購林相攝影的商品。每件器材出貨前都經過檢測與清潔，為保障雙方權益，請詳閱以下保固條款。');
  assert.equal(lines[3], '1. 保固期間依商品標示，分為七天、一個月及六個月三種，以本保固書記載的期間為準。');
  assert.equal(lines[8], '1. 螢幕（含觸控功能、亮點、壞點、漏光、色偏）。');
  assert.equal(lines[18], '1. 本店為實體店面交易，不適用七天鑑賞期，也不接受買錯或不喜歡的退貨。');
  assert.equal(lines[23], '2. 原廠保固權益不會因為沒有辦理保固轉移而受到影響，因此本店不提供保固轉移服務。');
  assert.equal(lines[29], '3. 維修期間約 7 到 21 個工作天，需要調貨零件或送原廠（限原廠保固期內）時會另行通知。');
  assert.equal(lines[32], '1. 保固只適用於原購買者本人，商品轉售後保固不隨之移轉。');
  assert.equal(lines[34], '3. 本保固書未盡事宜，依中華民國相關法律規定辦理。');
  assert.equal(DEFAULT_TERMS.includes('過戶'), false);
  assert.equal(DEFAULT_TERMS.includes('退還價金'), false);
});

test('保固期間只有三種，預設六個月', () => {
  assert.deepEqual(PERIODS.map((p) => p.label), ['7天', '1個月', '6個月']);
  assert.equal(DEFAULT_PERIOD, '6m');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(periodEnd('2026-11-10', '7d'), '2026-11-16');
  assert.equal(periodEnd('2026-11-10', '1m'), '2026-12-10');
  assert.equal(periodEnd('2026-11-10', '6m'), '2027-05-10');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
});

test('開立資料', () => {
  const ok = prepareIssue(valid, today);
  assert.equal(ok.error, undefined);
  assert.equal(ok.phone, '0912345678');
  assert.equal(ok.price, 28000);
  assert.equal(ok.period, '6m');
  assert.equal(ok.periodLabel, '6個月');
  assert.equal(ok.shopEnd, '2027-05-10');
  assert.equal(ok.company, false);
  assert.equal(ok.mfgEnd, '');

  const week = prepareIssue({ ...valid, period: '7天' }, today);
  assert.equal(week.period, '7d');
  assert.equal(week.shopEnd, '2026-11-16');

  const company = prepareIssue({ ...valid, company: true, mfgEnd: '2027-03-31' }, today);
  assert.equal(company.company, true);
  assert.equal(company.mfgEnd, '2027-03-31');
  const ignored = prepareIssue({ ...valid, company: false, mfgEnd: '2027-03-31' }, today);
  assert.equal(ignored.mfgEnd, '');

  assert.equal(prepareIssue({ ...valid, phone: '123' }, today).error.includes('電話'), true);
  assert.equal(prepareIssue({ ...valid, period: '14天' }, today).error.includes('7天'), true);
  assert.equal(prepareIssue({ ...valid, purchaseDate: '2026-11-12' }, today).error.includes('未來'), true);
  assert.equal(prepareIssue({ ...valid, line: 'wangline' }, today).line, 'wangline');
});

test('證書底部欄位從紀錄填，公司貨才多一列', () => {
  const base = {
    product: 'Sony A7C', serial: '123', periodLabel: '6個月',
    shopStart: '2026-11-10', shopEnd: '2027-05-10', transactionDate: '2026-11-10',
    memberName: '王小明', phone: '0912345678', company: false,
  };
  const rows = bottomFields(base, today);
  assert.deepEqual(rows.map((r) => r[0]), ['商品名稱', '序號', '保固期間', '交易日期', '會員姓名/電話']);
  assert.equal(rows[2][1], '6個月（2026-11-10～2027-05-10）');
  assert.deepEqual(fillValueParts(rows[2][1]), { name: '6個月', start: '2026-11-10', end: '2027-05-10' });
  assert.deepEqual(fillValueParts('2027-06-30'), { date: '2027-06-30', note: '' });
  assert.deepEqual(fillValueParts('2026-01-01（已過期）'), { date: '2026-01-01', note: '（已過期）' });
  assert.equal(rows[4][1], '王小明 / 0912-345-678');
  const withCo = bottomFields({ ...base, company: true, mfgEnd: '2027-03-31' }, today);
  assert.equal(withCo[5][0], '公司貨 / 原廠保固到期日');
  assert.equal(withCo[5][1], '2027-03-31');
  const old = bottomFields({ ...base, company: true, mfgEnd: '2026-01-01' }, today);
  assert.match(old[5][1], /已過期/);
});

test('店保狀態看店保迄日，不看原廠到期日', () => {
  assert.equal(displayStatus({ status: '有效', shopEnd: today }, today), '有效');
  assert.equal(displayStatus({ status: '有效', shopEnd: '2026-11-09' }, today), '已到期');
  assert.equal(displayStatus({ status: STATUS_VOID, shopEnd: '2027-01-01' }, today), '已作廢');
  assert.equal(inferPeriod('2026-11-10', '2027-05-10', '6個月'), '6m');
});

test('電話', () => {
  assert.equal(normPhone('0912-345-678'), '0912345678');
  assert.equal(normPhone('+886912345678'), '0912345678');
  assert.equal(normPhone('０９１２３４５６７８'), '0912345678');
  assert.equal(normPhone('123'), '');
  assert.equal(formatPhone('0912345678'), '0912-345-678');
  assert.equal(maskPhone('0912345678'), '0912-***-678');
});

test('POS 帶入對到三種期間與公司貨', () => {
  assert.equal(periodFromText('半年保固(180天)'), '6m');
  assert.equal(periodFromText('售出7天保固'), '7d');
  assert.equal(periodFromText('一個月保固'), '1m');
  assert.equal(periodFromText('快門9000次'), '');
  assert.equal(mfgEndFromText('在保至2027/3/31'), '2027-03-31');
  assert.equal(mfgEndFromText('保固至113/6/1'), '2024-06-01');
  const parsed = parsePosRecords([
    { '名称': 'Sony A7C', '条码': '008362', '销售价': '28000', '库存量': '1', '公/水': '公司貨', '快門數': '半年保固 | 在保至2027/3/31' },
    { '名称': 'Ricoh GR', '条码': '1', '销售价': '9000', '库存量': '1', '公/水': '水貨', '快門數': '7天保固' },
    { '名称': '配件電池', '条码': '2', '库存量': '0', '分类': '配件類' },
  ]);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].period, '6m');
  assert.equal(parsed.items[0].company, true);
  assert.equal(parsed.items[0].mfgEnd, '2027-03-31');
  assert.equal(parsed.items[0].sn, '008362');
  assert.equal(parsed.items[1].period, '7d');
  assert.equal(parsed.items[1].company, false);
  assert.equal(parsed.items[1].mfgEnd, '');
});

test('給客人的訊息與驗證碼鎖定', () => {
  const text = guestMessage({ product: 'Sony A7C', no: 'LW1', periodLabel: '6個月', shopEnd: '2027-05-10', phone: '0912345678', code: '123456', url: 'https://example/c?t=abc' });
  assert.match(text, /123456/);
  assert.match(text, /請勿轉傳/);
  const linkOnly = guestMessage({ product: 'Sony A7C', no: 'LW1', periodLabel: '6個月', code: '', url: 'https://example/c?t=abc' });
  assert.equal(linkOnly.includes('驗證碼'), false);
  const now = Date.parse('2026-11-10T00:00:00Z');
  let fails = 0;
  let locked = '';
  for (let i = 0; i < MAX_CODE_FAILS - 1; i++) {
    const next = registerFailure(fails, now);
    fails = next.fails;
    locked = next.lockedUntil;
    assert.equal(isLocked(locked, now), false);
  }
  const last = registerFailure(fails, now);
  assert.equal(isLocked(last.lockedUntil, now + 1000), true);
  assert.equal(formulaString('a"b\\c'), 'a\\"b\\\\c');
  assert.equal(formatTwd(28000), 'NT$ 28,000');
  assert.equal(escHtml('<img alt="x">'), '&lt;img alt=&quot;x&quot;&gt;');
});
