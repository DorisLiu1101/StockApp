/**
 * [VER] v2.3
 * [[DESC]
 *  1. 淘汰 DDM 折現模型，導入「固定倍數+歷史倍數」雙軌混合 PER 本益比估值模型]
 *  2. 讓 AI 直接抓取最新的 EPS 與 歷史本益比區間，並在前端進行估值計算與評等決策
 *  3. 更新報告模板，將原本的 DDM 相關欄位改為 PE 相關欄位，並新增當前 PE 與 歷史 PE 區間的顯示
 *  4. 讀取時優先套用排序後的字串，若為舊版則動態比對
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
        
        // [修改重點] 讓 AI 去抓取 EPS 與 歷史本益比區間
        const prompt = `
            角色：巴菲特價值投資分析師。
            任務：分析${marketName} ${symbol}。目前真實股價為 ${realPrice} 元。
            請聯網搜尋最新財報、近5年股利與EPS、新聞、與最新 GDP 成長率。
            必須嚴格只輸出純 JSON 格式！絕對禁止任何開場白（例如"我將以..."）、結語或 Markdown 標記，請直接以大括號 { 開頭：
            {
                "company_name": "公司名稱", "biz_intro": "核心業務簡介(15字內)", "nav": 最新一季每股淨值(數字),
                "reinvestment_rate": 盈再率(數字,如 85 代表 85%), "gdp_yoy": 最新實質GDP年增率(數字,如 1.5),
                "eps_ttm": 近四季總EPS(數字,如 15.5), "pe_hist_low": 近三年歷史最低本益比(數字,如 10.5), "pe_hist_high": 近三年歷史最高本益比(數字,如 25.0),
                "history_5y": [{"year": "2023", "eps": 30.0, "div": 15.0, "roe": 25.0}],
                "buffett_tests": { "profit": {"value": "28.5%", "status": "通過 或 失敗"}, "cashflow": {"value": "85%", "status": "通過 或 失敗"}, "dividend": {"value": "42%", "status": "通過 或 失敗"}, "scale": {"value": "符合標準", "status": "通過 或 失敗"}, "chips": {"value": "穩定", "status": "通過 或 失敗"} },
                "market": { "policy": "政策風險說明...", "fx": "匯率影響說明...", "sentiment": "市場情緒...", "news": ["新聞1", "新聞2"], "analysts": "分析師觀點..." },
                "risk": { "confidence_score": 75, "flags": ["警示..."], "scenarios": [ {"type": "牛市 (Bull)", "prob": 20, "desc": "說明..."}, {"type": "標準 (Base)", "prob": 50, "desc": "說明..."}, {"type": "熊市 (Bear)", "prob": 30, "desc": "說明..."} ] }
            }
        `;
        
        const aiRes = await fetch(userScriptUrl, {
            method: 'POST', body: JSON.stringify({ action: 'askGemini', data: { prompt: prompt } })
        });
        
        const aiResJson = await aiRes.json();
        if (!aiResJson.success) throw new Error(aiResJson.message || "伺服器發生未知錯誤，請稍後再試。");
        if (!aiResJson.data || !aiResJson.data.candidates || !aiResJson.data.candidates[0]) throw new Error("AI 伺服器忙線未回傳有效內容，請稍後再試。");
        
        let rawText = aiResJson.data.candidates[0].content.parts[0].text;
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

        // 驗證新增的 EPS 與 PE 欄位
        if (isNaN(Number(reportRaw.eps_ttm)) || isNaN(Number(reportRaw.pe_hist_low)) || isNaN(Number(reportRaw.pe_hist_high))) {
            hasValidMathData = false;
        }
        
        if (!reportRaw.history_5y || !Array.isArray(reportRaw.history_5y) || reportRaw.history_5y.length === 0) {
            reportRaw.history_5y = [{ "year": "--", "eps": "--", "div": "--", "roe": "--" }];
        }

        loadingText.innerText = '本機執行 PER 雙軌本益比運算中...';
        
        // [修改重點] 取代原本的 DDM，實作方案 A 與方案 B 的雙軌 PER
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
                
                // 方案 A：固定倍數
                valA = { cheap: Math.round(eps * 12), exp: Math.round(eps * 30), pe_cheap: 12, pe_exp: 20, fail: false };
                
                // 方案 B：歷史動態倍數
                valB = { cheap: Math.round(eps * peLow), exp: Math.round(eps * peHigh), pe_cheap: peLow, pe_exp: peHigh, fail: false };

                // 綜合平均
                avgCheap = Math.round((valA.cheap + valB.cheap) / 2);
                avgExp = Math.round((valA.exp + valB.exp) / 2);
                
                let isGdpLow = Number(reportRaw.gdp_yoy) < 2.0;

                // 決策邏輯
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

                // ==========================================
                // 區間強制排序 (確保由小到大)，寫入專屬的 range 字串
                // ==========================================
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
                    // [修改重點] 額外傳遞 market 屬性給後端
                    method: 'POST', body: JSON.stringify({ action: 'saveReport', data: { symbol: symbol, market: currentDetailMarket, content: JSON.stringify(finalReport) } })
                });
        
        const saveResult = await saveRes.json();
        if(saveResult.success) {
            window.loadReport(); 
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
            
            // [修改重點] 將原本渲染 DDM 的元素改為渲染 PE
            // [修改重點] 讀取時優先套用排序後的字串，若為舊版則動態比對
                    setTxt('var-current-pe', data.math.currentPE + "倍");
                    setTxt('var-pe-range', data.math.range ? data.math.range.pe : `(歷史：${data.math.valB.pe_cheap}x ~ ${data.math.valB.pe_exp}x)`);
                    setTxt('var-cheap-avg', "$" + data.math.avgCheap);
                    setTxt('var-cheap-range', data.math.range ? data.math.range.cheap : `($${Math.min(data.math.valA.cheap, data.math.valB.cheap)} ~ $${Math.max(data.math.valA.cheap, data.math.valB.cheap)})`);
                    setTxt('var-exp-avg', "$" + data.math.avgExp);
                    setTxt('var-exp-range', data.math.range ? data.math.range.exp : `($${Math.min(data.math.valA.exp, data.math.valB.exp)} ~ $${Math.max(data.math.valA.exp, data.math.valB.exp)})`);
            
            let pct = ((data.realPrice - data.math.avgCheap) / (data.math.avgExp - data.math.avgCheap)) * 100;
            pct = Math.max(0, Math.min(100, pct));
            if(doc.getElementById('var-therm-marker')) doc.getElementById('var-therm-marker').style.left = pct + "%";

            setTxt('var-op-advice', `操作建議：${data.decision.strategy.includes('買')?'分批佈局':(data.decision.strategy.includes('賣')?'減碼賣出':'觀望持有')}`);
            setTxt('var-op-desc', data.decision.strategy);
            
            setTxt('var-co-dynamic', `<strong>營運與動態：</strong> ${data.ai.market.sentiment}`);
            setTxt('var-co-metrics', `<strong>基本指標：</strong> 最新 NAV $${data.ai.nav}, 近四季EPS $${data.ai.eps_ttm}`);
            
            const bt = data.ai.buffett_tests;
            setTxt('var-test-summary', `<strong>測試結果摘要：</strong> 系統完成5項壓力測試，詳見下方清單。`);
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
                finHtml += `<tr><td>${y.year}</td><td>$${y.div}</td><td>--</td><td>$${y.eps}</td><td>--</td><td>${y.roe}%</td></tr>`;
            });
            setTxt('var-fin-table-body', finHtml);
            setTxt('var-fin-summary', `<strong>數據摘要：</strong> 近五年獲利紀錄已帶入，估價採用近四季 EPS (${data.ai.eps_ttm}) 為基準計算。`);

            // [修改重點] 估價分析表格渲染 PE 變數
            setTxt('var-val-pe-a', `12x ~ 30x`);
            setTxt('var-val-pe-b', (data.math.valB.fail ? 'N/A' : `${data.math.valB.pe_cheap}x ~ ${data.math.valB.pe_exp}x`));
            setTxt('var-val-cheap-a', `$${data.math.valA.cheap}`);
            setTxt('var-val-cheap-b', `$${data.math.valB.cheap}`);
            setTxt('var-val-exp-a', `$${data.math.valA.exp}`);
            setTxt('var-val-exp-b', `$${data.math.valB.exp}`);

            setTxt('var-mkt-policy', `<strong>政策風險：</strong> ${data.ai.market.policy}`);
            setTxt('var-mkt-fx', `<strong>匯率敏感度：</strong> ${data.ai.market.fx}`);
            setTxt('var-mkt-sentiment', `<strong>市場情緒：</strong> ${data.ai.market.sentiment}`);
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
            setTxt('var-conc-gdp-signal', `<strong>GDP 訊號：</strong> 最新公佈為 ${data.ai.gdp_yoy}%。`);
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