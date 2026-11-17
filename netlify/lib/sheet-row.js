// 寫進試算表前先收斂欄位。以 = + - @ 開頭的文字前面加 '，避免被當成公式。
// apps-script/Code.gs 裡有一份相同規則，貼回試算表後才擋得住直接打那個網址的人。

export function sheetText(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.charAt(0) === "'") return s;
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

// 純數字序號另外加 '，試算表才不會吃掉前面的 0。
export function asBarcode(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.charAt(0) === "'") return s;
  if (/^[=+\-@]/.test(s) || /^\d+$/.test(s)) return "'" + s;
  return s;
}

const TEXT_LIMITS = {
  '商品名稱': 120,
  '分類': 80,
  '品牌': 40,
  '供貨商': 40,
  '公水': 80,
  '快門數': 4000,
  '盒單': 40,
};

function fail(status, error) {
  return { ok: false, status, error };
}

function limitedText(value, max, label) {
  if (value == null) return { ok: true, value: '' };
  if (typeof value !== 'string' && typeof value !== 'number') return fail(400, label + '格式不對');
  const raw = String(value).trim();
  if (raw.length > max) return fail(400, label + '過長');
  return { ok: true, value: sheetText(raw) };
}

export function sanitizeSheetRow(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail(400, '資料格式錯誤');
  }
  const allowed = new Set([...Object.keys(TEXT_LIMITS), '條碼', '庫存量', '進貨價', '銷售價', 'airtableId']);
  for (const key of Object.keys(input)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return fail(400, '不接受的欄位');
    }
    if (!allowed.has(key)) return fail(400, '不接受的欄位：' + key);
  }

  const row = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    const text = limitedText(input[key], max, key);
    if (!text.ok) return text;
    row[key] = text.value;
  }
  if (!row['商品名稱']) return fail(400, '缺少商品名稱');

  const barcode = limitedText(input['條碼'], 80, '條碼');
  if (!barcode.ok) return barcode;
  row['條碼'] = asBarcode(input['條碼'] ?? '');

  const price = input['進貨價'];
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > 99_999_999) {
    return fail(400, '進貨價格式不對');
  }
  row['進貨價'] = price;
  row['庫存量'] = 1;
  // 銷售價只由店裡在試算表裡填，不接受同意書寫入。
  row['銷售價'] = '';

  const id = input.airtableId == null ? '' : String(input.airtableId).trim();
  if (id && !/^rec[A-Za-z0-9]{14}$/.test(id)) return fail(400, '紀錄編號格式不對');
  row.airtableId = id;
  return { ok: true, row };
}
