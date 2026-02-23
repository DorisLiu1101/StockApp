/**
 * [VER] v3.22 [DATE] 2026-02-23
 * [DESC] 
 * 1. [Bug 修復] 修正「營運與動態」欄位讀取到 Object 導致顯示 [object Object] 的問題
 */

// ==========================================
// 1. 產生並儲存報告
// ==========================================
window.generateAndSaveReport = async function() {
    const currentDetailSymbol = window.appState.currentDetailSymbol;
    const currentDetailMarket = window.appState.currentDetailMarket;
    const userScriptUrl = window.appState.userScriptUrl;

    const symbol = currentDetailSymbol || document.getElementById('debug-symbol').innerText;
    if (!symbol || symbol === '--') return window.showAlert('請先選擇一檔股票！');
    if (!userScriptUrl) return window.showAlert('請先至設定頁面綁定 Google Apps Script 網址！');

    const loadingDiv = document.getElementById('report-loading');
    const loadingText = document.getElementById('report-loading-text');
    document.getElementById('report-content').classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    loadingDiv.style.display = 'flex';
    
    try {
        loadingText.innerText = '抓取絕對即時股價中 (自動偵測市場)...';
        
        async function getYahooPrice(s) {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${s}`)}`;
            const res = await fetch(proxyUrl);
            const data = await res.json();
            if (data.chart && data.chart.result && data.chart.result !== null) {
                return data.chart.result[0].meta.regularMarketPrice;
            }
            return null;
        }

        let realPrice = null;
        let yfSymbol = symbol;

        if (currentDetailMarket === 'TW') {
            realPrice = await getYahooPrice(`${symbol}.TW`); 
            if (realPrice !== null) {
                yfSymbol = `${symbol}.TW`;
            } else {
                realPrice = await getYahooPrice(`${symbol}.TWO`); 
                if (realPrice !== null) {
                    yfSymbol = `${symbol}.TWO`;
                } else {
                    throw new Error(`無法從 Yahoo 取得台股 ${symbol} (上市或上櫃) 的股價，請確認代號是否正確。`);
                }
            }
        } else {
            if (currentDetailMarket === 'JP') yfSymbol += '.T';
            realPrice = await getYahooPrice(yfSymbol);
            if (realPrice === null) throw new Error(`無法從 Yahoo 取得 ${yfSymbol} 的股價，請確認代號。`);
        }

        let marketName = "台股";
        if (currentDetailMarket === 'US') marketName = "美股";
        else if (currentDetailMarket === 'JP') marketName = "日股";

        loadingText.innerText = '呼叫後端 AI 進行聯網分析中... (約需 10 秒)';
        
        const prompt = `
            角色：巴菲特價值投資分析師。
            任務：分析${marketName} ${symbol}。目前真實股價為 ${realPrice} 元。
            請聯網搜尋最新財報、近5年股利與EPS、新聞、與最新 GDP 成長率。
            必須嚴格只輸出純 JSON 格式！絕對禁止任何開場白（例如"我將以..."）、結語或 Markdown 標記，請直接以大括號 { 開頭：
            {
                "company_name": "公司名稱", "biz_intro": "核心業務簡介(15字內)", "nav": 最新一季每股淨值(數字),
                "reinvestment_rate": 盈再率(數字,如 85 代表 85%), "gdp_yoy": 最新實質GDP年增率(數字,如 1.5),
                "eps_ttm": 近四季總EPS(數字,如 15.5), "pe_hist_low": 近三年歷史最低本益比(數字,如 10.5), "pe_hist_high": 近三年歷史最高本益比(數字,如 25.0),
                "avg_yield_3y": 近三年平均現金殖利率(數字,如 5.5), "avg_yield_5y": 近五年平均現金殖利率(數字,如 5.2),
                "div_frequency": "配息頻率(填入: 年配 或 半年配 或 季配 或 月配 或 不固定)",
                "buffett_summary": "綜合五維測試的摘要說明(30字內，包含亮點與隱憂，如:⚠️ 警示...或✅ 優秀...)",
                "fin_annotation": "根據近五年財務數據的簡要特徵標註(20字內，如:連續9年配息超過10元...)",
                "health": { "tag": "強健 或 普通 或 警示", "desc": "體質詳細說明(50字內)", "table": [ {"item": "盈再率", "data": "數字與百分比", "eval": "評價(如:普通 40-80%)"}, {"item": "ROE趨勢", "data": "近5年狀況", "eval": "評價(如:趨勢向上)"}, {"item": "本益比位階", "data": "數字", "eval": "評價(如:歷史高位)"} ] },
                "history_5y": [{"year": "2023", "eps": 30.0, "div": 15.0, "roe": 25.0, "yield": 5.2, "payout": 50.0}],
                "buffett_tests": { "profit": {"value": "28.5%", "status": "通過 或 失敗"}, "cashflow": {"value": "85%", "status": "通過 或 失敗"}, "dividend": {"value": "42%", "status": "通過 或 失敗"}, "scale": {"value": "符合標準", "status": "通過 或 失敗"}, "chips": {"value": "穩定", "status": "通過 或 失敗"} },
                "market": { "policy": "政策風險說明...", "fx": "匯率影響說明...", "sentiment": { "tag": "情緒標籤(如:極度貪婪(Bullish) 或 恐慌(Bearish))", "desc": "市場情緒說明..." }, "news": ["新聞1", "新聞2"], "analysts": "分析師觀點..." },
                "risk": { "confidence_score": 75, "flags": ["警示..."], "scenarios": [ {"type": "牛市 (Bull)", "prob": 20, "desc": "說明..."}, {"type": "標準 (Base)", "prob": 50, "desc": "說明..."}, {"type": "熊市 (Bear)", "prob": 30, "desc": "說明..."} ] }
            }
        `;
        
        const aiRes = await fetch(userScriptUrl, {
            method: 'POST', body: JSON.stringify({ action: 'askGemini', data: { prompt: prompt } })
        });
        
        const aiResJson = await aiRes.json();
        if (!aiResJson.success) throw new Error(aiResJson.message || "伺服器發生未知錯誤，請稍後再試。");
        
        const candidate = aiResJson.data?.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
            console.error("AI 異常回傳或遭安全機制攔截:", aiResJson.data);
            throw new Error("AI 未能產出有效報告 (可能遇到系統超載或觸發安全審查)，請稍後再試一次。");
        }
        
        let rawText = candidate.content.parts[0].text;
        let jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("AI 未回傳有效格式，請再點擊一次。");
        
        let jsonStr = jsonMatch[0].replace(/```json/gi, '').replace(/```/g, '').trim();
        const reportRaw = JSON.parse(jsonStr);

        let hasValidMathData = true;
        
        reportRaw.buffett_tests = reportRaw.buffett_tests || {};
        const safeTest = { value: "--", status: "資料不足" };
        reportRaw.buffett_tests.profit = reportRaw.buffett_tests.profit || safeTest;
        reportRaw.buffett_tests.cashflow = reportRaw.buffett_tests.cashflow || safeTest;
        reportRaw.buffett_tests.dividend = reportRaw.buffett_tests.dividend || safeTest;
        reportRaw.buffett_tests.scale = reportRaw.buffett_tests.scale || safeTest;
        reportRaw.buffett_tests.chips = reportRaw.buffett_tests.chips || safeTest;

        reportRaw.market = reportRaw.market || {};
        reportRaw.market.policy = reportRaw.market.policy || "--";
        reportRaw.market.fx = reportRaw.market.fx || "--";
        reportRaw.market.sentiment = reportRaw.market.sentiment || "--";
        reportRaw.market.analysts = reportRaw.market.analysts || "--";
        reportRaw.market.news = Array.isArray(reportRaw.market.news) && reportRaw.market.news.length > 0 ? reportRaw.market.news : ["尚無重大新聞"];

        reportRaw.risk = reportRaw.risk || {};
        reportRaw.risk.flags = Array.isArray(reportRaw.risk.flags) ? reportRaw.risk.flags : ["AI 未能取得特定風險數據"];
        reportRaw.risk.scenarios = Array.isArray(reportRaw.risk.scenarios) ? reportRaw.risk.scenarios : [];

        if (isNaN(Number(reportRaw.eps_ttm)) || isNaN(Number(reportRaw.pe_hist_low)) || isNaN(Number(reportRaw.pe_hist_high))) {
            hasValidMathData = false;
        }
        
        if (!reportRaw.history_5y || !Array.isArray(reportRaw.history_5y) || reportRaw.history_5y.length === 0) {
            reportRaw.history_5y = [{ "year": "--", "eps": "--", "div": "--", "roe": "--" }];
        }

        loadingText.innerText = '本機執行 PER 雙軌本益比運算中...';
        
        let valA = { cheap: 0, exp: 0, pe_cheap: 12, pe_exp: 20, fail: true };
        let valB = { cheap: 0, exp: 0, pe_cheap: 0, pe_exp: 0, fail: true };
        let avgCheap = 0, avgExp = 0, currentPE = "N/A";
        let rating = "N/A", signal = "資料不足", strategy = "因 AI 無法取得足夠且有效的財務數據，估值運算已暫停。";

        if (hasValidMathData) {
            const eps = Number(reportRaw.eps_ttm);
            const peLow = Number(reportRaw.pe_hist_low);
            const peHigh = Number(reportRaw.pe_hist_high);

            if (eps > 0) {
                currentPE = (realPrice / eps).toFixed(1);
                
                valA = { cheap: Math.round(eps * 12), exp: Math.round(eps * 30), pe_cheap: 12, pe_exp: 30, fail: false };
                valB = { cheap: Math.round(eps * peLow), exp: Math.round(eps * peHigh), pe_cheap: peLow, pe_exp: peHigh, fail: false };

                avgCheap = Math.round((valA.cheap + valB.cheap) / 2);
                avgExp = Math.round((valA.exp + valB.exp) / 2);
                
                let isGdpLow = Number(reportRaw.gdp_yoy) < 2.0;

                if (realPrice < avgCheap && avgCheap > 0) {
                    rating = "BUY"; signal = "價值浮現"; 
                    strategy = isGdpLow ? "目前股價低於平均淑價，且總經GDP處於低檔，為絕佳長線買點，建議積極佈局。" : "股價低於平均淑價，具備安全邊際，建議分批買進建立部位。";
                } else if (realPrice > avgExp && avgExp > 0) {
                    rating = "SELL"; signal = "估值偏高";
                    strategy = "目前股價已超越平均昂貴價，本益比處於相對高檔，建議適度獲利了結或降低持股比重。";
                } else {
                    rating = "HOLD"; signal = "觀望";
                    strategy = "股價處於合理區間，建議持有觀望，等待更好的安全邊際。";
                }
            } else {
                rating = "N/A"; signal = "虧損中";
                strategy = "公司近四季 EPS 為負值或無獲利，無法使用本益比模型進行有效估價，建議謹慎評估。";
            }
        }

        let cheapLow = Math.min(valA.cheap, valB.cheap);
        let cheapHigh = Math.max(valA.cheap, valB.cheap);
        let expLow = Math.min(valA.exp, valB.exp);
        let expHigh = Math.max(valA.exp, valB.exp);
        let peLowStr = valB.fail ? "--" : Math.min(valB.pe_cheap, valB.pe_exp);
        let peHighStr = valB.fail ? "--" : Math.max(valB.pe_cheap, valB.pe_exp);

        const finalReport = {
            symbol: symbol, realPrice: realPrice, date: new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
            ai: reportRaw, 
            math: { 
                valA, valB, avgCheap, avgExp, currentPE,
                range: {
                    cheap: `($${cheapLow} ~ $${cheapHigh})`,
                    exp: `($${expLow} ~ $${expHigh})`,
                    pe: `(歷史：${peLowStr}x ~ ${peHighStr}x)`
                }
            }, 
            decision: { rating, signal, strategy }
        };

        loadingText.innerText = '寫入日期與儲存報告...';
        const saveRes = await fetch(userScriptUrl, {
            method: 'POST', body: JSON.stringify({ action: 'saveReport', data: { symbol: symbol, market: currentDetailMarket, content: JSON.stringify(finalReport) } })
        });

        const saveResult = await saveRes.json();
        if(saveResult.success) {
            window.loadReport(); 
            if(window.syncSheetData) window.syncSheetData();
        } else {
            throw new Error(saveResult.message);
        }

    } catch (error) {
        console.error(error);
        window.showAlert('產生報告時發生錯誤：\n' + error.message);
        loadingDiv.style.display = 'none';
    }
};

// ==========================================
// 2. 讀取並渲染報告
// ==========================================
window.loadReport = async function() {
    const currentDetailSymbol = window.appState.currentDetailSymbol;
    const userScriptUrl = window.appState.userScriptUrl;

    const symbol = currentDetailSymbol || document.getElementById('debug-symbol').innerText;
    if (!symbol || symbol === '--') return;
    if (!userScriptUrl) return window.showAlert("請先於設定中貼上 Script URL", "系統提示");
    
    const loadingDiv = document.getElementById('report-loading');
    const contentDiv = document.getElementById('report-content');
    const frame = document.getElementById('report-frame');

    loadingDiv.classList.remove('hidden');
    loadingDiv.style.display = 'flex';
    contentDiv.classList.add('hidden');
    document.getElementById('report-loading-text').innerText = '從雲端讀取報告中...';

    try {
        const res = await fetch(userScriptUrl, { method: 'POST', body: JSON.stringify({ action: 'getReport', data: { symbol: symbol } }) });
        const result = await res.json();

        if (result.success && result.found) {
            let data;
            try {
                data = JSON.parse(result.html);
            } catch (parseError) {
                window.showAlert(`雲端存有舊版的 HTML 報告，請直接點擊旁邊的「更新報告」來覆蓋它！`, "系統提示");
                loadingDiv.style.display = 'none';
                return;
            }

            const tplRes = await fetch('StockApp_Report_Form.html?t=' + new Date().getTime());
            const tplHtml = await tplRes.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(tplHtml, 'text/html');

            const setTxt = (id, txt) => { if(doc.getElementById(id)) doc.getElementById(id).innerHTML = txt; };     
            
            setTxt('var-report-date', data.date);
            if(document.getElementById('detail-report-date')) document.getElementById('detail-report-date').innerText = data.date;
                    
            setTxt('var-stock-title', `${data.symbol} ${data.ai.company_name}`);
            setTxt('var-biz-intro', data.ai.biz_intro);
            setTxt('var-current-price', "$" + data.realPrice);
            setTxt('var-price-date', "Date: " + data.date);
            
            setTxt('var-rating-text', data.decision.rating);
            if(data.decision.rating === "BUY") doc.getElementById('var-rating-text').style.color = "#4ADE80";
            if(data.decision.rating === "SELL") doc.getElementById('var-rating-text').style.color = "#F87171";
            setTxt('var-rating-signal', "訊號：" + data.decision.signal);
            
            setTxt('var-confidence-score', data.ai.risk.confidence_score);
            if(doc.getElementById('var-gauge-fill')) doc.getElementById('var-gauge-fill').style.transform = `rotate(${(data.ai.risk.confidence_score/100)*180}deg)`;
            
            setTxt('var-current-pe', data.math.currentPE + "倍");
            setTxt('var-pe-range', data.math.range ? data.math.range.pe : `(歷史：${data.math.valB.pe_cheap}x ~ ${data.math.valB.pe_exp}x)`);
            setTxt('var-cheap-avg', "$" + data.math.avgCheap);
            setTxt('var-cheap-range', data.math.range ? data.math.range.cheap : `($${Math.min(data.math.valA.cheap, data.math.valB.cheap)} ~ $${Math.max(data.math.valA.cheap, data.math.valB.cheap)})`);
            setTxt('var-exp-avg', "$" + data.math.avgExp);
            setTxt('var-exp-range', data.math.range ? data.math.range.exp : `($${Math.min(data.math.valA.exp, data.math.valB.exp)} ~ $${Math.max(data.math.valA.exp, data.math.valB.exp)})`);
            
            let pct = 0; let badgeText = "合理"; let badgeBg = "#FACC15"; let badgeColor = "#000";
            if (data.realPrice <= data.math.avgCheap) {
                pct = 0; badgeText = "淑"; badgeBg = "#166534"; badgeColor = "#FFF";
            } else if (data.realPrice >= data.math.avgExp) {
                pct = 100; badgeText = "貴"; badgeBg = "#991B1B"; badgeColor = "#FFF";
            } else {
                pct = ((data.realPrice - data.math.avgCheap) / (data.math.avgExp - data.math.avgCheap)) * 100;
                pct = Math.max(0, Math.min(100, pct));
            }
            if(doc.getElementById('var-therm-marker')) doc.getElementById('var-therm-marker').style.left = pct + "%";
            let badge = doc.getElementById('var-therm-badge');
            if(badge) {
                badge.innerText = badgeText;
                badge.style.backgroundColor = badgeBg;
                badge.style.color = badgeColor;
            }

            setTxt('var-op-advice', `操作建議：${data.decision.strategy.includes('買')?'分批佈局':(data.decision.strategy.includes('賣')?'減碼賣出':'觀望持有')}`);
            setTxt('var-op-desc', data.decision.strategy);
            
            // [Bug 修復] 正確提取 sentiment 的 desc 字串
            let dynamicText = "";
            if (typeof data.ai.market.sentiment === 'object' && data.ai.market.sentiment !== null) {
                dynamicText = data.ai.market.sentiment.desc;
            } else {
                dynamicText = data.ai.market.sentiment || "--";
            }
            setTxt('var-co-dynamic', `<strong>營運與動態：</strong> ${dynamicText}`);
            
            setTxt('var-co-metrics', `<strong>基本指標：</strong> 最新 NAV $${data.ai.nav}, 近四季EPS $${data.ai.eps_ttm}`);
            
            const bt = data.ai.buffett_tests;
            let buffettSum = data.ai.buffett_summary || '系統完成5項壓力測試，詳見下方清單。';
            setTxt('var-test-summary', `<strong>測試結果總結：</strong> ${buffettSum}`);
            
            let testsHtml = `
                <tr><td>獲利能力 (ROE>15%)</td><td>${bt.profit.value}</td><td><span class="tag ${bt.profit.status.includes('通')?'tag-buy':'tag-sell'}">${bt.status||bt.profit.status}</span></td></tr>
                <tr><td>現金流 (盈再率<80%)</td><td>${bt.cashflow.value}</td><td><span class="tag ${bt.cashflow.status.includes('通')?'tag-buy':'tag-sell'}">${bt.cashflow.status}</span></td></tr>
                <tr><td>配息能力 (Payout>40%)</td><td>${bt.dividend.value}</td><td><span class="tag ${bt.dividend.status.includes('通')?'tag-buy':'tag-sell'}">${bt.dividend.status}</span></td></tr>
                <tr><td>經營規模</td><td>${bt.scale.value}</td><td><span class="tag ${bt.scale.status.includes('通')?'tag-buy':'tag-sell'}">${bt.scale.status}</span></td></tr>
                <tr><td>籌碼安定</td><td>${bt.chips.value}</td><td><span class="tag ${bt.chips.status.includes('通')?'tag-buy':'tag-sell'}">${bt.chips.status}</span></td></tr>
            `;
            setTxt('var-test-table-body', testsHtml);

            let finHtml = "";
            data.ai.history_5y.forEach(y => {
                let yld = y.yield ? y.yield + "%" : "--";
                let payout = y.payout ? y.payout + "%" : "--";
                finHtml += `<tr><td>${y.year}</td><td>$${y.div}</td><td style="color:#D4AF37;">${yld}</td><td>$${y.eps}</td><td style="color:#4ADE80;">${payout}</td><td>${y.roe}%</td></tr>`;
            });
            setTxt('var-fin-table-body', finHtml);
            
            let yield3y = data.ai.avg_yield_3y ? data.ai.avg_yield_3y + "%" : "--";
            let yield5y = data.ai.avg_yield_5y ? data.ai.avg_yield_5y + "%" : "--";
            let divFreq = data.ai.div_frequency || "未明";
            let finAnn = data.ai.fin_annotation || "長期配息紀錄已帶入。";
            
            setTxt('var-fin-summary', `<strong>數據摘要：</strong><br>1. 估價基準：採用近四季 EPS ($${data.ai.eps_ttm}) 計算。<br>2. 配息政策：該股近期主要為「${divFreq}」。<br><span style="color:#E5E7EB; font-size: 13px; display:inline-block; margin-top:4px;"><strong>標註說明：</strong>${finAnn}</span><br><span style="color:#D4AF37; font-size: 13px; display:inline-block; margin-top:6px;">💡 AI 聯網查證之平均殖利率：近三年 ${yield3y} / 近五年 ${yield5y}</span>`);

            let h = data.ai.health || {};
            let tagColor = h.tag === '強健' ? 'tag-buy' : (h.tag === '警示' ? 'tag-sell' : 'tag-hold');
            setTxt('var-health-tag', `<span class="tag ${tagColor}">${h.tag || '未評估'}</span>`);
            setTxt('var-health-desc', `<strong>體質說明：</strong> ${h.desc || '暫無詳細體質說明。'}`);

            let hTable = "";
            if (Array.isArray(h.table)) {
                h.table.forEach(r => {
                    let evalColor = "";
                    if (r.eval.includes('向上') || r.eval.includes('強') || r.eval.includes('低位') || r.eval.includes('良好')) evalColor = 'color:#4ADE80; background:rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3);';
                    else if (r.eval.includes('高位') || r.eval.includes('弱') || r.eval.includes('警示') || r.eval.includes('下滑')) evalColor = 'color:#F87171; background:rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);';
                    else evalColor = 'color:#FACC15; background:rgba(234,179,8,0.15); border: 1px solid rgba(234,179,8,0.3);';
                    
                    hTable += `<tr><td><strong>${r.item}</strong></td><td>${r.data}</td><td><span style="padding:3px 8px; border-radius:4px; font-size:10pt; font-weight:600; display:inline-block; ${evalColor}">${r.eval}</span></td></tr>`;
                });
            } else { hTable = `<tr><td colspan="3">無詳細檢核數據</td></tr>`; }
            setTxt('var-health-table-body', hTable);
            
            setTxt('var-val-pe-a', `12x ~ 30x`);
            setTxt('var-val-pe-b', (data.math.valB.fail ? 'N/A' : `${data.math.valB.pe_cheap}x ~ ${data.math.valB.pe_exp}x`));
            setTxt('var-val-cheap-a', `$${data.math.valA.cheap}`);
            setTxt('var-val-cheap-b', `$${data.math.valB.cheap}`);
            setTxt('var-val-exp-a', `$${data.math.valA.exp}`);
            setTxt('var-val-exp-b', `$${data.math.valB.exp}`);

            setTxt('var-mkt-policy', `<strong>政策風險：</strong> ${data.ai.market.policy}`);
            setTxt('var-mkt-fx', `<strong>匯率敏感度：</strong> ${data.ai.market.fx}`);
            
            let sentData = data.ai.market.sentiment;
            let sentHtml = "";
            if (typeof sentData === 'object' && sentData !== null) {
                let tagColor = (sentData.tag.includes('貪') || sentData.tag.includes('牛') || sentData.tag.includes('樂')) ? 'background:#FEE2E2; color:#991B1B; border: 1px solid #FCA5A5;' : ((sentData.tag.includes('恐') || sentData.tag.includes('熊') || sentData.tag.includes('悲')) ? 'background:#DCFCE7; color:#166534; border: 1px solid #86EFAC;' : 'background:#F3F4F6; color:#374151; border: 1px solid #D1D5DB;');
                sentHtml = `<div style="margin-bottom: 8px;"><strong style="font-size: 1.05rem; color:#fff;">市場情緒：</strong> <span style="padding: 2px 10px; border-radius: 6px; font-weight: bold; font-size:12px; margin-left:5px; letter-spacing:0.5px; ${tagColor}">${sentData.tag}</span></div><div style="color:var(--color-muted); line-height: 1.6;">${sentData.desc}</div>`;
            } else {
                sentHtml = `<strong>市場情緒：</strong> ${sentData || "--"}`;
            }
            setTxt('var-mkt-sentiment', sentHtml);
            setTxt('var-mkt-analyst', `<strong>分析師觀點：</strong> ${data.ai.market.analysts}`);
            
            let newsHtml = data.ai.market.news.map(n => `<li>${n}</li>`).join("");
            setTxt('var-mkt-news', `<strong>關鍵新聞：</strong><ul style="padding-left: 20px; margin: 5px 0;">${newsHtml}</ul>`);

            setTxt('var-risk-confidence-list', `<li>AI 信心指數：${data.ai.risk.confidence_score}/100</li>`);
            let flagsHtml = data.ai.risk.flags.map(f => `<li>⚠️ ${f}</li>`).join("");
            setTxt('var-risk-flags-list', flagsHtml || "<li>無明顯高危險標誌</li>");

            let sc = data.ai.risk.scenarios;
            setTxt('var-matrix-prob-bull', sc[0].prob + "%"); setTxt('var-matrix-desc-bull', sc[0].desc);
            setTxt('var-matrix-prob-base', sc[1].prob + "%"); setTxt('var-matrix-desc-base', sc[1].desc);
            setTxt('var-matrix-prob-bear', sc[2].prob + "%"); setTxt('var-matrix-desc-bear', sc[2].desc);

            setTxt('var-conc-price-level', `<strong>價格位階：</strong> 股價 $${data.realPrice} 位於 ${data.realPrice < data.math.avgCheap ? '淑價區間以下' : (data.realPrice > data.math.avgExp ? '貴價區間以上' : '合理區間')}。`);
            
            let gdpVal = Number(data.ai.gdp_yoy);
            let gdpText = `最新公佈為 ${data.ai.gdp_yoy}%。`;
            if (!isNaN(gdpVal)) {
                if (gdpVal <= 2.0) {
                    gdpText += ` 目前處於相對低檔。依據巴菲特操作邏輯，大盤低點常與 GDP 落底同步（買在「不再更壞」時）。若去年基期偏高，此時極可能為絕佳波段買點。`;
                } else if (gdpVal >= 4.0) {
                    gdpText += ` 目前處於相對高檔。若去年基期偏低，易形成高點轉折，建議留意減碼時機（如獲利了結保留 1/3 現金以備未來低檔回補）。`;
                } else {
                    gdpText += ` 建議利用「基期比較」預判轉折。觀察去年同期，若基期高則今年易見低點（進場訊號）；若基期低則需留意高點減碼風險。`;
                }
            }
            setTxt('var-conc-gdp-signal', `<strong>GDP 訊號：</strong> ${gdpText}`);
            setTxt('var-conc-strategy', data.decision.strategy);

            frame.srcdoc = doc.documentElement.outerHTML;

            loadingDiv.style.display = 'none';
            contentDiv.classList.remove('hidden');
            
            setTimeout(() => { 
                try { frame.style.height = (frame.contentWindow.document.body.scrollHeight + 50) + 'px'; } catch(e) { frame.style.height = '800px'; }
            }, 500);

        } else {
            window.showAlert(`找不到雲端報告，請點擊「更新報告」。`, "系統提示");
            loadingDiv.style.display = 'none';
        }
    } catch (error) {
        console.error(error);
        window.showAlert('讀取失敗：' + error.message);
        loadingDiv.style.display = 'none';
    }
};