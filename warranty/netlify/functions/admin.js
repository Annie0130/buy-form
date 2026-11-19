// 保固後台。密碼放在 ADMIN_PASSWORD，Airtable 金鑰不進瀏覽器。
// 會員以正規化電話為鍵；保固書另外用「會員」欄連到那一筆（沒有這欄時仍靠電話）。
import { randomBytes, randomInt } from 'node:crypto';
import { adminPasswordOk } from '../lib/auth.js';
import {
  airtableToken, createRecord, findRecords, getRecord, listRecords, patchRecord, tables,
} from '../lib/airtable.js';
import { describeError, fail, json } from '../lib/errors.js';
import {
  DEFAULT_TERMS, STATUS_ACTIVE, STATUS_VOID, certView, formulaString,
  normPhone, prepareIssue, safeQuery, taipeiToday,
} from '../../shared/warranty.js';

const REC = /^rec[A-Za-z0-9]{14}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isId(id) {
  return REC.test(id || '');
}

function staffCert(record, today) {
  return {
    id: record.id,
    ...certView(record.fields, today, { token: true, note: true, phone: true }),
  };
}

function memberView(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    phone: f['電話'] || '',
    name: f['姓名'] || '',
    line: f['LINE'] || '',
    email: f['電子信箱'] || '',
    code: f['驗證碼'] || '',
    note: f['備註'] || '',
    created: f['建立日期'] || '',
    lockedUntil: f['鎖定到'] || '',
  };
}

function newCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

function newToken() {
  return randomBytes(16).toString('base64url');
}

function newNo(today) {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `LW${today.replace(/-/g, '')}-${s}`;
}

function defined(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

async function probe(table) {
  try {
    await listRecords(table, { pageSize: 1 });
    return 'ok';
  } catch (err) {
    const type = err?.detail?.error?.type || '';
    const msg = err?.detail?.error?.message || '';
    if (type === 'TABLE_NOT_FOUND' || /Could not find table/i.test(msg) || err.status === 404) return 'missing';
    if (type === 'UNAUTHORIZED' || err.status === 401 || err.status === 403) return 'denied';
    return 'error';
  }
}

async function findMember(phone) {
  const recs = await findRecords(tables().members, `{電話}="${phone}"`, 2);
  if (recs.length > 1) throw fail(409, '這個電話有兩筆會員，請到 Airtable 刪掉重複的一筆');
  return recs[0] || null;
}

async function upsertMember({ phone, name, email, line }) {
  const existing = await findMember(phone);
  if (!existing) {
    const record = await createRecord(tables().members, defined({
      '電話': phone,
      '姓名': name,
      '電子信箱': email,
      'LINE': line,
      '驗證碼': newCode(),
      '失敗次數': 0,
      '建立日期': taipeiToday(),
    }));
    return { record, created: true };
  }
  const fields = {};
  if (name && name !== (existing.fields['姓名'] || '')) fields['姓名'] = name;
  if (email && email !== (existing.fields['電子信箱'] || '')) fields['電子信箱'] = email;
  if (line && line !== (existing.fields['LINE'] || '')) fields['LINE'] = line;
  if (!Object.keys(fields).length) return { record: existing, created: false };
  const record = await patchRecord(tables().members, existing.id, fields);
  if (fields['姓名']) await syncCerts(phone, { '會員姓名': fields['姓名'] });
  return { record, created: false };
}

async function syncCerts(phone, fields) {
  const ids = [];
  let offset = '';
  do {
    const data = await listRecords(tables().certs, {
      pageSize: 50,
      offset,
      formula: `{會員電話}="${formulaString(phone)}"`,
    });
    for (const rec of data.records || []) ids.push(rec.id);
    offset = data.offset || '';
  } while (offset);
  for (const id of ids) await patchRecord(tables().certs, id, fields);
}

async function currentTerms() {
  const data = await listRecords(tables().terms, { pageSize: 10 });
  const rec = (data.records || []).find((r) => r.fields['名稱'] === '預設') || data.records?.[0];
  const text = String(rec?.fields['內容'] || '').trim();
  return { text: text || DEFAULT_TERMS, id: rec?.id || '' };
}

async function findActiveSerial(serial) {
  return findRecords(
    tables().certs,
    `AND({序號}="${formulaString(serial)}",{狀態}!="${STATUS_VOID}")`,
    2,
  );
}

function certPayload(prepared, extra) {
  return {
    '保固編號': extra.no,
    '查詢代碼': extra.token,
    '會員電話': prepared.phone,
    '會員姓名': prepared.name,
    '商品名稱': prepared.product,
    '序號': prepared.serial,
    '交易日期': prepared.transactionDate,
    '保固期間': prepared.periodLabel,
    '店保起日': prepared.shopStart,
    '店保迄日': prepared.shopEnd,
    '公司貨': prepared.company,
    '原廠保固到期': prepared.mfgEnd || null,
    '售價': prepared.price,
    '保固條款': extra.terms,
    '狀態': prepared.status || STATUS_ACTIVE,
    '經手人員': prepared.staff,
    '備註': prepared.note,
    '開立日期': extra.issuedOn,
    '會員': extra.memberId ? [extra.memberId] : undefined,
  };
}

async function writeCert(fields, id) {
  const table = tables().certs;
  const send = (payload) => (id ? patchRecord(table, id, payload) : createRecord(table, payload));
  try {
    return await send(fields);
  } catch (err) {
    if (err?.detail?.error?.type === 'UNKNOWN_FIELD_NAME' && fields['會員']) {
      const copy = { ...fields };
      delete copy['會員'];
      return send(copy);
    }
    throw err;
  }
}

async function issue(body) {
  const today = taipeiToday();
  const prepared = prepareIssue(body, today);
  if (prepared.error) throw fail(400, prepared.error);
  const { text: terms } = await currentTerms();
  const member = await upsertMember(prepared);
  if (!body?.force) {
    const dup = await findActiveSerial(prepared.serial);
    const other = dup.find(Boolean);
    if (other) {
      throw fail(409, '此序號已有未作廢的保固書', { existing: staffCert(other, today) });
    }
  }
  const fields = defined(certPayload(prepared, {
    no: newNo(today),
    token: newToken(),
    terms,
    issuedOn: today,
    memberId: member.record.id,
  }));
  fields['公司貨'] = prepared.company;
  const record = await writeCert(fields);
  return {
    certificate: staffCert(record, today),
    member: { ...memberView(member.record), isNew: member.created },
  };
}

async function updateCert(body) {
  if (!isId(body?.id)) throw fail(400, '紀錄編號不正確');
  const today = taipeiToday();
  const prepared = prepareIssue(body, today);
  if (prepared.error) throw fail(400, prepared.error);
  const existing = await getRecord(tables().certs, body.id);
  const member = await upsertMember(prepared);
  if (!body.force) {
    const dup = await findActiveSerial(prepared.serial);
    const other = dup.find((r) => r.id !== body.id);
    if (other) throw fail(409, '此序號已有另一張未作廢的保固書', { existing: staffCert(other, today) });
  }
  const fields = defined({
    '會員電話': prepared.phone,
    '會員姓名': prepared.name,
    '商品名稱': prepared.product,
    '序號': prepared.serial,
    '交易日期': prepared.transactionDate,
    '保固期間': prepared.periodLabel,
    '店保起日': prepared.shopStart,
    '店保迄日': prepared.shopEnd,
    '售價': prepared.price,
    '經手人員': prepared.staff,
    '備註': prepared.note,
    '會員': [member.record.id],
  });
  fields['公司貨'] = prepared.company;
  fields['原廠保固到期'] = prepared.mfgEnd || null;
  if (body.refreshTerms) fields['保固條款'] = (await currentTerms()).text;
  const record = await writeCert(fields, body.id);
  record.fields = { ...existing.fields, ...record.fields };
  return { certificate: staffCert(record, today), member: memberView(member.record) };
}

async function saveMember(body) {
  const phone = normPhone(body?.phone);
  if (!phone) throw fail(400, '請填寫有效的電話（例：0912345678）');
  const name = String(body?.name || '').trim();
  if (!name || name.length > 40) throw fail(400, '請填寫會員姓名（40 字以內）');
  const email = String(body?.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, '電子信箱格式不正確');
  const line = String(body?.line || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  const note = String(body?.note || '').trim().slice(0, 1000);
  if (body?.id) {
    if (!isId(body.id)) throw fail(400, '紀錄編號不正確');
    const existing = await getRecord(tables().members, body.id);
    const oldPhone = existing.fields['電話'] || '';
    if (phone !== oldPhone) {
      const clash = await findMember(phone);
      if (clash && clash.id !== body.id) throw fail(409, '這個電話已經是另一位會員');
      await syncCerts(oldPhone, { '會員電話': phone, '會員姓名': name });
    } else if (name !== (existing.fields['姓名'] || '')) {
      await syncCerts(oldPhone, { '會員姓名': name });
    }
    const record = await patchRecord(tables().members, body.id, {
      '電話': phone,
      '姓名': name,
      '電子信箱': email || null,
      'LINE': line || null,
      '備註': note,
    });
    return { member: memberView(record) };
  }
  const existing = await findMember(phone);
  if (existing) throw fail(409, '這個電話已經是會員，請直接搜尋');
  const record = await createRecord(tables().members, defined({
    '電話': phone,
    '姓名': name,
    '電子信箱': email,
    'LINE': line,
    '備註': note,
    '驗證碼': newCode(),
    '失敗次數': 0,
    '建立日期': taipeiToday(),
  }));
  return { member: memberView(record), created: true };
}

function memberFormula(q) {
  const query = safeQuery(q);
  if (!query) return '';
  const phone = normPhone(query);
  const s = formulaString(query.toLowerCase());
  const parts = [
    `FIND("${s}",LOWER({姓名}&""))`,
    `FIND("${s}",LOWER({LINE}&""))`,
    `FIND("${s}",LOWER({電子信箱}&""))`,
    `FIND("${formulaString(query)}",{電話}&"")`,
  ];
  if (phone) parts.push(`{電話}="${phone}"`);
  return `OR(${parts.join(',')})`;
}

function certFormula(q) {
  const query = safeQuery(q);
  if (!query) return '';
  const s = formulaString(query.toLowerCase());
  return `OR(FIND("${s}",LOWER({商品名稱}&"")),FIND("${s}",LOWER({序號}&"")),FIND("${s}",LOWER({會員電話}&"")),FIND("${s}",LOWER({會員姓名}&"")),FIND("${s}",LOWER({保固編號}&"")),FIND("${s}",LOWER({保固期間}&"")))`;
}

async function handle(req) {
  const url = new URL(req.url);
  const op = url.searchParams.get('op') || '';
  const today = taipeiToday();
  const { members, certs } = tables();

  if (req.method === 'GET' && op === 'status') {
    const names = tables();
    const [a, b, c] = await Promise.all([probe(names.members), probe(names.certs), probe(names.terms)]);
    const state = { members: a, certs: b, terms: c };
    let hint = '';
    if (Object.values(state).every((v) => v === 'denied')) hint = 'AIRTABLE_TOKEN 無效，或沒有這個基地的權限。';
    else if (Object.values(state).some((v) => v === 'missing')) hint = '資料表還沒建好。';
    return json({ ok: true, tables: state, names, hint });
  }

  if (req.method === 'GET' && op === 'member') {
    const phone = normPhone(url.searchParams.get('phone'));
    if (!phone) throw fail(400, '請填寫有效的電話');
    const record = await findMember(phone);
    return json(record ? { found: true, member: memberView(record) } : { found: false, phone });
  }

  if (req.method === 'GET' && op === 'members') {
    const offset = url.searchParams.get('offset') || '';
    if (offset && !/^[\w/$-]{1,200}$/.test(offset)) throw fail(400, '分頁參數不正確');
    const data = await listRecords(members, {
      pageSize: 20, offset, formula: memberFormula(url.searchParams.get('q') || ''),
      sortField: '建立日期', sortDir: 'desc',
    });
    return json({
      members: (data.records || []).map(memberView),
      offset: data.offset || '',
    });
  }

  if (req.method === 'GET' && op === 'certs') {
    const offset = url.searchParams.get('offset') || '';
    if (offset && !/^[\w/$-]{1,200}$/.test(offset)) throw fail(400, '分頁參數不正確');
    const data = await listRecords(certs, {
      pageSize: 50, offset, formula: certFormula(url.searchParams.get('q') || ''),
      sortField: '開立日期', sortDir: 'desc',
    });
    return json({
      certificates: (data.records || []).map((r) => staffCert(r, today)),
      offset: data.offset || '',
    });
  }

  if (req.method === 'GET' && op === 'cert') {
    const id = url.searchParams.get('id');
    if (!isId(id)) throw fail(400, '紀錄編號不正確');
    const record = await getRecord(certs, id);
    const phone = record.fields['會員電話'] || '';
    const member = phone ? await findMember(phone) : null;
    return json({ certificate: staffCert(record, today), member: member ? memberView(member) : null });
  }

  if (req.method === 'GET' && op === 'terms') {
    const got = await currentTerms();
    return json({ terms: got.text, fallback: !got.id });
  }

  if (req.method !== 'POST') return json({ error: '不支援的操作' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: '資料格式錯誤' }, 400); }

  if (op === 'member') return json(await saveMember(body));
  if (op === 'reset-code') {
    const phone = normPhone(body?.phone);
    if (!phone) throw fail(400, '請填寫有效的電話');
    const record = await findMember(phone);
    if (!record) throw fail(404, '找不到這個電話的會員');
    const updated = await patchRecord(members, record.id, { '驗證碼': newCode(), '失敗次數': 0, '鎖定到': null });
    return json({ member: memberView(updated) });
  }
  if (op === 'issue') return json(await issue(body));
  if (op === 'update') return json(await updateCert(body));
  if (op === 'void') {
    if (!isId(body?.id)) throw fail(400, '紀錄編號不正確');
    const status = body.void === false ? STATUS_ACTIVE : STATUS_VOID;
    const record = await patchRecord(certs, body.id, { '狀態': status });
    return json({ certificate: staffCert(record, today) });
  }
  if (op === 'terms') {
    const text = String(body?.terms || '').trim();
    if (text.length < 20) throw fail(400, '條款太短');
    if (text.length > 20000) throw fail(400, '條款太長');
    const got = await currentTerms();
    if (got.id && !got.fallback) {
      await patchRecord(tables().terms, got.id, { '內容': text, '名稱': '預設' });
    } else {
      const data = await listRecords(tables().terms, { pageSize: 1 });
      const existing = data.records?.[0];
      if (existing) await patchRecord(tables().terms, existing.id, { '內容': text, '名稱': '預設' });
      else await createRecord(tables().terms, { '名稱': '預設', '內容': text });
    }
    return json({ ok: true });
  }
  return json({ error: '不支援的操作' }, 405);
}

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD || !airtableToken()) {
    return json({ error: '伺服器未設定 AIRTABLE_TOKEN 或 ADMIN_PASSWORD' }, 500);
  }
  if (!adminPasswordOk(req)) return json({ error: '密碼錯誤' }, 401);
  try {
    return await handle(req);
  } catch (err) {
    const mapped = describeError(err);
    return json({ error: mapped.error, ...(err.extra || {}) }, mapped.status);
  }
};
