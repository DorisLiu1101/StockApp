export const GAS_SCRIPT_DATA = `
/**
 * ==========================================
 * 維股利 後端 API (v21_交易紀錄擴充版)
 * 更新日期: 2026-02-14
 * 版本說明:
 * 1. History Sheet 新增寫入欄位：Amount (H欄) = Price * Qty
 * 2. 欄位順序調整以匹配資料庫結構
 * ==========================================
 */

// 1. 設定報告資料夾 ID (已鎖定您提供的目標資料夾)
var REPORT_FOLDER_ID = "1GdtSyWHYhwZ8JnugPGzgBhIRwXKScIZR";

// 全域匯率變數 (預設值，會由 doGet/doPost 動態更新)
var FX_RATES = { 'TW': 1, 'US': 31.5, 'JP': 0.215 };

/**
 * 處理 App 前端 "讀取" 請求 (首頁/清單資料)
 */
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
 
   // 1. 讀取匯率與現金 (Funds Sheet)
  var fundsSheet = ss.getSheetByName('Funds');
  var totalCashTWD = 0;

  if (fundsSheet) {
    var fundsData = fundsSheet.getDataRange().getValues();
     // 從第 2 行開始 (跳過標題)
    for (var j = 1; j < fundsData.length; j++) {
      var fRow = fundsData[j];
      var account = String(fRow[0]).toUpperCase();
      var currency = String(fRow[1]).toUpperCase();
      var rate = Number(fRow[2]) || 1;
      var position = Number(fRow[3]) || 0;
     
       // 更新全域匯率
      if (currency === 'TWD') FX_RATES['TW'] = rate;
      if (currency === 'USD') FX_RATES['US'] = rate;
      if (currency === 'JPY') FX_RATES['JP'] = rate;
     
      if (account === 'CASH') totalCashTWD += (position * rate);
    }
  }
 
   // 2. 讀取各市場持股 (TW, US, JP)
  var totalStockValueTWD = 0;
  var totalStockCostTWD = 0;
  var sectorMap = {};
  var portfolio = [];
  var targetSheets = ['TW', 'US', 'JP'];

  for (var s = 0; s < targetSheets.length; s++) {
    var sheetName = targetSheets[s];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
   
    var data = sheet.getDataRange().getValues();
    var rate = FX_RATES[sheetName] || 1;

     // 從第 2 行開始讀取持股
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
       // 若無股號則跳過
      if (!row[0]) continue;

      var item = {
        symbol: String(row[0]),
        name: row[1],
        sector: row[2],
        expReturn: row[3],
        pricey: Number(row[4]) || 0,
        cheap: Number(row[5]) || 0,
        price: Number(row[6]) || 0,
        cost: Number(row[7]) || 0,  
        qty: Number(row[8]) || 0,  
        market: sheetName,    
        marketValue: 0,
        gain: 0,
        gainPct: 0
      };

       // 計算數值 (TWD)
      var marketValueTWD = item.qty * item.price * rate;
      var costValueTWD = item.qty * item.cost * rate;
     
      item.marketValue = Math.round(marketValueTWD);
      item.gain = Math.round(marketValueTWD - costValueTWD);
       // 報酬率
      item.gainPct = (costValueTWD > 0) ? ((item.gain / costValueTWD) * 100).toFixed(2) : 0;
       // 原幣損益 (供前端顯示)
      item.gainOrg = (item.price - item.cost) * item.qty;

      portfolio.push(item);
      totalStockValueTWD += marketValueTWD;
      totalStockCostTWD += costValueTWD;
     
       // 產業分佈統計
      var secName = item.sector ||  "其他" ;
      if (!sectorMap[secName]) sectorMap[secName] = 0;
      sectorMap[secName] += marketValueTWD;
    }
  }
 
   // 3. 計算總資產與指標
  var grandTotalAsset = totalStockValueTWD + totalCashTWD;
  var dailyProfit = totalStockValueTWD - totalStockCostTWD;  // 此處簡化為總損益
  var profitPct = (totalStockCostTWD > 0) ? ((dailyProfit / totalStockCostTWD) * 100).toFixed(2) : 0;
  var cashLevel = (grandTotalAsset > 0) ? Math.round((totalCashTWD / grandTotalAsset) * 100) : 0;
 
   // 4. 整理產業圓餅圖資料
  var sectors = [];
  for (var key in sectorMap) {
    sectors.push({ label: key, value: Math.round((sectorMap[key] / totalStockValueTWD) * 100) });
  }
   // 排序並只取前 5 大
  sectors.sort(function(a, b) { return b.value - a.value; });
 
  var topSectors = [];
  for(var k=0; k<sectors.length; k++) {
     if (k < 5) topSectors.push(sectors[k]);
  }

  var result = {
    totalAsset: Math.round(grandTotalAsset),
    dailyProfit: Math.round(dailyProfit),
    dailyProfitPct: profitPct,
    cashLevel: cashLevel,
    sectors: topSectors.map(s => s.value),
    sectorNames: topSectors.map(s => s.label),
    portfolio: portfolio
  };

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 處理 App 前端 "寫入" 請求 (交易/搜尋報告)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
   // 防止並發寫入衝突 (鎖定 10 秒)
  if (lock.tryLock(10000)) {
    try {
      var params = JSON.parse(e.postData.contents);
      var action = params.action;
      var payload = params.data;

       // === 功能 A: 報告讀取 (Iterator 模式) ===
      if (action === 'getReport') {
        var symbol = String(payload.symbol).trim();
        var folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
        var files = folder.getFiles();  // 取得迭代器 (非搜尋索引)
       
        var reportContent = "";
        var reportDate = "";
        var found = false;
        var fileName = "";
       
         // Debug 資訊收集
        var debugFilesSeen = [];
        var scanCount = 0;

         // 遍歷檔案尋找 (上限掃描 200 個檔案以防超時)
        while (files.hasNext()) {
          var file = files.next();
          var fName = file.getName();
         
          if (scanCount < 5) debugFilesSeen.push(fName);  // 記錄前5個檔名供除錯
          scanCount++;
         
           // 核心比對：檔名包含股號 且 未被刪除
          if (fName.indexOf(symbol) > -1 && !file.isTrashed()) {
              // 找到檔案！
             reportContent = file.getBlob().getDataAsString();
             reportDate = Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone(), "yyyy-MM-dd");
             fileName = fName;
             found = true;
             break;
          }
          if (scanCount > 200) break;  // 安全煞車
        }

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          found: found,
          fileName: fileName,
          html: reportContent,
          date: reportDate,
          debug: {
            version: "v21",  // 版本標記，確認前端連到最新版
            targetSymbol: symbol,
            folderId: REPORT_FOLDER_ID,
            filesScanned: scanCount,
            sampleFiles: debugFilesSeen
          }
        })).setMimeType(ContentService.MimeType.JSON);
      }

       // === 功能 B: 交易邏輯 ===
      var market = payload.market;
      var symbol = String(payload.symbol).toUpperCase();
      var txPrice = Number(payload.price) || 0;
      var txQty = Number(payload.qty) || 0;

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(market);
      var historySheet = ss.getSheetByName('History');
     
       // 重新取得該市場匯率
      var rate = 1;
      var fundsSheet = ss.getSheetByName('Funds');
      if (fundsSheet) {
        var fundsData = fundsSheet.getDataRange().getValues();
        var targetCurrency = {'TW': 'TWD', 'US': 'USD', 'JP': 'JPY'}[market] || market;
        for(var r = 1; r < fundsData.length; r++) {
          if(String(fundsData[r][1]).toUpperCase() === targetCurrency) {
            rate = Number(fundsData[r][2]) || 1;
            break;
          }
        }
      }

       // 檢查工作表是否存在
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({success: false, message: "Sheet not found: " + market})).setMimeType(ContentService.MimeType.JSON);

      var data = sheet.getDataRange().getValues();
      var rowIndex = -1;
      var oldQty = 0;
      var oldCost = 0;
      var stockName = "";

       // 尋找現有持股
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).toUpperCase() === symbol) {
          rowIndex = i + 1;
          stockName = data[i][1];
          oldCost = Number(data[i][7]) || 0;
          oldQty = Number(data[i][8]) || 0;  
          break;
        }
      }

      var newQty = oldQty + txQty;
      var newCost = oldCost;
      var actionStr = "";
      var realizedGainORG = "";
      var realizedGainTWD = "";

      if (rowIndex !== -1) {
         // --- 既有持股 ---
        if (txQty > 0) {
          actionStr =  "增持" ;
           // 平均成本法
          newCost = ((oldCost * oldQty) + (txPrice * txQty)) / newQty;
        } else {
           // 賣出 (計算已實現損益)
          realizedGainORG = (txPrice - oldCost) * Math.abs(txQty);
          realizedGainTWD = realizedGainORG * rate;

          if (newQty <= 0) {
            actionStr =  "出清" ;
            newQty = 0;
            newCost = 0;
          } else {
            actionStr =  "減持" ;
            newCost = oldCost;
          }
        }

        if (newQty > 0) {
          sheet.getRange(rowIndex, 8).setValue(newCost);
          sheet.getRange(rowIndex, 9).setValue(newQty);
        } else {
          sheet.deleteRow(rowIndex);
        }

      } else {
         // --- 新增持股 ---
        if (txQty < 0) throw new Error( "新增持股的數量不能為負數" );
        actionStr =  "新增" ;
        newCost = txPrice;
        newQty = txQty;

         // 插入新行
        var newRow = [symbol, "", "", "", "", "", "", newCost, newQty];
        sheet.appendRow(newRow);
       
         // 補上 GOOGLEFINANCE 公式
        var lastRow = sheet.getLastRow();
        if(market === 'TW') sheet.getRange(lastRow, 7).setFormula('=GOOGLEFINANCE("TPE:' + symbol + '", "price")');
        else if (market === 'US') sheet.getRange(lastRow, 7).setFormula('=GOOGLEFINANCE("' + symbol + '", "price")');
        else if (market === 'JP') sheet.getRange(lastRow, 7).setFormula('=GOOGLEFINANCE("TYO:' + symbol + '", "price")');
      }

       // 寫入歷史紀錄 (結構更新)
      if (historySheet) {
        var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
        var txAmount = txPrice * txQty;  // [New] 計算交易總金額 (Price * Qty)
       
        historySheet.appendRow([
          timestamp,
          actionStr,
          market,
          symbol,
          stockName,
          txPrice,
          txQty,
          txAmount,  // H欄: Amount (新增)
          newQty,    // I欄: Position
          realizedGainORG !== "" ? realizedGainORG : "",  // J欄
          realizedGainTWD !== "" ? realizedGainTWD : ""   // K欄
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({success: true, message: actionStr +  " 紀錄成功" })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({success: false, message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  } else {
    return ContentService.createTextOutput(JSON.stringify({success: false, message: "Server Busy"})).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ⚠️ 關鍵函式：請在編輯器手動執行此函式一次
 * 目的：強制觸發「DriveApp」的權限審查視窗
 */
function forceAuth() {
  var folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
  console.log( "授權成功！已成功連線至資料夾："  + folder.getName());
}`;
