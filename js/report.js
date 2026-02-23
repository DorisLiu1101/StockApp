/**
 * [VER] v5.3 [2026-02-23]
 * [DESC] 移除前端 corsproxy 抓價依賴，轉由 GAS 後端執行 On-Demand 即時抓價與自動建檔。
 */
window.reportService = (function() {
    async function generateAndSaveReport(prefix = '') {
        const symbol = window.appState.currentDetailSymbol;
        const market = window.appState.currentDetailMarket;
        const scriptUrl = window.appState.userScriptUrl;

        if (!symbol || symbol === '--') return window.showAlert('請先選擇一檔股票！');
        if (!scriptUrl) return window.showAlert('請先至設定頁面綁定 API 網址！');

        const loadingDiv = document.getElementById(prefix + 'report-loading');
        const loadingText = document.getElementById(prefix + 'report-loading-text');
        document.getElementById(prefix + 'report-content').classList.add('hidden');
        loadingDiv.classList.remove('hidden'); loadingDiv.style.display = 'flex';
        
        try {
            let marketName = market === 'US' ? "美股" : (market === 'JP' ? "日股" : "台股");
            loadingText.innerText = '呼叫後端進行即時抓價與 AI 聯網分析中...';
            
            // 注意：原本的 ${realPrice} 已經替換為 {{REAL_PRICE}} 佔位符，交給後端自動填入
            const prompt = `角色：巴菲特價值投資分析師。任務：分析${marketName} ${symbol}。目前真實股價為 {{REAL_PRICE}} 元。請聯網搜尋最新財報、近5年股利與EPS、新聞、與最新 GDP 成長率。必須嚴格只輸出純 JSON 格式！絕對禁止任何開場白（例如"我將以..."）、結語或 Markdown 標記，請直接以大括號 { 開頭：{"company_name": "公司名稱", "biz_intro": "核心業務簡介(15字內)", "nav": 最新一季每股淨值(數字), "reinvestment_rate": 盈再率(數字), "gdp_yoy": 最新實質GDP年增率(數字), "eps_ttm": 近四季總EPS(數字), "pe_hist_low": 近三年歷史最低本益比(數字), "pe_hist_high": 近三年歷史最高本益比(數字), "avg_yield_3y": 近三年平均現金殖利率(數字), "avg_yield_5y": 近五年平均現金殖利率(數字), "div_frequency": "配息頻率", "buffett_summary": "綜合摘要", "fin_annotation": "財務簡要標註", "health": { "tag": "強健", "desc": "體質詳細說明", "table": [ {"item": "盈再率", "data": "數字與百分比", "eval": "評價"} ] }, "history_5y": [{"year": "2023", "eps": 30.0, "div": 15.0, "roe": 25.0, "yield": 5.2, "payout": 50.0}], "buffett_tests": { "profit": {"value": "28.5%", "status": "通過"}, "cashflow": {"value": "85%", "status": "通過"}, "dividend": {"value": "42%", "status": "通過"}, "scale": {"value": "符合標準", "status": "通過"}, "chips": {"value": "穩定", "status": "通過"} }, "market": { "policy": "政策風險說明...", "fx": "匯率影響...", "sentiment": { "tag": "情緒標籤", "desc": "說明" }, "news": ["新聞1", "新聞2"], "analysts": "分析師觀點" }, "risk": { "confidence_score": 75, "flags": ["警示"], "scenarios": [ {"type": "牛市", "prob": 20, "desc": "說明"}, {"type": "標準", "prob": 50, "desc": "說明"}, {"type": "熊市", "prob": 30, "desc": "說明"} ] } }`;
            
            // 新增把 symbol 和 market 傳給後端，讓後端去抓價
            const aiRes = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify({ action: 'askGemini', data: { prompt: prompt, symbol: symbol, market: market } }) });
            const aiResJson = await aiRes.json();
            if (!aiResJson.success) throw new Error(aiResJson.message || "伺服器發生未知錯誤。");
            
            // [新增] 接收從 GAS 後端傳回來的即時價格
            let realPrice = aiResJson.realPrice || 0;
            
            const rawText = aiResJson.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if(!rawText) throw new Error("AI 未能產出有效報告");
            
            let jsonStr = rawText.match(/\{[\s\S]*\}/)[0].replace(/```json/gi, '').replace(/```/g, '').trim();
            const reportRaw = JSON.parse(jsonStr);

            let hasValidMathData = !(isNaN(Number(reportRaw.eps_ttm)) || isNaN(Number(reportRaw.pe_hist_low)) || isNaN(Number(reportRaw.pe_hist_high)));
            let valA = { cheap: 0, exp: 0, pe_cheap: 12, pe_exp: 20, fail: true }, valB = { cheap: 0, exp: 0, pe_cheap: 0, pe_exp: 0, fail: true };
            let avgCheap = 0, avgExp = 0, currentPE = "N/A", rating = "N/A", signal = "資料不足", strategy = "因 AI 無法取得有效數據，估值運算暫停。";

            // [修改] 只有當成功抓到價格 (realPrice > 0) 且數學資料有效時，才進行估值運算
            if (realPrice > 0 && hasValidMathData) {
                const eps = Number(reportRaw.eps_ttm), peLow = Number(reportRaw.pe_hist_low), peHigh = Number(reportRaw.pe_hist_high);
                if (eps > 0) {
                    currentPE = (realPrice / eps).toFixed(1);
                    valA = { cheap: Math.round(eps * 12), exp: Math.round(eps * 30), pe_cheap: 12, pe_exp: 30, fail: false };
                    valB = { cheap: Math.round(eps * peLow), exp: Math.round(eps * peHigh), pe_cheap: peLow, pe_exp: peHigh, fail: false };
                    avgCheap = Math.round((valA.cheap + valB.cheap) / 2); avgExp = Math.round((valA.exp + valB.exp) / 2);
                    if (realPrice < avgCheap) { rating = "BUY"; signal = "價值浮現"; strategy = "股價低於平均淑價，具備安全邊際，建議建立部位。"; } 
                    else if (realPrice > avgExp) { rating = "SELL"; signal = "估值偏高"; strategy = "股價超越平均昂貴價，建議適度獲利了結。"; } 
                    else { rating = "HOLD"; signal = "觀望"; strategy = "股價處於合理區間，建議持有觀望。"; }
                }
            }

            const finalReport = {
                symbol: symbol, realPrice: realPrice, date: new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
                ai: reportRaw, 
                math: { valA, valB, avgCheap, avgExp, currentPE, range: { cheap: `($${Math.min(valA.cheap, valB.cheap)} ~ $${Math.max(valA.cheap, valB.cheap)})`, exp: `($${Math.min(valA.exp, valB.exp)} ~ $${Math.max(valA.exp, valB.exp)})`, pe: `(${valB.fail?'--':valB.pe_cheap}x ~ ${valB.fail?'--':valB.pe_exp}x)` } }, 
                decision: { rating, signal, strategy }
            };

            loadingText.innerText = '寫入日期與儲存報告...';
            const saveRes = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify({ action: 'saveReport', data: { symbol: symbol, market: market, content: JSON.stringify(finalReport) } }) });
            const saveResult = await saveRes.json();
            if(saveResult.success) { loadReport(prefix); if(window.syncSheetData) window.syncSheetData(); } 
            else throw new Error(saveResult.message);
        } catch (error) { window.showAlert('發生錯誤：\n' + error.message); loadingDiv.style.display = 'none'; }
    }

    async function loadReport(prefix = '') {
        const symbol = window.appState.currentDetailSymbol;
        const scriptUrl = window.appState.userScriptUrl;
        if (!symbol || symbol === '--' || !scriptUrl) return;
        
        const loadingDiv = document.getElementById(prefix + 'report-loading');
        const contentDiv = document.getElementById(prefix + 'report-content');
        const frame = document.getElementById(prefix + 'report-frame');

        loadingDiv.classList.remove('hidden'); loadingDiv.style.display = 'flex'; contentDiv.classList.add('hidden');
        document.getElementById(prefix + 'report-loading-text').innerText = '從雲端讀取報告中...';

        try {
            const res = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify({ action: 'getReport', data: { symbol: symbol } }) });
            const result = await res.json();

            if (result.success && result.found) {
                const data = JSON.parse(result.html);
                const tplRes = await fetch('StockApp_Report_Form.html?t=' + new Date().getTime());
                const doc = new DOMParser().parseFromString(await tplRes.text(), 'text/html');
                const setTxt = (id, txt) => { if(doc.getElementById(id)) doc.getElementById(id).innerHTML = txt; };     
                
                // 更新外部視窗的日期
                if(prefix === 'fav-') { if(document.getElementById('fav-detail-date')) document.getElementById('fav-detail-date').innerText = data.date; }
                else { if(document.getElementById('detail-report-date')) document.getElementById('detail-report-date').innerText = data.date; }
                        
                setTxt('var-report-date', data.date); setTxt('var-stock-title', `${data.symbol} ${data.ai?.company_name||''}`);
                setTxt('var-biz-intro', data.ai?.biz_intro||''); setTxt('var-current-price', "$" + data.realPrice);
                
                setTxt('var-rating-text', data.decision.rating);
                if(data.decision.rating === "BUY") doc.getElementById('var-rating-text').style.color = "#4ADE80";
                if(data.decision.rating === "SELL") doc.getElementById('var-rating-text').style.color = "#F87171";
                
                setTxt('var-confidence-score', data.ai?.risk?.confidence_score||'--');
                if(doc.getElementById('var-gauge-fill')) doc.getElementById('var-gauge-fill').style.transform = `rotate(${((data.ai?.risk?.confidence_score||0)/100)*180}deg)`;
                
                setTxt('var-current-pe', data.math.currentPE + "倍");
                setTxt('var-cheap-avg', "$" + data.math.avgCheap); setTxt('var-exp-avg', "$" + data.math.avgExp);
                
                let pct = 0; let badgeText = "合理"; let badgeBg = "#FACC15"; let badgeColor = "#000";
                if (data.realPrice <= data.math.avgCheap) { pct = 0; badgeText = "淑"; badgeBg = "#166534"; badgeColor = "#FFF"; } 
                else if (data.realPrice >= data.math.avgExp) { pct = 100; badgeText = "貴"; badgeBg = "#991B1B"; badgeColor = "#FFF"; } 
                else { pct = ((data.realPrice - data.math.avgCheap) / (data.math.avgExp - data.math.avgCheap)) * 100; pct = Math.max(0, Math.min(100, pct)); }
                if(doc.getElementById('var-therm-marker')) doc.getElementById('var-therm-marker').style.left = pct + "%";
                let badge = doc.getElementById('var-therm-badge'); if(badge) { badge.innerText = badgeText; badge.style.backgroundColor = badgeBg; badge.style.color = badgeColor; }

                setTxt('var-op-advice', `操作建議：${data.decision.strategy}`);
                setTxt('var-co-dynamic', `<strong>營運與動態：</strong> ${data.ai?.market?.sentiment?.desc || data.ai?.market?.sentiment || "--"}`);
                
                let testsHtml = "";
                if(data.ai?.buffett_tests) {
                    const bt = data.ai.buffett_tests;
                    testsHtml = `<tr><td>獲利</td><td>${bt.profit?.value}</td><td>${bt.profit?.status}</td></tr>`;
                }
                setTxt('var-test-table-body', testsHtml);

                frame.srcdoc = doc.documentElement.outerHTML;
                loadingDiv.style.display = 'none'; contentDiv.classList.remove('hidden');
                setTimeout(() => { try { frame.style.height = (frame.contentWindow.document.body.scrollHeight + 50) + 'px'; } catch(e) { frame.style.height = '800px'; } }, 500);
            } else {
                window.showAlert(`找不到雲端報告，請點擊「更新報告」。`);
                loadingDiv.style.display = 'none';
            }
        } catch (error) { window.showAlert('讀取失敗：' + error.message); loadingDiv.style.display = 'none'; }
    }

    return { generateAndSaveReport, loadReport };
})();