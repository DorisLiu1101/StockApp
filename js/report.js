/**
 * [VER] v5.12 [2026-02-25]
 * [DESC] 
 * 1. 導入動態提示詞 (Dynamic Prompting)：美股強制維持英文公司名稱，台/日股則翻譯為繁體中文。
 * 2. 繼承 v5.11 所有純淨排版與強效字串整平防護。
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
            
            // 🛡️ [核心修改] 動態指令：判斷如果是美股，就嚴格限制維持英文原名
            const langRule = market === 'US' 
                ? "除「公司名稱」必須維持『英文原名』外，其餘所有內容必須強制翻譯並使用「繁體中文(台灣)」，禁止簡體字。" 
                : "所有內容(含公司名稱)必須強制翻譯並使用「繁體中文(台灣)」，禁止簡體字。";
                
            const companyNameFormat = market === 'US' ? "英文公司原名(嚴禁翻譯為中文)" : "繁體公司名稱";

            const prompt = `角色：巴菲特價值投資分析師。任務：分析${marketName} ${symbol}。目前股價為 {{REAL_PRICE}}。請聯網搜尋最新財報、新聞。
⚠️極度重要規範：
1. ${langRule}
2. 嚴格只輸出純 JSON！(若值為文字，絕對禁止包含"雙引號")。請以 { 開頭：
{"company_name": "${companyNameFormat}", "biz_intro": "嚴格遵守『標籤A | 標籤B | 標籤C』格式之精煉業務簡介(例如：金屬機殼龍頭 | 轉型高階醫材與半導體設備 或 台灣第二大水泥廠 | 嘉惠電力(綠能) | 中國市場轉機)，嚴禁長句敘述", "nav": 最新每股淨值(數字), "reinvestment_rate": 盈再率(數字), "gdp_yoy": 實質GDP年增率(數字), "eps_ttm": 近四季EPS(數字), "pe_hist_low": 近3年最低本益比(數字), "pe_hist_high": 近3年最高本益比(數字), "avg_yield_3y": 近3年平均殖利率(數字), "avg_yield_5y": 近5年平均殖利率(數字), "div_frequency": "配息頻率", "buffett_summary": ["摘要重點1(限30字)", "摘要重點2(限30字)", "摘要重點3(限30字)"], "fin_annotation": "財務簡要標註", "health": { "tag": "強健或中等", "desc": "體質說明(50字內)", "table": [ {"item": "盈再率", "data": "數字", "eval": "評價(如:良好)"}, {"item": "ROE趨勢", "data": "說明", "eval": "評價(如:趨勢向上)"}, {"item": "本益比位階", "data": "說明", "eval": "評價(如:歷史高位)"}, {"item": "營運現金流", "data": "說明", "eval": "評價"}, {"item": "負債結構", "data": "說明", "eval": "評價"} ] }, "history_5y": [{"year": "2023", "eps": 30.0, "div": 15.0, "roe": 25.0, "yield": 5.2, "payout": 50.0}], "buffett_tests": { "profit": {"value": "28.5%", "status": "通過"}, "cashflow": {"value": "85%", "status": "通過"}, "dividend": {"value": "42%", "status": "通過"}, "scale": {"value": "符合標準", "status": "通過"}, "chips": {"value": "穩定", "status": "通過"} }, "market": { "policy": "政策風險精煉說明", "fx": "匯率影響精煉說明", "sentiment": { "tag": "極度貪婪等", "desc": "情緒說明" }, "news": ["重點新聞1", "重點新聞2"], "analysts": "分析師觀點精煉" }, "risk": { "confidence_score": 75, "flags": ["風險1", "風險2"], "scenarios": [ {"type": "牛市", "prob": 20, "desc": "說明"}, {"type": "標準", "prob": 50, "desc": "說明"}, {"type": "熊市", "prob": 30, "desc": "說明"} ] } }`;
            
            const aiRes = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify({ action: 'askGemini', data: { prompt: prompt, symbol: symbol, market: market } }) });
            const aiResJson = await aiRes.json();
            if (!aiResJson.success) throw new Error(aiResJson.message || "伺服器錯誤。");
            
            let realPrice = aiResJson.realPrice || 0;
            const rawText = aiResJson.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if(!rawText) throw new Error("AI 未能產出有效報告");
            
            let reportRaw;
            try {
                let jsonStr = rawText.match(/\{[\s\S]*\}/)[0].replace(/```json/gi, '').replace(/```/g, '').trim();
                jsonStr = jsonStr.replace(/[\n\r]+/g, ' ').replace(/\t/g, ' ');
                reportRaw = JSON.parse(jsonStr);
            } catch (parseError) {
                console.error("解析失敗:", rawText);
                throw new Error("AI 產出格式異常。請點擊「更新按鈕」重試！");
            }

            let hasValidMathData = !(isNaN(Number(reportRaw.eps_ttm)) || isNaN(Number(reportRaw.pe_hist_low)) || isNaN(Number(reportRaw.pe_hist_high)));
            let valA = { cheap: 0, exp: 0, pe_cheap: 12, pe_exp: 20, fail: true }, valB = { cheap: 0, exp: 0, pe_cheap: 0, pe_exp: 0, fail: true };
            let avgCheap = 0, avgExp = 0, currentPE = "N/A", rating = "N/A", signal = "資料不足", strategy = "因數據不足，估值運算暫停。";

            if (realPrice > 0 && hasValidMathData) {
                const eps = Number(reportRaw.eps_ttm), peLow = Number(reportRaw.pe_hist_low), peHigh = Number(reportRaw.pe_hist_high);
                if (eps > 0) {
                    currentPE = (realPrice / eps).toFixed(1);
                    valA = { cheap: Math.round(eps * 12), exp: Math.round(eps * 30), pe_cheap: 12, pe_exp: 30, fail: false };
                    valB = { cheap: Math.round(eps * peLow), exp: Math.round(eps * peHigh), pe_cheap: peLow, pe_exp: peHigh, fail: false };
                    avgCheap = Math.round((valA.cheap + valB.cheap) / 2); avgExp = Math.round((valA.exp + valB.exp) / 2);
                    if (realPrice < avgCheap) { rating = "BUY"; signal = "價值浮現"; strategy = `目前股價為 $${realPrice}，低於平均淑價 ($${avgCheap})，具備安全邊際與高殖利率保護，建議可開始分批佈局。`; } 
                    else if (realPrice > avgExp) { rating = "SELL"; signal = "估值偏高"; strategy = `目前股價為 $${realPrice}，已超越平均昂貴價 ($${avgExp})，估值偏高，建議適度獲利了結或降低部位。`; } 
                    else { rating = "HOLD"; signal = "觀望"; strategy = `目前股價為 $${realPrice}，處於淑價與貴價之間的合理區間，建議持有觀望。`; }
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
        document.getElementById(prefix + 'report-loading-text').innerText = '從雲端讀取與渲染報告中...';

        try {
            const res = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify({ action: 'getReport', data: { symbol: symbol } }) });
            const result = await res.json();

            if (result.success && result.found) {
                const data = JSON.parse(result.html);
                const tplRes = await fetch('StockApp_Report_Form.html?t=' + new Date().getTime());
                const doc = new DOMParser().parseFromString(await tplRes.text(), 'text/html');
                const setTxt = (id, txt) => { if(doc.getElementById(id)) doc.getElementById(id).innerHTML = txt; };     
                
                const finalDate = (data.date || result.date || "--").replace(/-/g, "/");
                if(prefix === 'fav-') { if(document.getElementById('fav-detail-date')) document.getElementById('fav-detail-date').innerText = finalDate; }
                else { if(document.getElementById('detail-report-date')) document.getElementById('detail-report-date').innerText = finalDate; }
                
                setTxt('var-report-date', finalDate); 
                setTxt('var-stock-title', `${data.symbol} ${data.ai?.company_name || ''}`);
                setTxt('var-biz-intro', data.ai?.biz_intro || '尚無業務簡介'); 
                setTxt('var-current-price', "$" + data.realPrice);
                setTxt('var-price-date', `Date: ${finalDate}`);
                
                setTxt('var-rating-text', data.decision?.rating || '--'); 
                setTxt('var-rating-signal', data.decision?.signal || '--');
                if(data.decision?.rating === "BUY" && doc.getElementById('var-rating-text')) doc.getElementById('var-rating-text').style.color = "#4ADE80";
                if(data.decision?.rating === "SELL" && doc.getElementById('var-rating-text')) doc.getElementById('var-rating-text').style.color = "#F87171";
                
                setTxt('var-confidence-score', data.ai?.risk?.confidence_score || '--');
                if(doc.getElementById('var-gauge-fill')) doc.getElementById('var-gauge-fill').style.transform = `rotate(${((data.ai?.risk?.confidence_score || 0)/100)*180}deg)`;
                
                setTxt('var-current-pe', (data.math?.currentPE || '--') + "倍"); 
                setTxt('var-pe-range', `(動態區間：${data.math?.range?.pe || '--'})`);
                setTxt('var-cheap-avg', "$" + (data.math?.avgCheap || '--')); 
                setTxt('var-cheap-range', data.math?.range?.cheap || '(-- ~ --)');
                setTxt('var-exp-avg', "$" + (data.math?.avgExp || '--')); 
                setTxt('var-exp-range', data.math?.range?.exp || '(-- ~ --)');
                
                if (data.math && data.math.avgCheap && data.math.avgExp) {
                    let pct = 0; let badgeText = "合理"; let badgeBg = "#FACC15"; let badgeColor = "#000";
                    if (data.realPrice <= data.math.avgCheap) { pct = 0; badgeText = "淑"; badgeBg = "#166534"; badgeColor = "#FFF"; } 
                    else if (data.realPrice >= data.math.avgExp) { pct = 100; badgeText = "貴"; badgeBg = "#991B1B"; badgeColor = "#FFF"; } 
                    else { pct = ((data.realPrice - data.math.avgCheap) / (data.math.avgExp - data.math.avgCheap)) * 100; pct = Math.max(0, Math.min(100, pct)); }
                    if(doc.getElementById('var-therm-marker')) doc.getElementById('var-therm-marker').style.left = pct + "%";
                    let badge = doc.getElementById('var-therm-badge'); if(badge) { badge.innerText = badgeText; badge.style.backgroundColor = badgeBg; badge.style.color = badgeColor; }
                }

                setTxt('var-op-advice', `<strong style="color:var(--color-primary);">操作建議：</strong> <span style="color:#FFF; font-weight:400;">${data.decision?.strategy || '--'}</span>`);
                
                let summaryHtml = "";
                if (Array.isArray(data.ai?.buffett_summary)) {
                    summaryHtml = data.ai.buffett_summary.map(s => `<li>${s}</li>`).join('');
                } else if (typeof data.ai?.buffett_summary === 'string') {
                    summaryHtml = `<li>${data.ai.buffett_summary}</li>`;
                } else {
                    summaryHtml = `<li>目前無 AI 綜合摘要。</li>`;
                }
                setTxt('var-company-summary', summaryHtml);
                
                setTxt('var-co-dynamic', data.ai?.market?.sentiment?.desc || data.ai?.market?.sentiment || "尚無明確情緒動向");
                setTxt('var-co-metrics', `最新淨值: ${data.ai?.nav || '--'} | 盈再率: ${data.ai?.reinvestment_rate || '--'} | GDP年增率: ${data.ai?.gdp_yoy || '--'}`);

                setTxt('var-test-summary', data.ai?.fin_annotation || '無特別標註');
                
                let testsHtml = "";
                if(data.ai?.buffett_tests) {
                    const bt = data.ai.buffett_tests;
                    const testItems = [ { name: '獲利能力', key: bt.profit }, { name: '現金流量', key: bt.cashflow }, { name: '配息穩定', key: bt.dividend }, { name: '規模門檻', key: bt.scale }, { name: '籌碼結構', key: bt.chips } ];
                    testItems.forEach(t => {
                        let statusText = t.key?.status || '--';
                        let badgeClass = statusText.includes('未') || statusText.includes('不') ? 'badge-fail' : (statusText.includes('通過') ? 'badge-pass' : 'badge-neutral');
                        testsHtml += `<tr><td><strong>${t.name}</strong></td><td>${t.key?.value || '--'}</td><td><span class="badge ${badgeClass}">${statusText}</span></td></tr>`;
                    });
                }
                setTxt('var-test-table-body', testsHtml || `<tr><td colspan="3">無資料</td></tr>`);

                setTxt('var-fin-summary', `近三年平均殖利率: ${data.ai?.avg_yield_3y || '--'}%, 配息頻率: ${data.ai?.div_frequency || '--'}`);
                let finHtml = "";
                if (Array.isArray(data.ai?.history_5y)) {
                    data.ai.history_5y.forEach(item => { finHtml += `<tr><td><strong>${item.year || '--'}</strong></td><td>${item.div || '--'}</td><td>${item.yield || '--'}%</td><td>${item.eps || '--'}</td><td>${item.payout || '--'}%</td><td>${item.roe || '--'}%</td></tr>`; });
                }
                setTxt('var-fin-table-body', finHtml || `<tr><td colspan="6">無近五年資料</td></tr>`);

                setTxt('var-health-tag', data.ai?.health?.tag || "");
                setTxt('var-health-desc', data.ai?.health?.desc || "無說明");
                let healthTableHtml = "";
                if (Array.isArray(data.ai?.health?.table)) {
                    data.ai.health.table.forEach(row => { 
                        let evalText = row.eval || '--';
                        let evalPass = evalText.includes('好') || evalText.includes('穩') || evalText.includes('高') || evalText.includes('向上') || evalText.includes('佳') || evalText.includes('充裕');
                        let evalFail = evalText.includes('差') || evalText.includes('弱') || evalText.includes('低') || evalText.includes('高位') || evalText.includes('警戒');
                        let badgeClass = evalPass ? 'badge-pass' : (evalFail ? 'badge-fail' : 'badge-neutral');
                        healthTableHtml += `<tr><td><strong>${row.item || '--'}</strong></td><td>${row.data || '--'}</td><td><span class="badge ${badgeClass}">${evalText}</span></td></tr>`; 
                    });
                }
                setTxt('var-health-table-body', healthTableHtml || `<tr><td colspan="3">無資料</td></tr>`);

                setTxt('var-val-pe-a', `12 / 30 倍`); setTxt('var-val-pe-b', `${data.ai?.pe_hist_low || '--'} / ${data.ai?.pe_hist_high || '--'} 倍`);
                setTxt('var-val-cheap-a', `$${data.math?.valA?.cheap || '--'}`); setTxt('var-val-exp-a', `$${data.math?.valA?.exp || '--'}`);
                setTxt('var-val-cheap-b', `$${data.math?.valB?.cheap || '--'}`); setTxt('var-val-exp-b', `$${data.math?.valB?.exp || '--'}`);

                setTxt('var-mkt-policy', data.ai?.market?.policy || "無相關資訊");
                setTxt('var-mkt-fx', data.ai?.market?.fx || "無相關資訊");
                
                let sentiTag = data.ai?.market?.sentiment?.tag || "中立";
                let sentiColor = sentiTag.includes('貪婪') ? 'text-[#86EFAC]' : (sentiTag.includes('恐懼') ? 'text-[#FCA5A5]' : 'text-[#FDE047]');
                setTxt('var-mkt-sentiment-badge', `<span class="badge badge-neutral bg-transparent border-0 ${sentiColor} px-0" style="font-size:13px; font-weight:normal;">[${sentiTag}]</span>`);
                
                setTxt('var-mkt-analyst', data.ai?.market?.analysts || "無相關資訊");
                
                let newsHtml = (data.ai?.market?.news || []).map(n => `<li>${n}</li>`).join('');
                setTxt('var-mkt-news', newsHtml ? `<ul class="clean-list" style="margin-top:0;">${newsHtml}</ul>` : "無最新新聞");
                
                setTxt('var-risk-confidence-list', `<li>${data.ai?.risk?.confidence_score || '--'} / 100</li>`);
                let flagsHtml = (data.ai?.risk?.flags || []).map(f => `<span class="badge badge-fail" style="margin-right:8px; margin-bottom:8px;">${f}</span>`).join('');
                setTxt('var-risk-flags-list', flagsHtml || `<span class="badge badge-neutral border-0 bg-transparent text-gray-500">無特別風險警示</span>`);

                let scenarios = data.ai?.risk?.scenarios || [];
                if(scenarios.length >= 1) { 
                    setTxt('var-matrix-name-bull', `<span class="material-icons" style="font-size:16px; vertical-align:-3px; color:#4ADE80; margin-right:4px;">trending_up</span><strong>牛市 (Bull)</strong>`); 
                    setTxt('var-matrix-prob-bull', `${scenarios[0].prob}%`); 
                    setTxt('var-matrix-desc-bull', scenarios[0].desc); 
                }
                if(scenarios.length >= 2) { 
                    setTxt('var-matrix-name-base', `<span class="material-icons" style="font-size:16px; vertical-align:-3px; color:#FACC15; margin-right:4px;">balance</span><strong>標準 (Base)</strong>`); 
                    setTxt('var-matrix-prob-base', `${scenarios[1].prob}%`); 
                    setTxt('var-matrix-desc-base', scenarios[1].desc); 
                }
                if(scenarios.length >= 3) { 
                    setTxt('var-matrix-name-bear', `<span class="material-icons" style="font-size:16px; vertical-align:-3px; color:#F87171; margin-right:4px;">trending_down</span><strong>熊市 (Bear)</strong>`); 
                    setTxt('var-matrix-prob-bear', `${scenarios[2].prob}%`); 
                    setTxt('var-matrix-desc-bear', scenarios[2].desc); 
                }

                setTxt('var-conc-price-level', data.decision?.signal || '--');
                setTxt('var-conc-gdp-signal', `實質 GDP 年增率 ${data.ai?.gdp_yoy || '--'}`);
                setTxt('var-conc-strategy', data.decision?.strategy || '無進一步建議。');

                frame.srcdoc = doc.documentElement.outerHTML;
                loadingDiv.style.display = 'none'; contentDiv.classList.remove('hidden');
                setTimeout(() => { try { frame.style.height = (frame.contentWindow.document.body.scrollHeight + 50) + 'px'; } catch(e) { frame.style.height = '1500px'; } }, 800);
            } else {
                window.showAlert(`找不到雲端報告，請點擊上方「同步」按鈕重新產生。`);
                loadingDiv.style.display = 'none';
            }
        } catch (error) { window.showAlert('讀取渲染失敗：' + error.message); loadingDiv.style.display = 'none'; }
    }

    return { generateAndSaveReport, loadReport };
})();