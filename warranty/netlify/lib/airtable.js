// 電子保固書的 Airtable 讀寫。基地預設跟收購紀錄同一個（appAuc0SgpUMOFLsv），表是另外三張。
import { DEFAULT_BASE_ID } from '../../shared/warranty.js';

const TABLE_NAME = /^[\u4e00-\u9fffA-Za-z0-9_．·\-]{1,40}$/;

export function airtableToken() {
  return (process.env.AIRTABLE_TOKEN || '').replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
}

export function baseId() {
  const id = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  if (!/^app[A-Za-z0-9]{14}$/.test(id)) {
    const err = new Error('AIRTABLE_BASE_ID 格式不對');
    err.status = 500;
    throw err;
  }
  return id;
}

function tableName(envKey, fallback) {
  const name = process.env[envKey] || fallback;
  if (!TABLE_NAME.test(name)) {
    const err = new Error(`${envKey} 表名只接受中文、英文、數字`);
    err.status = 500;
    throw err;
  }
  return name;
}

export function tables() {
  return {
    members: tableName('WARRANTY_MEMBERS_TABLE', '保固會員'),
    certs: tableName('WARRANTY_CERTS_TABLE', '電子保固書'),
    terms: tableName('WARRANTY_TERMS_TABLE', '保固條款範本'),
  };
}

function fail(res, data) {
  const err = new Error(data?.error?.message || data?.error || `Airtable ${res.status}`);
  err.status = res.status;
  err.detail = data;
  return err;
}

export async function airtable(table, path = '', { method = 'GET', body } = {}) {
  const token = airtableToken();
  if (!token) {
    const err = new Error('伺服器未設定 AIRTABLE_TOKEN');
    err.status = 500;
    throw err;
  }
  const res = await fetch(`https://api.airtable.com/v0/${baseId()}/${encodeURIComponent(table)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(res, data);
  return data;
}

export function metaUrl(path = '') {
  return `https://api.airtable.com/v0/meta/bases/${baseId()}${path}`;
}

export async function listRecords(table, { pageSize = 50, offset = '', formula = '', sortField = '', sortDir = 'desc' } = {}) {
  const q = new URLSearchParams();
  q.set('pageSize', String(pageSize));
  if (offset) q.set('offset', offset);
  if (formula) q.set('filterByFormula', formula);
  if (sortField) {
    q.set('sort[0][field]', sortField);
    q.set('sort[0][direction]', sortDir);
  }
  return airtable(table, `?${q}`);
}

export async function findRecords(table, formula, max = 2) {
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: String(max) });
  const data = await airtable(table, `?${q}`);
  return data.records || [];
}

export function createRecord(table, fields) {
  return airtable(table, '', { method: 'POST', body: { fields, typecast: true } });
}

export function patchRecord(table, id, fields) {
  return airtable(table, `/${id}`, { method: 'PATCH', body: { fields, typecast: true } });
}

export function getRecord(table, id) {
  return airtable(table, `/${id}`);
}

export function isMissingTable(err) {
  const type = err?.detail?.error?.type || '';
  const msg = err?.detail?.error?.message || err?.message || '';
  return type === 'TABLE_NOT_FOUND' || /Could not find table/i.test(msg) || err?.status === 404;
}
