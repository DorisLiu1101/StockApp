export const GAS_SCRIPT_DATA = `
/**
 * ==========================================
 * 維股利 後端 API (v24_交易同步更新名稱)
 * 更新日期: 2026-02-16
 * 版本說明:
 * 1. 交易(add)邏輯增強: 針對「既有持股」，若前端有傳入名稱，一併更新 B 欄
 * ==========================================
 */
var REPORT_FOLDER_ID = "1GdtSyWHYhwZ8JnugPGzgBhIRwXKScIZR";
var FX_RATES = { 'TW': 1, 'US': 31.5, 'JP': 0.215 };

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fundsSheet = ss.getSheetByName('Funds');
  var totalCashTWD = 0;

  if (fundsSheet) {
    var fundsData = fundsSheet.getDataRange().getValues();
    for (var j = 1; j < fundsData.length; j++) {
      var fRow = fundsData[j];
      var account = String(fRow[0]).toUpperCase();
      var currency = String(fRow[1]).toUpperCase();
      var rate = Number(fRow[2]) || 1;
      var position = Number(fRow[3]) || 0;
      if (currency === 'TWD') FX_RATES['TW'] = rate;
      if (currency === 'USD') FX_RATES['US'] = rate;
      if (currency === 'JPY') FX_RATES['JP'] = rate;
      if (account === 'CASH') totalCashTWD += (position * rate);
    }
  }
 
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

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
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

      var marketValueTWD = item.qty * item.price * rate;
      var costValueTWD = item.qty * item.cost * rate;
     
      item.marketValue = Math.round(marketValueTWD);
      item.gain = Math.round(marketValueTWD - costValueTWD);
      item.gainPct = (costValueTWD > 0) ? ((item.gain / costValueTWD) * 100).toFixed(2) : 0;
      item.gainOrg = (item.price - item.cost) * item.qty;

      portfolio.push(item);
      totalStockValueTWD += marketValueTWD;
      totalStockCostTWD += costValueTWD;
     
      var secName = item.sector || "其他";
      if (!sectorMap[secName]) sectorMap[secName] = 0;
      sectorMap[secName] += marketValueTWD;
    }
  }
 
  var grandTotalAsset = totalStockValueTWD + totalCashTWD;
  var dailyProfit = totalStockValueTWD - totalStockCostTWD;
  var profitPct = (totalStockCostTWD > 0) ? ((dailyProfit / totalStockCostTWD) * 100).toFixed(2) : 0;
  var cashLevel = (grandTotalAsset > 0) ? Math.round((totalCashTWD / grandTotalAsset) * 100) : 0;
 
  var sectors = [];
  for (var key in sectorMap) {
    sectors.push({ label: key, value: Math.round((sectorMap[key] / totalStockValueTWD) * 100) });
  }
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

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (lock.tryLock(10000)) {
    try {
      var params = JSON.parse(e.postData.contents);
      var action = params.action;
      var payload = params.data;

      if (action === 'getReport') {
        var symbol = String(payload.symbol).trim();
        var folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
        var files = folder.getFiles();
        var reportContent = ""; var reportDate = ""; var found = false; var fileName = "";
        var debugFilesSeen = []; var scanCount = 0;

        while (files.hasNext()) {
          var file = files.next();
          var fName = file.getName();
          if (scanCount < 5) debugFilesSeen.push(fName);
          scanCount++;
          if (fName.indexOf(symbol) > -1 && !file.isTrashed()) {
             reportContent = file.getBlob().getDataAsString();
             reportDate = Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone(), "yyyy-MM-dd");
             fileName = fName;
             found = true;
             break;
          }
          if (scanCount > 200) break;
        }

        return ContentService.createTextOutput(JSON.stringify({
          success: true, found: found, fileName: fileName, html: reportContent, date: reportDate,
          debug: { version: "v24", targetSymbol: symbol, filesScanned: scanCount }
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (action === 'edit_name') {
          var market = payload.market;
          var symbol = String(payload.symbol).toUpperCase();
          var newName = payload.newName;
          var ss = SpreadsheetApp.getActiveSpreadsheet();
          var sheet = ss.getSheetByName(market);
          if (!sheet) throw new Error("Sheet not found: " + market);
          var data = sheet.getDataRange().getValues();
          var updated = false;
          for (var i = 1; i < data.length; i++) {
            if (String(data[i][0]).toUpperCase() === symbol) {
              sheet.getRange(i + 1, 2).setValue(newName);
              updated = true;
              break;
            }
          }
          if (updated) return ContentService.createTextOutput(JSON.stringify({success: true, message: "名稱更新成功"})).setMimeType(ContentService.MimeType.JSON);
          else throw new Error("找不到股號: " + symbol);
      }

      // === 功能 B: 交易邏輯 (增強版: 同步更新名稱) ===
      var market = payload.market;
      var symbol = String(payload.symbol).toUpperCase();
      var txPrice = Number(payload.price) || 0;
      var txQty = Number(payload.qty) || 0;
      var txName = payload.name ? String(payload.name) : ""; 

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(market);
      var historySheet = ss.getSheetByName('History');
     
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

      if (!sheet) return ContentService.createTextOutput(JSON.stringify({success: false, message: "Sheet not found: " + market})).setMimeType(ContentService.MimeType.JSON);

      var data = sheet.getDataRange().getValues();
      var rowIndex = -1; var oldQty = 0; var oldCost = 0; var stockName = "";

      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).toUpperCase() === symbol) {
          rowIndex = i + 1; stockName = data[i][1]; oldCost = Number(data[i][7]) || 0; oldQty = Number(data[i][8]) || 0;
          break;
        }
      }

      var newQty = oldQty + txQty; var newCost = oldCost; var actionStr = "";
      var realizedGainORG = ""; var realizedGainTWD = "";

      if (rowIndex !== -1) {
        // --- 既有持股 ---
        // [New] 若使用者有填寫名稱，則更新名稱 (即使是舊股)
        if (txName && txName.trim() !== "") {
            sheet.getRange(rowIndex, 2).setValue(txName);
            stockName = txName; // 更新紀錄用的名稱變數
        }

        if (txQty > 0) {
          actionStr = "增持";
          newCost = ((oldCost * oldQty) + (txPrice * txQty)) / newQty;
        } else {
          realizedGainORG = (txPrice - oldCost) * Math.abs(txQty); realizedGainTWD = realizedGainORG * rate;
          if (newQty <= 0) { actionStr = "出清"; newQty = 0; newCost = 0; } else { actionStr = "減持"; newCost = oldCost; }
        }
        if (newQty > 0) { sheet.getRange(rowIndex, 8).setValue(newCost); sheet.getRange(rowIndex, 9).setValue(newQty); } else { sheet.deleteRow(rowIndex); }
      } else {
        // --- 新增持股 ---
        if (txQty < 0) throw new Error("新增持股的數量不能為負數");
        actionStr = "新增";
        newCost = txPrice;
        newQty = txQty;
        
        var nameToUse = txName || ""; 
        var newRow = [symbol, nameToUse, "", "", "", "", "", newCost, newQty];
        sheet.appendRow(newRow);
       
        var lastRow = sheet.getLastRow();
        if(market === 'TW') sheet.getRange(lastRow, 7).setFormula('=GOOGLEFINANCE("TPE:' + symbol + '", "price")');
        else if (market === 'US') sheet.getRange(lastRow, 7).setFormula('=GOOGLEFINANCE("' + symbol + '", "price")');
        else if (market === 'JP') sheet.getRange(lastRow, 7).setFormula('=GOOGLEFINANCE("TYO:' + symbol + '", "price")');
      }

      if (historySheet) {
        var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
        var txAmount = txPrice * txQty;
        historySheet.appendRow([timestamp, actionStr, market, symbol, stockName || txName, txPrice, txQty, txAmount, newQty, realizedGainORG !== "" ? realizedGainORG : "", realizedGainTWD !== "" ? realizedGainTWD : ""]);
      }

      return ContentService.createTextOutput(JSON.stringify({success: true, message: actionStr + " 紀錄成功"})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({success: false, message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  } else {
    return ContentService.createTextOutput(JSON.stringify({success: false, message: "Server Busy"})).setMimeType(ContentService.MimeType.JSON);
  }
}

function forceAuth() {
  var folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
  console.log("授權成功！");
}
`;
