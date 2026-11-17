// 代替網頁把一列庫存寫進 Google 試算表。SHEET_SECRET 只放在 Netlify，由這裡帶去。
// 試算表那份 Apps Script 要貼上 apps-script/Code.gs 並設同一組密碼，直接打舊網址才會被拒絕。
import { allowRequest, clientIp } from '../lib/rate-limit.js';
import { sanitizeSheetRow } from '../lib/sheet-row.js';

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbx-afMzrAEbPKTpP7Kc4F0EWCUYXH87sfPGUUYXCAGipSW_TVJ7xZFZ_3hLW-l0sd0G/exec';
const MAX_BODY = 16_000;

async function postSheet(payload) {
  const first = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
  const read = async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: '試算表沒有回應' };
    }
  };
  if (first.status >= 300 && first.status < 400) {
    const loc = first.headers.get('location');
    if (!loc) return { error: '試算表沒有回應' };
    return read(await fetch(loc));
  }
  return read(first);
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: '只接受 POST' }, { status: 405 });
  }
  if (!allowRequest('sheet:' + clientIp(req, context), { limit: 90, windowMs: 10 * 60 * 1000 })) {
    return Response.json({ error: '送出太頻繁，請稍後再試' }, { status: 429 });
  }

  const secret = String(process.env.SHEET_SECRET || '').trim();
  if (secret.length < 16) {
    return Response.json({ error: '未設定試算表密碼（SHEET_SECRET 至少 16 個字）' }, { status: 500 });
  }

  const declared = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return Response.json({ error: '內容過大' }, { status: 413 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ error: '內容過大' }, { status: 413 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: '資料格式錯誤' }, { status: 400 });
  }

  const checked = sanitizeSheetRow(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

  let data;
  try {
    data = await postSheet({ ...checked.row, secret });
  } catch {
    return Response.json({ error: '試算表連不上' }, { status: 502 });
  }
  if (!data || data.success !== true) {
    return Response.json({ error: (data && data.error) || '試算表寫入失敗' }, { status: 502 });
  }
  return Response.json({ success: true });
};
