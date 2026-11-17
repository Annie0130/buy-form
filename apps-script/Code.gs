// Google 試算表「匯入時只能有他」背後的 Apps Script。
// 這份是備份；實際執行的是試算表「擴充功能 → Apps Script」裡的那份，改完要貼回去並重新部署。
//
// 1. 合約網站送出收購時，doGet / doPost 新增一列，並在那一列記下 Airtable 紀錄編號（隱藏的列資料，匯出時不會出現）
// 2. 在試算表 KEY「銷售價」（F 欄）時，onPriceEdit 自動寫進 Airtable 的「售價」（清空儲存格不會刪掉 Airtable 的售價）
//
// Airtable 金鑰放在「專案設定 → 指令碼屬性」的 AIRTABLE_TOKEN，不要寫在程式碼裡。
//
// ── 這次要一起做的事（沒做完之前，外人仍可直接寫入試算表）──
// 1. 把這整份貼回試算表的 Apps Script，存檔。
// 2. 「部署 → 管理部署作業 → 鉛筆（編輯）→ 版本選新版本 → 部署」。
//    要編輯現在這一個部署，不要按「新增部署」，網址才不會變。
// 3. 這時候先不要填 SHEET_SECRET。指令碼屬性是空的時，寫入照舊放行，
//    同意書才不會突然寫不進試算表。
// 4. 等收購同意書和收購後台都會送出同一組密碼之後，再到
//    「專案設定 → 指令碼屬性」新增 SHEET_SECRET（至少 16 個字，跟兩個 Netlify 同一組）。
//    填了以後，沒帶對密碼的寫入會被拒絕。
// 儲存格內容若以 =、+、-、@ 開頭，前面會加 '，避免試算表把它當成公式。
// 已經有 ' 的不要再加。純數字的條碼仍加 '，前面的 0 才不會被吃掉。進貨價維持數字。

const SPREADSHEET_ID = '1uUw1kFe80JUpMBUYM6e5rijMwB75BoBioNNs8DzwXys';
const SHEET_NAME = '匯入時只能有他';
const PRICE_COLUMN = 6;  // F 欄：銷售價（必填）
const AIRTABLE_URL = 'https://api.airtable.com/v0/appAuc0SgpUMOFLsv/tblnOp2xI0RPOAR3J';
const ID_KEY = 'airtableId';

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: '資料格式錯誤' });
  }
  if (!sheetSecretOk(data)) return jsonOut({ error: '沒有權限' });
  return handleData(data);
}

function doGet(e) {
  if (e.parameter && e.parameter['商品名稱']) {
    if (!sheetSecretOk(e.parameter)) return jsonOut({ error: '沒有權限' });
    return handleData(e.parameter);
  }
  return ContentService.createTextOutput('OK');
}

// 比對兩組 SHA-256，長度固定，避免從回應速度猜密碼。
// 指令碼屬性還沒有 SHEET_SECRET 時先放行，等兩個網站都會送密碼再填上。
function sheetSecretOk(data) {
  const expected = String(PropertiesService.getScriptProperties().getProperty('SHEET_SECRET') || '').trim();
  if (!expected) return true;
  const provided = data && data.secret != null ? String(data.secret).trim() : '';
  if (expected.length < 16 || provided.length < 16) return false;
  const digest = function(s) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
    return bytes.map(function(b) {
      const v = (b + 256) % 256;
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  };
  return digest(provided) === digest(expected);
}

// 以 = + - @ 開頭時前面加 '，試算表才不會把它當公式。
function cellText(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (s.charAt(0) === "'") return s;
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

// 序號像數字時（例如 008362），前面加 ' 讓試算表當成文字，前面的 0 才不會被吃掉。
// 公式開頭同樣加 '。
function asText(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (s.charAt(0) === "'") return s;
  if (/^[=+\-@]/.test(s) || /^\d+$/.test(s)) return "'" + s;
  return s;
}

// 數字欄若被塞了公式文字，改成純文字；負數也當成文字，不讓它以 - 開頭執行。
function sheetNumber(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'number' && isFinite(v) && v >= 0) return v;
  const s = String(v).trim();
  if (/^[=+\-@]/.test(s)) return "'" + s;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return "'" + s;
}

function handleData(data) {
  // 好幾台器材會同時送進來，排隊寫入，避免記錯列
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    sheet.appendRow([
      cellText(data['商品名稱']),
      cellText(data['分類']),
      asText(data['條碼']),
      sheetNumber(data['庫存量'], 1),
      sheetNumber(data['進貨價'], ''),
      sheetNumber(data['銷售價'], ''),
      cellText(data['品牌']),
      cellText(data['供貨商']),
      cellText(data['公水']),
      cellText(data['快門數']),
      cellText(data['盒單']),
    ]);
    if (data[ID_KEY]) {
      const row = sheet.getLastRow();
      sheet.getRange(row + ':' + row).addDeveloperMetadata(ID_KEY, String(data[ID_KEY]));
    }
    return ContentService.createTextOutput(JSON.stringify({success: true}))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// 由「可安裝的編輯觸發條件」呼叫（執行一次 setupPriceSync 就會建立）
function onPriceEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getColumn() > PRICE_COLUMN || range.getLastColumn() < PRICE_COLUMN) return;

  const token = getToken();
  if (!token) throw new Error('請在「專案設定 → 指令碼屬性」加入 AIRTABLE_TOKEN');

  for (let row = Math.max(range.getRow(), 2); row <= range.getLastRow(); row++) {
    const id = findAirtableId(sheet, row, token);
    if (!id) continue;
    const raw = String(sheet.getRange(row, PRICE_COLUMN).getValue()).replace(/[^\d.]/g, '');
    // 清空儲存格（或刪掉內容）不會把收購後台的售價刪掉；只有打數字才會改
    if (!raw) continue;
    const price = Number(raw);
    const res = UrlFetchApp.fetch(AIRTABLE_URL + '/' + id, {
      method: 'patch',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ fields: { '售價': price } }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) {
      console.error('第 ' + row + ' 列售價同步失敗：' + res.getContentText());
    }
  }
}

// 先看這一列有沒有記下 Airtable 編號；舊的列沒有，就用商品名稱＋條碼（序號）找唯一的一筆，找到後記下來
function findAirtableId(sheet, row, token) {
  const rowRange = sheet.getRange(row + ':' + row);
  const meta = rowRange.getDeveloperMetadata().find(m => m.getKey() === ID_KEY);
  if (meta) return meta.getValue();

  const name = String(sheet.getRange(row, 1).getDisplayValue()).trim();
  const serial = String(sheet.getRange(row, 3).getDisplayValue()).trim();
  if (!name) return '';
  const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // 試算表可能把序號前面的 0 吃掉（008362 → 8362），所以純數字的序號比對時忽略前面的 0
  const serialCond = /^\d+$/.test(serial)
    ? 'REGEX_MATCH({序號}&"","^0*' + serial.replace(/^0+/, '') + '$")'
    : '{序號}="' + esc(serial) + '"';
  const formula = serial
    ? 'AND({器材一}="' + esc(name) + '",' + serialCond + ')'
    : '{器材一}="' + esc(name) + '"';
  const res = UrlFetchApp.fetch(AIRTABLE_URL + '?maxRecords=2&filterByFormula=' + encodeURIComponent(formula), {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    console.error('第 ' + row + ' 列查詢 Airtable 失敗（' + res.getResponseCode() + '）：' + res.getContentText());
    return '';
  }
  const records = JSON.parse(res.getContentText()).records || [];
  if (records.length !== 1) {
    console.warn('第 ' + row + ' 列找不到唯一對應的 Airtable 紀錄（找到 ' + records.length + ' 筆），略過');
    return '';
  }
  rowRange.addDeveloperMetadata(ID_KEY, records[0].id);
  return records[0].id;
}

// Airtable 金鑰只會有英文、數字和「.」，複製時夾帶的空白、換行、隱形字元都去掉
function getToken() {
  const raw = PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN') || '';
  return raw.replace(/^Bearer\s+/i, '').replace(/[^A-Za-z0-9.]/g, '');
}

// 檢查金鑰用：在上方選 checkToken 按「執行」，看執行紀錄（不會印出完整金鑰）
function checkToken() {
  const raw = PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN') || '';
  const token = getToken();
  console.log('原始長度 ' + raw.length + '，清理後長度 ' + token.length
    + '，開頭 ' + token.slice(0, 3) + '，含「.」：' + token.includes('.')
    + '，被清掉的字元碼：' + (Array.from(raw).filter(c => !/[A-Za-z0-9.]/.test(c)).map(c => c.charCodeAt(0)).join(',') || '無'));
  const res = UrlFetchApp.fetch(AIRTABLE_URL + '?maxRecords=1', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  console.log('Airtable 回應 ' + res.getResponseCode() + '：' + res.getContentText().slice(0, 150).replace(/"fields":\{.*$/, '…'));
}

// 只要執行一次：建立「編輯試算表時自動同步售價」的觸發條件
function setupPriceSync() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onPriceEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onPriceEdit').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
}
