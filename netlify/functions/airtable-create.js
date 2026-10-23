// 代替網頁把收購紀錄寫進 Airtable，金鑰只存在 Netlify 環境變數裡，不會出現在網頁上。
// 只允許「新增一筆紀錄」到固定的表格，無法讀取或刪除資料。
const BASE_ID = 'appAuc0SgpUMOFLsv';
const TABLE_ID = 'tblnOp2xI0RPOAR3J';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return Response.json({ error: '伺服器未設定 AIRTABLE_TOKEN' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '資料格式錯誤' }, { status: 400 });
  }
  if (!body || typeof body.fields !== 'object' || Array.isArray(body.fields)) {
    return Response.json({ error: '缺少 fields' }, { status: 400 });
  }

  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: body.fields }),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
};
