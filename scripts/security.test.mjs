import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkIntake, PUBLIC_FIELD_NAMES } from '../netlify/lib/public-fields.js';
import { allowRequest } from '../netlify/lib/rate-limit.js';
import { asBarcode, sanitizeSheetRow, sheetText } from '../netlify/lib/sheet-row.js';
import { receiptPayload } from '../netlify/functions/send-receipt.js';

const sampleFields = {
  '客戶姓名': '王小明',
  '身分證字號': 'A123456789',
  '聯絡電話': '0912345678',
  '電子信箱': 'guest@example.com',
  '得知管道': 'google_map',
  '經手人員': 'Annie、陳貢丸',
  '乙方簽名': '已簽名',
  '交易日期': '2026-11-17',
  '器材一': 'Sony A7C',
  '器材二': '',
  '器材三': '',
  '收購總金額': 12000,
  '付款方式': '現金',
  '配件清單': '電池、充電器',
  '功能備註': '',
  '外觀備註': '',
  '快門數': '9000',
  '原廠保固': '已過保',
  '貨品來源': '水貨',
  '新舊程度': '近無使用痕跡',
  '序號': '008362',
  '缺失配件': '—',
  '保留報價': '無',
  '盒裝': '有盒子',
  '盒單': '無盒無單',
  '檢測報告': '<p>檢測</p>',
  '缺少配件': '',
  '配件扣款': null,
  'CCD／Y2K': 'CCD 相機',
  '記憶卡類型': 'SD／Micro SD',
  '選單語言': '有中文',
  '評論購物金': 500,
};

const ok = checkIntake({ website: '', fields: sampleFields });
assert.equal(ok.ok, true);
assert.equal(ok.fields['經手人員'], 'Annie、陳貢丸');
assert.equal(ok.fields['配件扣款'], null);
assert.equal(ok.fields['收購總金額'], 12000);
assert.equal('售價' in ok.fields, false);

for (const blocked of ['售價', '品類', '商品介紹', 'html', 'website']) {
  const blockedResult = checkIntake({ fields: { ...sampleFields, [blocked]: 'x' } });
  assert.equal(blockedResult.ok, false, blocked);
  assert.match(blockedResult.error, /不接受的欄位/);
}

assert.equal(checkIntake({ website: 'https://spam.example', fields: sampleFields }).ok, false);
assert.equal(checkIntake({ fields: { ...sampleFields, '客戶姓名': '' } }).ok, false);
assert.equal(checkIntake({ fields: { ...sampleFields, '客戶姓名': '名'.repeat(101) } }).ok, false);
assert.equal(checkIntake({ fields: { ...sampleFields, '收購總金額': -1 } }).ok, false);
assert.equal(checkIntake({ fields: { ...sampleFields, '收購總金額': '12000' } }).ok, false);
assert.equal(checkIntake({ html: '<p>', fields: sampleFields }).ok, false);
assert.equal(PUBLIC_FIELD_NAMES.includes('售價'), false);
assert.equal(PUBLIC_FIELD_NAMES.includes('經手人員'), true);
assert.equal(PUBLIC_FIELD_NAMES.includes('客戶姓名'), true);

assert.equal(sheetText("'=1+1"), "'=1+1");
assert.equal(sheetText('Sony A7C'), 'Sony A7C');
assert.equal(sheetText('=1+1'), "'=1+1");
assert.equal(sheetText('+886'), "'+886");
assert.equal(sheetText('-10'), "'-10");
assert.equal(sheetText('@sum(A1)'), "'@sum(A1)");
assert.equal(sheetText('  =HYPERLINK("http://evil")'), '\'=HYPERLINK("http://evil")');
assert.equal(asBarcode('008362'), "'008362");
assert.equal(asBarcode('=008'), "'=008");
assert.equal(asBarcode('SN-1'), 'SN-1');

const row = sanitizeSheetRow({
  '商品名稱': '=cmd|"x"',
  '分類': 'Sony 相機',
  '條碼': '008362',
  '庫存量': 9,
  '進貨價': 12000,
  '銷售價': 99999,
  '品牌': 'Sony',
  '供貨商': '現場客人',
  '公水': '水貨',
  '快門數': '在保 | 電池',
  '盒單': '有盒有單',
  airtableId: 'recABCDEFGHIJKLMN',
});
assert.equal(row.ok, true);
assert.equal(row.row['商品名稱'], '\'=cmd|"x"');
assert.equal(row.row['條碼'], "'008362");
assert.equal(row.row['銷售價'], '');
assert.equal(row.row['庫存量'], 1);
assert.equal(row.row['進貨價'], 12000);
assert.equal(sanitizeSheetRow({ '商品名稱': 'A7', '進貨價': '=1' }).ok, false);
assert.equal(sanitizeSheetRow({ '商品名稱': 'A7', '進貨價': 1, '售價': 9 }).ok, false);

const mail = receiptPayload({
  to: 'guest@example.com',
  customerName: '王小明',
  txDate: '2026-11-17',
  amount: 12000,
  payment: '現金',
  accessories: '電池',
  items: [{ decision: 'sell', name: 'Sony A7C' }],
  reports: [{ name: 'Sony A7C', acc: '電池', fn: '全數正常' }],
  html: '<p>injected</p>',
  subject: '假主旨',
  cc: 'attacker@example.com',
});
assert.equal(mail.template, 'buyout-receipt');
assert.equal(mail.to, 'guest@example.com');
assert.equal('html' in mail, false);
assert.equal('subject' in mail, false);
assert.equal('cc' in mail, false);
assert.deepEqual(mail.items, [{ decision: 'sell', name: 'Sony A7C' }]);

const rateKey = 'test:' + Math.random();
assert.equal(allowRequest(rateKey, { limit: 2, windowMs: 60_000 }), true);
assert.equal(allowRequest(rateKey, { limit: 2, windowMs: 60_000 }), true);
assert.equal(allowRequest(rateKey, { limit: 2, windowMs: 60_000 }), false);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /\/\.netlify\/functions\/send-receipt/);
assert.match(html, /\/\.netlify\/functions\/write-sheet/);
assert.match(html, /id="hp-field"/);
assert.equal(html.includes('linscam-email-api'), false);
assert.equal(html.includes('script.google.com'), false);
assert.equal(html.includes('subject:'), false);

const receipt = fs.readFileSync(new URL('../netlify/functions/send-receipt.js', import.meta.url), 'utf8');
assert.match(receipt, /x-email-secret/);
assert.match(receipt, /EMAIL_API_SECRET/);
assert.equal(receipt.includes('x-admin-password'), false);
assert.equal(receipt.includes('ADMIN_PASSWORD'), false);

const sheet = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
assert.match(sheet, /if \(!expected\) return true/);
assert.match(sheet, /SHEET_SECRET/);
assert.match(sheet, /\[=\+\\-@\]/);
assert.match(sheet, /secret/);

console.log('security checks ok');
