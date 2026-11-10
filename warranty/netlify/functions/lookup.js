// 客人查保固書。憑證書連結，或電話＋驗證碼。不收後台密碼，也不回驗證碼。
import { timingSafeEqual } from 'node:crypto';
import { findRecords, listRecords, patchRecord, tables } from '../lib/airtable.js';
import { json } from '../lib/errors.js';
import {
  SHOP, certView, formulaString, isLocked, normPhone, registerFailure, taipeiToday,
} from '../../shared/warranty.js';

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

function codesMatch(stored, given) {
  const a = Buffer.from(String(stored || '').trim());
  const b = Buffer.from(String(given || '').trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function visible(record, today) {
  return certView(record.fields, today, { token: true, phone: true });
}

async function byToken(token) {
  if (!TOKEN.test(token)) return json({ error: '找不到這張保固書' }, 404);
  const { certs } = tables();
  const recs = await findRecords(certs, `{查詢代碼}="${token}"`, 2);
  if (recs.length !== 1) return json({ error: '找不到這張保固書，請改用電話與驗證碼查詢' }, 404);
  return json({ shop: SHOP, certificate: visible(recs[0], taipeiToday()) });
}

async function byMember(body) {
  const phone = normPhone(body?.phone);
  const code = String(body?.code || '').trim();
  const bad = { error: '電話或驗證碼不正確' };
  if (!phone || !/^\d{6}$/.test(code)) {
    await new Promise((r) => setTimeout(r, 400));
    return json(bad, 401);
  }
  const { members, certs } = tables();
  const found = await findRecords(members, `{電話}="${phone}"`, 2);
  if (found.length !== 1) {
    await new Promise((r) => setTimeout(r, 400));
    return json(bad, 401);
  }
  const member = found[0];
  const fields = member.fields || {};
  const now = Date.now();
  if (isLocked(fields['鎖定到'], now)) {
    return json({ error: '嘗試次數過多，請 15 分鐘後再試，或到門市請店員重設驗證碼' }, 429);
  }
  if (!codesMatch(fields['驗證碼'], code)) {
    const next = registerFailure(fields['失敗次數'], now);
    await patchRecord(members, member.id, {
      '失敗次數': next.fails,
      '鎖定到': next.lockedUntil || null,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    return json(bad, 401);
  }
  if (fields['失敗次數'] || fields['鎖定到']) {
    await patchRecord(members, member.id, { '失敗次數': 0, '鎖定到': null }).catch(() => {});
  }
  const today = taipeiToday();
  const data = await listRecords(certs, {
    pageSize: 100,
    formula: `{會員電話}="${formulaString(phone)}"`,
  });
  const certificates = (data.records || [])
    .map((r) => visible(r, today))
    .sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || '') || b.no.localeCompare(a.no));
  return json({
    shop: SHOP,
    memberName: fields['姓名'] || '',
    phone,
    certificates,
  });
}

export default async (req) => {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      return await byToken(url.searchParams.get('t') || url.searchParams.get('token') || '');
    }
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: '資料格式錯誤' }, 400); }
      return await byMember(body);
    }
    return json({ error: '不支援的操作' }, 405);
  } catch (err) {
    const type = err?.detail?.error?.type || '';
    if (type === 'TABLE_NOT_FOUND' || /Could not find table/i.test(err?.message || '')) {
      return json({ error: '保固資料還沒建好，請聯絡門市' }, 404);
    }
    console.error(err);
    return json({ error: '查詢失敗，請稍後再試' }, 502);
  }
};
