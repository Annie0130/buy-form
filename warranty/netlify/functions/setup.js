// 在收購紀錄同一個 Airtable 基地建立保固會員、電子保固書、保固條款範本。
// 已存在的表與欄位不覆蓋、不刪除。需要金鑰有 schema.bases:write。
import { adminPasswordOk } from '../lib/auth.js';
import { airtableToken, baseId, createRecord, findRecords, metaUrl, tables } from '../lib/airtable.js';
import { json } from '../lib/errors.js';
import { DEFAULT_TERMS } from '../../shared/warranty.js';

const date = (name) => ({ name, type: 'date', options: { dateFormat: { name: 'iso', format: 'YYYY-MM-DD' } } });
const num = (name) => ({ name, type: 'number', options: { precision: 0 } });
const text = (name) => ({ name, type: 'singleLineText' });
const long = (name) => ({ name, type: 'multilineText' });
const checkbox = (name) => ({ name, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } });
const select = (name, choices) => ({
  name,
  type: 'singleSelect',
  options: { choices: choices.map(([choice, color]) => ({ name: choice, color })) },
});

function specs() {
  const t = tables();
  return [
    {
      name: t.members,
      description: '林相攝影保固會員。一支電話一筆，保固書連到這裡。',
      fields: [
        text('電話'), text('姓名'), text('LINE'), text('電子信箱'), text('驗證碼'),
        long('備註'), num('失敗次數'), text('鎖定到'), date('建立日期'),
      ],
    },
    {
      name: t.certs,
      description: '林相攝影電子保固書。一筆證書一份，條款在開立時固定。',
      fields: [
        text('保固編號'), text('查詢代碼'), text('會員電話'), text('會員姓名'),
        text('商品名稱'), text('序號'), date('交易日期'),
        select('保固期間', [['7天', 'yellowBright'], ['1個月', 'orangeBright'], ['6個月', 'greenBright']]),
        date('店保起日'), date('店保迄日'), checkbox('公司貨'), date('原廠保固到期'),
        num('售價'), long('保固條款'),
        select('狀態', [['有效', 'greenBright'], ['已作廢', 'redBright']]),
        text('經手人員'), long('備註'), date('開立日期'),
      ],
    },
    {
      name: t.terms,
      description: '電子保固書條款範本。改這裡只影響之後新開的證書。',
      fields: [text('名稱'), long('內容')],
    },
  ];
}

async function meta(path, method, body) {
  const token = airtableToken();
  for (let i = 0; i < 2; i++) {
    const res = await fetch(metaUrl(path), {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && i === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }
  return { res: { ok: false, status: 500 }, data: {} };
}

async function listTables() {
  const all = [];
  let offset = '';
  do {
    const { res, data } = await meta(`/tables${offset ? `?offset=${encodeURIComponent(offset)}` : ''}`, 'GET');
    if (!res.ok) return { error: data, status: res.status, tables: [] };
    all.push(...(data.tables || []));
    offset = data.offset || '';
  } while (offset);
  return { tables: all };
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: '不支援的操作' }, 405);
  if (!process.env.ADMIN_PASSWORD || !airtableToken()) {
    return json({ error: '伺服器未設定 AIRTABLE_TOKEN 或 ADMIN_PASSWORD' }, 500);
  }
  if (!adminPasswordOk(req)) return json({ error: '密碼錯誤' }, 401);

  const listed = await listTables();
  if (listed.error) {
    const denied = listed.status === 401 || listed.status === 403;
    return json({
      error: denied
        ? '這組 AIRTABLE_TOKEN 不能建立資料表。請在 Airtable 的 token 加上 schema.bases:write、data.records:read、data.records:write，範圍包含這個基地；或依 README 手動建表後再試。'
        : `讀取資料表失敗：${listed.error?.error?.message || listed.status}`,
    }, 400);
  }

  const byName = new Map(listed.tables.map((t) => [t.name, t]));
  const created = [];
  const fieldsAdded = [];
  const warnings = [];

  for (const spec of specs()) {
    let table = byName.get(spec.name);
    if (!table) {
      const { res, data } = await meta('/tables', 'POST', {
        name: spec.name, description: spec.description, fields: spec.fields,
      });
      if (!res.ok) {
        return json({ error: `建立「${spec.name}」失敗：${data?.error?.message || res.status}`, created, fieldsAdded }, 400);
      }
      table = data;
      byName.set(spec.name, table);
      created.push(spec.name);
      continue;
    }
    const have = new Set((table.fields || []).map((f) => f.name));
    const primary = (table.fields || []).find((f) => f.id === table.primaryFieldId);
    if (primary && primary.name !== spec.fields[0].name) {
      warnings.push(`「${spec.name}」的第一欄是「${primary.name}」，預期是「${spec.fields[0].name}」。`);
    }
    for (const field of spec.fields) {
      if (have.has(field.name)) continue;
      const { res, data } = await meta(`/tables/${table.id}/fields`, 'POST', field);
      if (!res.ok) {
        warnings.push(`「${spec.name}」加欄位「${field.name}」失敗：${data?.error?.message || res.status}`);
      } else {
        fieldsAdded.push(`${spec.name}.${field.name}`);
        have.add(field.name);
      }
    }
  }

  const members = byName.get(tables().members);
  const certs = byName.get(tables().certs);
  let linked = false;
  if (members?.id && certs?.id) {
    const fresh = await listTables();
    const certTable = (fresh.tables || []).find((t) => t.name === tables().certs) || certs;
    const hasLink = (certTable.fields || []).some((f) => f.name === '會員');
    if (!hasLink) {
      const { res, data } = await meta(`/tables/${certTable.id}/fields`, 'POST', {
        name: '會員',
        type: 'multipleRecordLinks',
        options: { linkedTableId: members.id },
      });
      if (res.ok) {
        linked = true;
        fieldsAdded.push(`${tables().certs}.會員`);
      } else {
        warnings.push(`保固書連到會員的欄位沒建成：${data?.error?.message || res.status}。沒有這欄也可以用，系統仍用電話對會員。`);
      }
    } else linked = true;
  }

  let termsSeeded = false;
  try {
    const existing = await findRecords(tables().terms, '{名稱}="預設"', 1);
    if (!existing.length) {
      await createRecord(tables().terms, { '名稱': '預設', '內容': DEFAULT_TERMS });
      termsSeeded = true;
    }
  } catch (err) {
    warnings.push(`條款範本沒寫入：${err.message}`);
  }

  return json({
    ok: true,
    baseId: baseId(),
    tables: specs().map((s) => s.name),
    created,
    fieldsAdded,
    linked,
    termsSeeded,
    warnings,
  });
};
