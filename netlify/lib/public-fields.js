// 同意書送進 Airtable 的欄位。沒列在這裡的（售價、品類、商品介紹等）一律拒絕。
// 經手人員有列，因為櫃檯會在同意書上勾選。

export const MAX_BODY_CHARS = 200_000;

const STRING_LIMITS = {
  '客戶姓名': 100,
  '身分證字號': 20,
  '聯絡電話': 40,
  '電子信箱': 254,
  '得知管道': 200,
  '經手人員': 80,
  '乙方簽名': 20,
  '交易日期': 32,
  '器材一': 120,
  '器材二': 120,
  '器材三': 120,
  '付款方式': 20,
  '配件清單': 1500,
  '功能備註': 8000,
  '外觀備註': 4000,
  '快門數': 500,
  '原廠保固': 500,
  '貨品來源': 500,
  '新舊程度': 500,
  '序號': 200,
  '缺失配件': 4000,
  '保留報價': 1000,
  '盒裝': 40,
  '盒單': 40,
  '檢測報告': 100_000,
  '缺少配件': 1000,
  'CCD／Y2K': 40,
  '記憶卡類型': 500,
  '選單語言': 40,
};

const NUMBER_FIELDS = new Set(['收購總金額', '配件扣款', '評論購物金']);
const NULLABLE_NUMBERS = new Set(['配件扣款']);

export const PUBLIC_FIELD_NAMES = [...Object.keys(STRING_LIMITS), ...NUMBER_FIELDS];

function fail(status, error) {
  return { ok: false, status, error };
}

function cleanNumber(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > 99_999_999) return null;
  return value;
}

// body 是網頁送來的 JSON。通過時回傳只含允許欄位的 fields，可直接寫進 Airtable。
export function checkIntake(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, '資料格式錯誤');
  }
  for (const key of Object.keys(body)) {
    if (key !== 'fields' && key !== 'website') return fail(400, '不接受的欄位：' + key);
  }
  // 畫面上隱藏的「網站」欄。客人不會填，機器人常會填。
  if (String(body.website ?? '').trim()) return fail(400, '送出失敗');

  const fields = body.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return fail(400, '缺少 fields');
  }

  const clean = {};
  const keys = Object.keys(fields);
  if (keys.length > 40) return fail(400, '欄位過多');
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return fail(400, '不接受的欄位');
    }
    if (!Object.prototype.hasOwnProperty.call(STRING_LIMITS, key) && !NUMBER_FIELDS.has(key)) {
      return fail(400, '不接受的欄位：' + key);
    }
    const value = fields[key];
    if (NUMBER_FIELDS.has(key)) {
      if (value == null && NULLABLE_NUMBERS.has(key)) {
        clean[key] = null;
        continue;
      }
      const number = cleanNumber(value);
      if (number == null) return fail(400, key + '格式不對');
      clean[key] = number;
      continue;
    }
    if (typeof value !== 'string') return fail(400, key + '格式不對');
    const text = value.trim();
    if (text.length > STRING_LIMITS[key]) return fail(400, key + '過長');
    clean[key] = text;
  }

  if (!clean['客戶姓名']) return fail(400, '請填寫客戶姓名');
  return { ok: true, fields: clean };
}
