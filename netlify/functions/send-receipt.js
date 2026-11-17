// 櫃檯送出同意書時寄確認信。密碼只放在 Netlify 的 EMAIL_API_SECRET，不放在網頁。
// 這裡不檢查收購後台的登入密碼，否則櫃檯沒登入後台就寄不出去。
import { allowRequest, clientIp } from '../lib/rate-limit.js';

const EMAIL_API = 'https://linscam-email-api-lpvi.vercel.app/api/send-email';
const MAX_BODY = 32 * 1024;

export function receiptPayload(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  return {
    template: 'buyout-receipt',
    to: source.to,
    customerName: source.customerName,
    txDate: source.txDate,
    amount: source.amount,
    payment: source.payment,
    accessories: source.accessories,
    items: source.items,
    reports: source.reports,
  };
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: '只接受 POST' }, { status: 405 });
  }
  if (!allowRequest('mail:' + clientIp(req, context), { limit: 30, windowMs: 10 * 60 * 1000 })) {
    return Response.json({ error: '送出太頻繁，請稍後再試' }, { status: 429 });
  }

  const secret = String(process.env.EMAIL_API_SECRET || '').trim();
  if (secret.length < 16) {
    return Response.json({ error: '未設定寄信密碼（EMAIL_API_SECRET 至少 16 個字）' }, { status: 500 });
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

  let res;
  try {
    res = await fetch(EMAIL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-email-secret': secret,
      },
      body: JSON.stringify(receiptPayload(body)),
    });
  } catch {
    return Response.json({ error: '寄信服務連不上' }, { status: 502 });
  }
  const data = await res.json().catch(() => ({ error: '寄信服務沒有回應' }));
  return Response.json(data, { status: res.status });
};
