// 代替網頁把收購紀錄寫進 Airtable，金鑰只存在 Netlify 環境變數裡，不會出現在網頁上。
// 只允許「新增一筆紀錄」到固定的表格，無法讀取或刪除資料。
// 只接受同意書實際會送的欄位，售價、品類、商品介紹等不能由外面指定。
// 新增成功後，若有設定 ANTHROPIC_API_KEY，會在背景請 AI 判斷品類、寫商品介紹並補進這筆紀錄。
import { describeGear } from '../lib/describe.js';
import { checkIntake, MAX_BODY_CHARS } from '../lib/public-fields.js';
import { allowRequest, clientIp } from '../lib/rate-limit.js';

const BASE_ID = 'appAuc0SgpUMOFLsv';
const TABLE_ID = 'tblnOp2xI0RPOAR3J';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

async function fillGearInfo(token, recordId, name) {
  try {
    const result = await describeGear(name);
    if (!result) return;
    const fields = {};
    if (result.intro) fields['商品介紹'] = result.intro;
    if (result.category) fields['品類'] = result.category;
    if (!Object.keys(fields).length) return;
    await fetch(`${AIRTABLE_URL}/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    // 失敗沒關係：後台打開商品卡時會再補一次
    console.error('自動填入品類／商品介紹失敗', err);
  }
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!allowRequest('airtable:' + clientIp(req, context), { limit: 90, windowMs: 10 * 60 * 1000 })) {
    return Response.json({ error: '送出太頻繁，請稍後再試' }, { status: 429 });
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return Response.json({ error: '伺服器未設定 AIRTABLE_TOKEN' }, { status: 500 });
  }

  const declared = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
    return Response.json({ error: '內容過大' }, { status: 413 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return Response.json({ error: '內容過大' }, { status: 413 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: '資料格式錯誤' }, { status: 400 });
  }
  const checked = checkIntake(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

  const res = await fetch(AIRTABLE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: checked.fields }),
  });
  const data = await res.json();

  const name = checked.fields['器材一'] || '';
  if (res.ok && data.id && name && process.env.ANTHROPIC_API_KEY) {
    // 先回覆網頁，不讓客人等 AI
    context.waitUntil(fillGearInfo(token, data.id, name));
  }
  return Response.json(data, { status: res.status });
};
