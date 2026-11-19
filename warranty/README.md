# 林相攝影電子保固書

給門市開立保固、給客人查看與列印的獨立網站。收購同意書（這個倉庫的根目錄）沒有改發布方式，請另外開一個 Netlify 網站，Base directory 設成 `warranty`。

## 現有兩個工具的架構

收購同意書與收購後台是同一種做法：

- 單一靜態 HTML，繁體中文，黑底頂列，`PingFang TC` / `Noto Sans TC`
- Netlify Functions 代呼叫 Airtable，金鑰只放在環境變數
- 同一個 Airtable 基地 `appAuc0SgpUMOFLsv`
  - 收購紀錄表 `tblnOp2xI0RPOAR3J`（同意書寫入、後台讀寫）
  - POS 庫存表 `tbl3FSkUsoTqeTt4j`（後台匯入 POS 檔、選商品、AI 寫介紹、印商品卡）
- 後台密碼放在 `ADMIN_PASSWORD`，瀏覽器用 `x-admin-password` 帶過去，這台電腦記得 30 天
- 同意書另外把收購寫進 Google 試算表（Apps Script），並用既有的寄信 API `https://linscam-email-api-lpvi.vercel.app/api/send-email`
- `netlify.toml` 的 publish 是倉庫根目錄。保固書不使用那份設定

## 會員

公開的專案裡沒有客人會員系統。

- `buy-form` / `buy-backstage` 的客人只有收購紀錄上的姓名、電話、信箱，評論折抵金也是用電話認人
- `camera-repair` 是維修單，資料在瀏覽器與另一支 Apps Script，不是會員
- `linscam-schedule` 是員工排班
- `Linscam-email-api` 只寄信
- `POSsystem`、`lins-camera-ai` 在公開的 GitHub 上找不到

因此在同一個 Airtable 基地另開「保固會員」表。一支電話一筆（電話會先整理成 `09xxxxxxxx` 這種寫法）。欄位是姓名、電話、LINE（可空）、電子信箱（可空）、建立日期。後台可以建立、搜尋、修改。每張保固書記下這支電話，並盡量用 Airtable 的連結欄位「會員」連到那一筆。

客人沒有另外的帳號密碼。查看方式有兩種：

1. 開立時產生的證書連結／QR Code（只打開那一張）
2. 電話＋ 6 位數驗證碼（看這支電話名下所有保固）。驗證碼存在會員上，店員可以重設。連續錯 5 次會鎖 15 分鐘。驗證碼不要印在保固書上，因為條款寫明保固不隨轉售移轉，而這組碼能看到該電話的每一張保固

## 這個網站做什麼

- 後台 `index.html`：查會員或順便建立、開立保固、修改、作廢、搜尋、重設驗證碼、編輯條款範本。可選 POS 匯出檔，把名稱、序號、售價、保固期間、公司貨與原廠到期日帶進表單（不寫回 POS 庫存）
- 客人頁 `certificate.html`（網址 `/c`）：看保固書、列印或存 PDF、複製連結
- 保固期間只有 **7天 / 1個月 / 6個月**，預設 **6個月**
- 交易日是第 1 天，迄日當天仍有效。七天是再加 6 天。一個月、六個月是往後的同一天；那個月沒有這一天（例如 1 月 31 日加一個月）就用該月最後一天
- 條款用店家定稿，開立當下抄進該張保固書。之後改範本，舊證書不變
- 證書底部永遠用該張紀錄填這幾欄，不寫在範本文字裡：商品名稱、序號、保固期間、交易日期、會員姓名/電話
- 勾了「公司貨」才顯示並印出「公司貨 / 原廠保固到期日」。水貨不出現這欄
- 售價存在後台，不印在證書上（定稿的底部欄位沒有售價）
- 經手人員沿用同意書的名單：Annie、陳貢丸、AMY、EASON、孟

## 建立 Netlify 網站

1. 不要改現有「收購同意書」那個網站的 Base directory、Build command 或環境變數。
2. Netlify → Add new site → Import an existing project → 選 `Annie0130/buy-form` 這個倉庫。
3. Branch 用 `main`（這個功能合併之後）。
4. **Base directory** 填 `warranty`。
5. **Build command** 留空。
6. **Publish directory** 填 `.`（相對於 `warranty`。若畫面要求從倉庫根目錄算，才填 `warranty`）。
7. Functions 目錄不用另外填，`warranty/netlify.toml` 已寫 `netlify/functions`。
8. 環境變數（Site configuration → Environment variables）：

| 名稱 | 必填 | 說明 |
| --- | --- | --- |
| `AIRTABLE_TOKEN` | 是 | 跟收購網站同一把即可。權限要有 `data.records:read`、`data.records:write`。按「建立資料表」還要 `schema.bases:write`。範圍要包含基地 `appAuc0SgpUMOFLsv` |
| `ADMIN_PASSWORD` | 是 | 後台密碼。可以與收購後台相同，但這個新網站要再設一次 |
| `AIRTABLE_BASE_ID` | 否 | 預設 `appAuc0SgpUMOFLsv` |
| `WARRANTY_MEMBERS_TABLE` | 否 | 預設 `保固會員` |
| `WARRANTY_CERTS_TABLE` | 否 | 預設 `電子保固書` |
| `WARRANTY_TERMS_TABLE` | 否 | 預設 `保固條款範本` |

9. Deploy。打開新網站網址，輸入後台密碼，按右上角 **建立資料表**。成功時會在同一個基地出現三張表，並把店家定稿寫進條款範本（若範本已有內容，不會覆蓋）。
10. 把新網站網址留給門市。客人連結會是 `https://你的網址/c?t=...`。不要把收購同意書網址後面的 `/warranty` 給客人，那只是原始碼被舊網站一起發布，功能不會通。

寄信沿用既有的寄信 API，沒有新的金鑰。信箱沒填、或寄信失敗，保固書仍然算開立完成。

## 金鑰不能建表時，手動建立

在基地 `appAuc0SgpUMOFLsv` 建三張表。第一欄名稱要對。

**保固會員**（第一欄「電話」）

電話、姓名、LINE、電子信箱、驗證碼、備註（長文字）、失敗次數（數字）、鎖定到（單行文字）、建立日期（日期）

**電子保固書**（第一欄「保固編號」）

保固編號、查詢代碼、會員電話、會員姓名、商品名稱、序號、交易日期（日期）、保固期間（單選：7天、1個月、6個月）、店保起日（日期）、店保迄日（日期）、公司貨（核取方塊）、原廠保固到期（日期）、售價（數字）、保固條款（長文字）、狀態（單選：有效、已作廢）、經手人員、備註（長文字）、開立日期（日期）

再加一個連結欄位「會員」，連到「保固會員」。沒有這欄也可以用，系統仍用電話對會員。

**保固條款範本**（第一欄「名稱」）

名稱、內容（長文字）。新增一筆，名稱填 `預設`，內容可先空白，到後台按「載入店家定稿」再儲存。

建完再按一次「建立資料表」，它只會補缺少的欄位。

## 本地檢查

```bash
cd warranty
npm test
```
