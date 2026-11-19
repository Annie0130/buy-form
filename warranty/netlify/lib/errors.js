export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(status, error, extra) {
  const err = new Error(error);
  err.status = status;
  err.extra = extra || null;
  return err;
}

export function describeError(err) {
  const type = err?.detail?.error?.type || '';
  const msg = err?.detail?.error?.message || err?.message || '';
  if (type === 'TABLE_NOT_FOUND' || /Could not find table/i.test(msg)) {
    return { status: 400, error: '還沒有建立資料表，請按「建立資料表」。' };
  }
  if (type === 'UNKNOWN_FIELD_NAME') {
    return { status: 400, error: '資料表缺少欄位，請再按一次「建立資料表」。' };
  }
  if (type === 'UNAUTHORIZED' || err?.status === 401) {
    return { status: 502, error: 'AIRTABLE_TOKEN 無效或沒有這個基地的權限。' };
  }
  if (err?.status === 400 || err?.status === 404 || err?.status === 409 || err?.status === 429) {
    return { status: err.status, error: err.message };
  }
  if (err?.status === 422) return { status: 400, error: `資料沒有寫入：${msg}` };
  return { status: 502, error: `寫入失敗：${msg || '請稍後再試'}` };
}
