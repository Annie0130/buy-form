// Google 試算表「匯入時只能有他」背後的 Apps Script。
// 這份是備份；實際執行的是試算表「擴充功能 → Apps Script」裡的那份，改完要貼回去並重新部署。
//
// 1. 合約網站送出收購時，doGet / doPost 新增一列，並在那一列記下 Airtable 紀錄編號（隱藏的列資料，匯出時不會出現）
// 2. 在試算表 KEY「銷售價」（F 欄）時，onPriceEdit 自動寫進 Airtable 的「售價」
//
// Airtable 金鑰放在「專案設定 → 指令碼屬性」的 AIRTABLE_TOKEN，不要寫在程式碼裡。

const SPREADSHEET_ID = '1uUw1kFe80JUpMBUYM6e5rijMwB75BoBioNNs8DzwXys';
const SHEET_NAME = '匯入時只能有他';
const PRICE_COLUMN = 6;  // F 欄：銷售價（必填）
const AIRTABLE_URL = 'https://api.airtable.com/v0/appAuc0SgpUMOFLsv/tblnOp2xI0RPOAR3J';
const ID_KEY = 'airtableId';

function doPost(e) {
  return handleData(JSON.parse(e.postData.contents));
}

function doGet(e) {
  if(e.parameter && e.parameter['商品名稱']){
    return handleData(e.parameter);
  }
  return ContentService.createTextOutput('OK');
}

function handleData(data) {
  // 好幾台器材會同時送進來，排隊寫入，避免記錯列
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    sheet.appendRow([
      data['商品名稱'] || '',
      data['分類'] || '',
      data['條碼'] || '',
      data['庫存量'] || 1,
      data['進貨價'] || '',
      data['銷售價'] || '',
      data['品牌'] || '',
      data['供貨商'] || '',
      data['公水'] || '',
      data['快門數'] || '',
      data['盒單'] || '',
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
    const price = raw ? Number(raw) : null;
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
  const formula = serial
    ? 'AND({器材一}="' + esc(name) + '",{序號}="' + esc(serial) + '")'
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
