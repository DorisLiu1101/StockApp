/* 
 [VER] v2.7.0 [2026-03-25]
 [DESC] 實作基本資料 API 欄位精準對接，並加入折疊區塊與預設膠囊狀態的初始化機制
 [DESC] 實作真實日曆基準法 (季度過濾)、空值顯示為淺灰雙底線、展開更多功能，並強制抓取「前一年度」配息頻率進行字典轉換 
 */

window.portfolioService = (function() {
    let allPortfolioData = [];
    let currentStock = null;
    let currentFilter = 'ALL', currentChartFilter = 'ALL', currentSort = { field: 'gain', order: 'desc' };
    let isQuarterExpanded = false;

    function setPortfolioData(data) { allPortfolioData = data; filterStocks(); updateHomeChart('ALL'); }
    function getPortfolioData() { return allPortfolioData; }

    function updateHomeChart(marketFilter) {
        currentChartFilter = marketFilter; const data = (marketFilter === 'ALL') ? allPortfolioData : allPortfolioData.filter(i => i.market === marketFilter);
        if (data.length === 0) { renderChart([], []); return; }
        const sectors = {}; let totalVal = 0; data.forEach(item => { const s = item.sector || '其他'; const v = item.marketValue || 0; sectors[s] = (sectors[s] || 0) + v; totalVal += v; });
        let sortedSectors = Object.keys(sectors).map(key => ({ label: key, value: sectors[key], pct: (totalVal > 0) ? Math.round((sectors[key] / totalVal) * 100) : 0 })).sort((a, b) => b.value - a.value);
        const top5 = sortedSectors.slice(0, 5); renderChart(top5.map(s => s.pct), top5.map(s => s.label));
    }

    function renderChart(vals, labels) {
        if (!document.getElementById('portfolio-chart')) return;
        const colors=['#D4AF37','#B4941F','#756010','#4B5563','#1F2937']; let grad="conic-gradient(", curr=0, leg="";
        if (vals.length === 0) { document.getElementById('portfolio-chart').style.background = '#222'; document.getElementById('sector-legend').innerHTML = '<div class="text-xs text-gray-600">無數據</div>'; document.getElementById('chart-center-text').innerText = "0%"; return; }
        vals.forEach((v,i)=>{ const c=colors[i]||colors[colors.length-1]; grad+=`${c} ${curr}% ${curr+v}%, `; curr+=v; leg+=`<div class="flex items-center justify-between text-xs mb-1"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:${c}"></div><span class="text-gray-400 truncate w-24">${labels[i]}</span></div><span class="text-gray-400 font-mono">${v}%</span></div>`; });
        document.getElementById('portfolio-chart').style.background=grad.slice(0,-2)+")"; document.getElementById('sector-legend').innerHTML=leg; document.getElementById('chart-center-text').innerText = vals.reduce((a,b)=>a+b,0) + "%";
    }

    function filterStocks() {
        const searchInput = document.getElementById('stock-search');
        const q = searchInput ? searchInput.value.toLowerCase() : '';
        let f = allPortfolioData.filter(i => { const m = (currentFilter === 'ALL') || (i.market === currentFilter); return m && (String(i.symbol).toLowerCase().includes(q) || String(i.name||'').toLowerCase().includes(q)); });
        f.sort((a, b) => {
            if (currentSort.field === 'symbol') return currentSort.order === 'desc' ? -String(a.symbol).localeCompare(String(b.symbol),undefined,{numeric:true}) : String(a.symbol).localeCompare(String(b.symbol),undefined,{numeric:true});
            let vA=0, vB=0; if(currentSort.field==='expReturn') {vA=Number(a.expReturn)||0; vB=Number(b.expReturn)||0;} else if(currentSort.field==='gain') {vA=a.gain; vB=b.gain;} else if(currentSort.field==='weight') {vA=a.marketValue; vB=b.marketValue;} return currentSort.order==='desc'?vB-vA:vA-vB;
        });
        renderStockList(f);
    }

    function renderStockList(list) {
        const c = document.getElementById('stock-list-container');
        if (!c) return;
        if(!list.length) { c.innerHTML="<p class='text-center text-gray-600 text-sm py-16 uppercase tracking-widest'>No Positions Found</p>"; return; }
        
        let html = "";
        list.forEach(item => {
            // 🛡️ [新增防呆機制] 安全的數字格式化工具
            const safeFmt = (n) => {
                // 如果是 null、undefined、空字串或根本不是數字，一律優雅回傳 '--'，絕不崩潰
                if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
                return Number(n).toLocaleString();
            };

            // 針對損益 (Gain) 進行防呆處理
            const isGain = Number(item.gain) >= 0; 
            const gainAmtStr = (item.gain === null || item.gain === undefined || isNaN(Number(item.gain))) 
                ? '--' 
                : (isGain ? "+" : "") + safeFmt(Math.round(Number(item.gain)));
            
            const gainPctStr = (item.gainPct === null || item.gainPct === undefined || item.gainPct === '') 
                ? '--%' 
                : (isGain ? '+' : '') + item.gainPct + '%';

            let badgeClass = item.market === 'TW' ? "bg-blue-950 text-blue-300 border-blue-800" : (item.market === 'US' ? "bg-yellow-950 text-yellow-300 border-yellow-800" : "bg-red-950 text-red-300 border-red-800");
            
            html += `<div onclick="window.portfolioService.openStockDetail('${item.market}', '${item.symbol}')" class="app-card py-[5px] px-[10px] flex flex-col justify-center cursor-pointer hover:bg-[#1A1A1A] transition-all my-[10px] mx-[5px] active:scale-[0.98] shadow-md h-full">
                <div class="flex justify-between items-center mb-1">
                    <div class="flex items-center gap-2 min-w-0 flex-1 mr-2 overflow-hidden">
                        <span class="text-xs px-1.5 py-0.5 rounded border font-bold uppercase min-w-[30px] text-center flex-shrink-0 ${badgeClass}">${item.market}</span>
                        <span class="text-[20px] font-bold text-white font-mono tracking-wide flex-shrink-0">${item.symbol}</span>
                        <span class="text-[18px] text-gray-400 font-light truncate">${item.name || '--'}</span>
                    </div>
                    <div class="text-[18px] font-bold text-gray-100 font-mono tracking-tight flex-shrink-0">${safeFmt(item.price)}</div>
                </div>
                <div class="flex justify-between items-center">
                    <div class="text-[18px] text-gray-500 font-mono">${safeFmt(item.qty)} sh</div>
                    <div class="text-[18px] font-bold ${isGain ? 'text-[#E57373]' : 'text-[#4DB6AC]'} font-mono">${gainPctStr} <span class="text-[18px] opacity-80 ml-1">(${gainAmtStr})</span></div>
                </div>
            </div>`;
        });
        c.innerHTML = html;
    }

    function toggleEpsView(view) {
        const btnB = document.getElementById('btn-eps-basic');
        const btnQ = document.getElementById('btn-eps-quarter');
        const btnY = document.getElementById('btn-eps-year');
        const btnD = document.getElementById('btn-eps-dividend');
        
        const viewB = document.getElementById('eps-basic-view');
        const viewQ = document.getElementById('eps-quarter-view');
        const viewY = document.getElementById('eps-year-view');
        const viewD = document.getElementById('eps-dividend-view');
        
        const activeClass = "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all bg-gray-700 text-white shadow-sm";
        const inactiveClass = "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all text-gray-400 hover:text-gray-200";

        if(btnB) btnB.className = view === 'basic' ? activeClass : inactiveClass;
        if(btnQ) btnQ.className = view === 'quarter' ? activeClass : inactiveClass;
        if(btnY) btnY.className = view === 'year' ? activeClass : inactiveClass;
        if(btnD) btnD.className = view === 'dividend' ? activeClass : inactiveClass;

        if(viewB) viewB.classList.toggle('hidden', view !== 'basic');
        if(viewQ) viewQ.classList.toggle('hidden', view !== 'quarter');
        if(viewY) viewY.classList.toggle('hidden', view !== 'year');
        if(viewD) viewD.classList.toggle('hidden', view !== 'dividend');
    }

    function toggleMoreQuarters() {
        isQuarterExpanded = !isQuarterExpanded;
        const rows = document.querySelectorAll('.hidden-q-row');
        const btn = document.getElementById('btn-toggle-quarters');
        
        rows.forEach(r => {
            if (isQuarterExpanded) r.classList.remove('hidden');
            else r.classList.add('hidden');
        });
        
        if (btn) {
            btn.innerHTML = isQuarterExpanded ? '收合歷史季度 ▴' : '展開更多歷史季度 ▾';
            btn.classList.toggle('text-[#D4AF37]', isQuarterExpanded);
            btn.classList.toggle('text-gray-400', !isQuarterExpanded);
        }
    }

    function renderEpsTables(stock) {
        const tbodyQ = document.getElementById('eps-quarter-tbody');
        const tbodyY = document.getElementById('eps-year-tbody');
        const tbodyD = document.getElementById('eps-dividend-tbody');
        
        if (!stock.records || !Array.isArray(stock.records) || stock.records.length === 0) {
            if(tbodyQ) tbodyQ.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500 text-xs">尚無歷史財報資料</td></tr>';
            if(tbodyY) tbodyY.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500 text-xs">尚無歷史財報資料</td></tr>';
            if(tbodyD) tbodyD.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500 text-xs">尚無歷年配息資料</td></tr>';
            return;
        }

        let records = [...stock.records].filter(r => r.Year && r.Year !== 'TTM');
        records.sort((a, b) => Number(b.Year) - Number(a.Year)); 
        const ttmRecord = stock.records.find(r => r.Year === 'TTM');
        const market = stock.market || 'TW';

        const getColorClass = (val) => {
            if (val > 0) return market === 'US' ? 'text-[#22c55e]' : 'text-[#ef4444]';
            if (val < 0) return market === 'US' ? 'text-[#ef4444]' : 'text-[#22c55e]';
            return 'text-gray-400';
        };

        const nullBadge = '<span class="text-gray-600 font-mono text-center w-full block">--</span>';

        async function prefetchBasicInfo(market, symbol) {
        const contentDiv = document.getElementById('basic-info-content');
        const loadingDiv = document.getElementById('basic-info-loading');
        
        // 初始化狀態
        if(loadingDiv) loadingDiv.classList.remove('hidden');
        if(contentDiv) { contentDiv.classList.add('hidden'); contentDiv.innerHTML = ''; }

        if (!window.appState || !window.appState.userScriptUrl) {
            if(loadingDiv) loadingDiv.classList.add('hidden');
            if(contentDiv) { contentDiv.innerHTML = '<p class="text-center text-xs text-red-400 py-6">請先至設定綁定 API 網址</p>'; contentDiv.classList.remove('hidden'); }
            return;
        }

        try {
            // 向 GAS 後端發送請求
            const res = await fetch(window.appState.userScriptUrl, { 
                method: 'POST', 
                body: JSON.stringify({ action: 'get_basic_info', data: { market: market, symbol: symbol } }) 
            });
            const json = await res.json();
            
            if(loadingDiv) loadingDiv.classList.add('hidden');
            if (json.success && json.data) {
                renderBasicInfoUI(json.data);
            } else {
                if(contentDiv) { contentDiv.innerHTML = '<p class="text-center text-xs text-gray-500 py-6">此個股尚無基本資料</p>'; contentDiv.classList.remove('hidden'); }
            }
        } catch (e) {
            if(loadingDiv) loadingDiv.classList.add('hidden');
            if(contentDiv) { contentDiv.innerHTML = '<p class="text-center text-xs text-red-400 py-6">資料載入失敗</p>'; contentDiv.classList.remove('hidden'); }
        }
    }

    function renderBasicInfoUI(rawData) {
        const contentDiv = document.getElementById('basic-info-content');
        if (!contentDiv) return;

        // 相容處理：確保抓到正確的資料層級 (防護 GAS 回傳原始 nstock 結構或解開後的物件)
        const data = (rawData && rawData.data && Array.isArray(rawData.data)) ? rawData.data[0] : rawData;
        if (!data || !data["股票代號"]) {
            contentDiv.innerHTML = '<p class="text-center text-xs text-red-400 py-6">資料格式解析異常或查無資料</p>';
            contentDiv.classList.remove('hidden');
            return;
        }

        // 1. 字典轉換 [Dictionary]：上市上櫃數字轉文字
        const marketTypeMap = { "1": "上市", "2": "上櫃", "3": "興櫃", "4": "創櫃", "5": "公開發行" };
        const marketType = marketTypeMap[data["上市上櫃"]] || data["上市上櫃"] || '--';

        // 2. 字串處理 [String Manipulation]：年季轉換 (例如 "202504" -> "2025Q4")
        let quarterStr = '--';
        const recentQuarter = data["近一季"];
        if (recentQuarter && recentQuarter["年季"]) {
            const yq = String(recentQuarter["年季"]);
            if (yq.length === 6) {
                quarterStr = yq.substring(0, 4) + 'Q' + parseInt(yq.substring(4, 6), 10); 
            } else {
                quarterStr = yq;
            }
        }

        // 3. UI 渲染：精準對接真實 JSON 欄位
        contentDiv.innerHTML = `
            <div>
                <h4 class="text-[12px] text-[#D4AF37] font-bold border-l-2 border-[#D4AF37] pl-2 mb-2">基本資訊</h4>
                <div class="grid grid-cols-2 gap-2 text-[13px]">
                    <div class="bg-[#1A1A1A] p-2 rounded border border-gray-800/60 flex flex-col justify-center"><span class="text-gray-500 text-[11px] block mb-0.5">產業</span><span class="text-gray-200 font-bold truncate">${data["產業名稱"] || '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2 rounded border border-gray-800/60 flex flex-col justify-center"><span class="text-gray-500 text-[11px] block mb-0.5">上市/上櫃</span><span class="text-gray-200 font-bold">${marketType}</span></div>
                    <div class="bg-[#1A1A1A] p-2 rounded border border-gray-800/60 flex flex-col justify-center"><span class="text-gray-500 text-[11px] block mb-0.5">掛牌年數</span><span class="text-gray-200 font-bold">${data["掛牌年數"] ? data["掛牌年數"] + ' 年' : '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2 rounded border border-gray-800/60 flex flex-col justify-center"><span class="text-gray-500 text-[11px] block mb-0.5">市值</span><span class="text-gray-200 font-bold">${data["總市值(億)"] ? data["總市值(億)"] + ' 億' : '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2 rounded border border-gray-800/60 flex flex-col justify-center"><span class="text-gray-500 text-[11px] block mb-0.5">股本</span><span class="text-gray-200 font-bold">${data["交易所公告股本(億)"] ? data["交易所公告股本(億)"] + ' 億' : '--'}</span></div>
                    <div class="col-span-2 bg-[#1A1A1A] p-2 rounded border border-gray-800/60"><span class="text-gray-500 text-[11px] block mb-0.5">經營項目</span><span class="text-gray-300 text-[12px] leading-relaxed break-words">${data["經營項目"] || '--'}</span></div>
                </div>
            </div>
            <div>
                <h4 class="text-[12px] text-[#D4AF37] font-bold border-l-2 border-[#D4AF37] pl-2 mb-2 mt-3">基本數據 (近四季)</h4>
                <div class="grid grid-cols-2 gap-2 text-[13px]">
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">公告每股淨值</span><span class="text-gray-200 font-mono font-bold">${data["公告每股淨值(元)"] || '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">股價淨值比</span><span class="text-gray-200 font-mono font-bold">${data["股價淨值比"] || '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">本益比</span><span class="text-gray-200 font-mono font-bold">${data["本益比(近四季)"] || '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">EPS</span><span class="text-gray-200 font-mono font-bold">${data["公告基本每股盈餘(近四季)"] || '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">ROE</span><span class="text-gray-200 font-mono font-bold">${data["ROE(近四季)"] ? data["ROE(近四季)"] + '%' : '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">ROA</span><span class="text-gray-200 font-mono font-bold">${data["ROA(近四季)"] ? data["ROA(近四季)"] + '%' : '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center col-span-2"><span class="text-gray-500 text-[12px]">現金股利殖利率</span><span class="text-[#D4AF37] font-mono font-bold">${data["現金股利殖利率(%)"] ? data["現金股利殖利率(%)"] + '%' : '--'}</span></div>
                </div>
            </div>
            <div>
                <h4 class="text-[12px] text-[#D4AF37] font-bold border-l-2 border-[#D4AF37] pl-2 mb-2 mt-3">財務資料 (${quarterStr})</h4>
                <div class="grid grid-cols-2 gap-2 text-[13px]">
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">ROE</span><span class="text-gray-200 font-mono font-bold">${recentQuarter && recentQuarter["ROE"] ? recentQuarter["ROE"] + '%' : '--'}</span></div>
                    <div class="bg-[#1A1A1A] p-2.5 rounded border border-gray-800/60 flex justify-between items-center"><span class="text-gray-500 text-[12px]">ROA</span><span class="text-gray-200 font-mono font-bold">${recentQuarter && recentQuarter["ROA"] ? recentQuarter["ROA"] + '%' : '--'}</span></div>
                    <div class="bg-transparent border-0 p-0 col-span-2 grid grid-cols-3 gap-2">
                        <div class="bg-[#1A1A1A] py-2 rounded border border-gray-800/60 flex flex-col items-center justify-center"><span class="text-gray-500 text-[11px] mb-0.5">毛利率</span><span class="text-gray-200 font-mono font-bold">${recentQuarter && recentQuarter["單季毛利率(％)"] ? recentQuarter["單季毛利率(％)"] + '%' : '--'}</span></div>
                        <div class="bg-[#1A1A1A] py-2 rounded border border-gray-800/60 flex flex-col items-center justify-center"><span class="text-gray-500 text-[11px] mb-0.5">營益率</span><span class="text-gray-200 font-mono font-bold">${recentQuarter && recentQuarter["單季營業利益率(％)"] ? recentQuarter["單季營業利益率(％)"] + '%' : '--'}</span></div>
                        <div class="bg-[#1A1A1A] py-2 rounded border border-gray-800/60 flex flex-col items-center justify-center"><span class="text-gray-500 text-[11px] mb-0.5">淨利率</span><span class="text-gray-200 font-mono font-bold">${recentQuarter && recentQuarter["單季稅後淨利率(％)"] ? recentQuarter["單季稅後淨利率(％)"] + '%' : '--'}</span></div>
                    </div>
                </div>
            </div>
        `;
        contentDiv.classList.remove('hidden');
    }



        // 1. 歷年表現 (年資料)
        if(tbodyY) {
            let yearHtml = '';
            if (ttmRecord && ttmRecord.EPS !== 'N/A') {
                yearHtml += `<tr class="border-b border-gray-800/50 bg-[#D4AF37]/5"><td class="py-2.5 font-mono text-gray-300 font-bold text-center">TTM</td><td class="py-2.5 text-center font-mono font-bold text-white">${Number(ttmRecord.EPS).toFixed(2)}</td><td class="py-2.5 text-center font-mono text-gray-500">--</td><td class="py-2.5 text-center font-mono text-gray-400">${ttmRecord.ROE !== 'N/A' ? (Number(ttmRecord.ROE) * 100).toFixed(2) + '%' : nullBadge}</td></tr>`;
            }
            records.forEach((r, index) => {
                let yoyHtml = nullBadge;
                if (r.EPS !== 'N/A' && index + 1 < records.length && records[index + 1].EPS !== 'N/A') {
                    let prevEps = Number(records[index + 1].EPS), curEps = Number(r.EPS);
                    if (prevEps !== 0 && !isNaN(prevEps) && !isNaN(curEps)) {
                        let yoy = ((curEps - prevEps) / Math.abs(prevEps)) * 100;
                        yoyHtml = `<span class="${getColorClass(yoy)}">${yoy > 0 ? '+' : ''}${yoy.toFixed(2)}%</span>`;
                    }
                }
                let epsStr = r.EPS === 'N/A' ? nullBadge : Number(r.EPS).toFixed(2);
                let roeStr = r.ROE === 'N/A' ? nullBadge : (Number(r.ROE) * 100).toFixed(2) + '%';
                yearHtml += `<tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td class="py-2.5 font-mono text-gray-400 text-center">${r.Year}</td>
                    <td class="py-2.5 text-center font-mono text-gray-300">${epsStr}</td>
                    <td class="py-2.5 text-center font-mono">${yoyHtml}</td>
                    <td class="py-2.5 text-center font-mono text-gray-500">${roeStr}</td>
                </tr>`;
            });
            tbodyY.innerHTML = yearHtml || '<tr><td colspan="4" class="text-center py-4 text-gray-500 text-xs">無歷年資料</td></tr>';
        }

        // 2. 季度動能 (季資料)
        if(tbodyQ) {
            let quartersData = [];
            records.forEach(r => {
                let y = Number(r.Year);
                if(r.EPS_Q4 !== undefined && r.EPS_Q4 !== "") quartersData.push({ qStr: `${y} Q4`, eps: r.EPS_Q4, year: y, q: 4 });
                if(r.EPS_Q3 !== undefined && r.EPS_Q3 !== "") quartersData.push({ qStr: `${y} Q3`, eps: r.EPS_Q3, year: y, q: 3 });
                if(r.EPS_Q2 !== undefined && r.EPS_Q2 !== "") quartersData.push({ qStr: `${y} Q2`, eps: r.EPS_Q2, year: y, q: 2 });
                if(r.EPS_Q1 !== undefined && r.EPS_Q1 !== "") quartersData.push({ qStr: `${y} Q1`, eps: r.EPS_Q1, year: y, q: 1 });
            });

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentQ = Math.ceil((now.getMonth() + 1) / 3);

            quartersData = quartersData.filter(qData => {
                if (qData.year > currentYear) return false;
                if (qData.year === currentYear && qData.q > currentQ) return false;
                return true;
            });

            quartersData.sort((a, b) => b.year - a.year || b.q - a.q);

            let quarterHtml = '';
            quartersData.forEach((qData, index) => {
                let yoyHtml = nullBadge;
                if (qData.eps !== 'N/A') {
                    let prevQ = quartersData.find(old => old.year === qData.year - 1 && old.q === qData.q);
                    if (prevQ && prevQ.eps !== 'N/A') {
                        let curEps = Number(qData.eps), prevEps = Number(prevQ.eps);
                        if (prevEps !== 0 && !isNaN(curEps) && !isNaN(prevEps)) {
                            let yoy = ((curEps - prevEps) / Math.abs(prevEps)) * 100;
                            yoyHtml = `<span class="${getColorClass(yoy)}">${yoy > 0 ? '+' : ''}${yoy.toFixed(2)}%</span>`;
                        }
                    }
                }
                
                let epsVal = qData.eps === 'N/A' ? nullBadge : Number(qData.eps).toFixed(2);
                let hiddenClass = index >= 8 ? 'hidden-q-row hidden' : '';

                quarterHtml += `<tr class="border-b border-gray-800/50 hover:bg-gray-800/30 ${hiddenClass}">
                    <td class="py-2.5 font-mono text-gray-400 text-center">${qData.qStr}</td>
                    <td class="py-2.5 text-center font-mono text-gray-300">${epsVal}</td>
                    <td class="py-2.5 text-center font-mono">${yoyHtml}</td>
                </tr>`;
            });

            if (quartersData.length > 8) {
                quarterHtml += `<tr id="quarter-toggle-row">
                    <td colspan="3" class="text-center py-3 border-b-0">
                        <button id="btn-toggle-quarters" onclick="window.portfolioService.toggleMoreQuarters()" class="text-[11px] text-gray-400 hover:text-[#D4AF37] tracking-widest w-full py-2 bg-[#1A1A1A] rounded-lg border border-gray-800/60 transition-colors shadow-sm focus:outline-none active:scale-95">
                            展開更多歷史季度 ▾
                        </button>
                    </td>
                </tr>`;
            }

            tbodyQ.innerHTML = quarterHtml || '<tr><td colspan="3" class="text-center py-4 text-gray-500 text-xs">無季度資料</td></tr>';
            isQuarterExpanded = false; 
        }

        // 3. 股利政策 (強制抓取前一年度配息頻率與字典轉換，並加入殖利率欄位)
        if(tbodyD) {
            let validYields = records.filter(r => r.CashYield !== 'N/A' && r.CashYield !== undefined && r.CashYield !== null).map(r => Number(r.CashYield));
            let avg3y = validYields.slice(0, 3).reduce((a,b)=>a+b, 0) / Math.min(validYields.length, 3);
            let avg5y = validYields.slice(0, 5).reduce((a,b)=>a+b, 0) / Math.min(validYields.length, 5);
            
            // 強制尋找前一年度
            const nowYear = new Date().getFullYear();
            const prevYear = nowYear - 1;
            const prevYearRecord = records.find(r => Number(r.Year) === prevYear);
            
            let divFreq = '--';
            if (prevYearRecord && prevYearRecord.DivFreq !== 'N/A' && prevYearRecord.DivFreq !== undefined && prevYearRecord.DivFreq !== null && prevYearRecord.DivFreq !== '') {
                let freqNum = Number(prevYearRecord.DivFreq);
                if (freqNum === 1) divFreq = "年配";
                else if (freqNum === 2) divFreq = "半年配";
                else if (freqNum === 4) divFreq = "季配";
                else if (freqNum === 6) divFreq = "雙月配";
                else if (freqNum === 12) divFreq = "月配";
                else if (!isNaN(freqNum)) divFreq = String(freqNum);
            }

            document.getElementById('div-freq-val').innerText = divFreq;
            document.getElementById('div-yield-3y').innerText = isNaN(avg3y) || validYields.length === 0 ? '--' : (avg3y * 100).toFixed(2) + '%';
            document.getElementById('div-yield-5y').innerText = isNaN(avg5y) || validYields.length === 0 ? '--' : (avg5y * 100).toFixed(2) + '%';

            let divHtml = '';
            if (ttmRecord && ttmRecord.CashDiv !== 'N/A') {
                let pr = ttmRecord.PayoutRatio === 'N/A' ? nullBadge : (Number(ttmRecord.PayoutRatio) * 100).toFixed(2) + '%';
                let yieldStr = ttmRecord.CashYield === 'N/A' ? nullBadge : (Number(ttmRecord.CashYield) * 100).toFixed(2) + '%';
                
                divHtml += `<tr class="border-b border-gray-800/50 bg-[#D4AF37]/5">
                    <td class="py-2.5 font-mono text-gray-300 font-bold text-center">TTM</td>
                    <td class="py-2.5 text-center font-mono font-bold text-[#D4AF37]">${Number(ttmRecord.CashDiv).toFixed(2)}</td>
                    <td class="py-2.5 text-center font-mono text-gray-300">${yieldStr}</td>
                    <td class="py-2.5 text-center font-mono text-gray-300">${ttmRecord.EPS !== 'N/A' ? Number(ttmRecord.EPS).toFixed(2) : nullBadge}</td>
                    <td class="py-2.5 text-center font-mono text-gray-400">${pr}</td>
                </tr>`;
            }
            records.slice(0, 6).forEach(r => {
                let divStr = r.CashDiv === 'N/A' ? nullBadge : Number(r.CashDiv).toFixed(2);
                let yieldStr = r.CashYield === 'N/A' ? nullBadge : (Number(r.CashYield) * 100).toFixed(2) + '%';
                let epsStr = r.EPS === 'N/A' ? nullBadge : Number(r.EPS).toFixed(2);
                let prStr = r.PayoutRatio === 'N/A' ? nullBadge : (Number(r.PayoutRatio) * 100).toFixed(2) + '%';
                
                divHtml += `<tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td class="py-2.5 font-mono text-gray-400 text-center">${r.Year}</td>
                    <td class="py-2.5 text-center font-mono text-[#D4AF37] opacity-90">${divStr}</td>
                    <td class="py-2.5 text-center font-mono text-gray-400">${yieldStr}</td>
                    <td class="py-2.5 text-center font-mono text-gray-300">${epsStr}</td>
                    <td class="py-2.5 text-center font-mono text-gray-400">${prStr}</td>
                </tr>`;
            });
            // 注意：colspan 改為 5
            tbodyD.innerHTML = divHtml || '<tr><td colspan="5" class="text-center py-4 text-gray-500 text-xs">無歷年配息資料</td></tr>';
        }
        
        //預設啟動的膠囊按鈕
        toggleEpsView('year');
    }

    function openStockDetail(market, symbol) {
        if(window.pushModalState) window.pushModalState('detail');
        const stock = allPortfolioData.find(s => s.market === market && s.symbol === symbol); if(!stock) return window.showAlert("無此持股資料");
        currentStock = stock;
        if(window.appState) { window.appState.currentDetailSymbol = symbol; window.appState.currentDetailMarket = market; }
        const fmt = (n) => n.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1}); const isGain = stock.gain >= 0;
        const mktTag = document.getElementById('detail-market-tag'); mktTag.innerText = market;
        if(market === 'TW') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-blue-950 text-blue-300 border border-blue-800"; else if(market === 'US') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-yellow-950 text-yellow-300 border border-yellow-800"; else if(market === 'JP') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-red-950 text-red-300 border border-red-800"; 
        document.getElementById('detail-symbol').innerText = symbol; document.getElementById('detail-name').innerText = stock.name || symbol; document.getElementById('detail-sector').innerText = stock.sector || "其他"; document.getElementById('debug-symbol').innerText = symbol;
        document.getElementById('detail-report-date').innerText = stock.reportDate || "--";
        const roiEl = document.getElementById('detail-roi'); roiEl.innerText = (isGain ? "+" : "") + stock.gainPct + "%"; roiEl.className = `text-2xl font-bold tracking-tighter leading-none ${isGain ? 'text-[#EF4444]' : 'text-[#22C55E]'}`;
        const prefix = market === 'US' ? '$ ' : (market === 'JP' ? '¥ ' : '$ ');
        document.getElementById('detail-qty').innerText = fmt(stock.qty); document.getElementById('detail-cost').innerText = fmt(stock.cost); const costOrg = stock.cost * stock.qty; document.getElementById('detail-exp-return-grid').innerText = (stock.expReturn !== "" && stock.expReturn != null) ? stock.expReturn + "%" : "--"; document.getElementById('detail-cost-twd-primary').innerText = prefix + fmt(Math.round(costOrg)); const costTWD = stock.marketValue - stock.gain; document.getElementById('detail-cost-twd-secondary').innerText = "NT$ " + fmt(Math.round(costTWD)); const mktOrg = stock.price * stock.qty; document.getElementById('detail-market-primary').innerText = prefix + fmt(Math.round(mktOrg)); document.getElementById('detail-market-secondary').innerText = "NT$ " + fmt(stock.marketValue); const gainOrg = stock.gainOrg || ((stock.price - stock.cost) * stock.qty); document.getElementById('detail-gain-primary').innerText = (gainOrg >= 0 ? "+" : "") + fmt(Math.round(gainOrg)); document.getElementById('detail-gain-primary').className = `text-val-md ${gainOrg >= 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`; document.getElementById('detail-gain-secondary').innerText = (isGain ? "+NT$ " : "NT$ ") + fmt(Math.round(stock.gain)); document.getElementById('detail-gain-secondary').className = `text-[13px] font-bold font-mono mt-1.5 ${isGain ? 'text-[#EF4444]' : 'text-[#22C55E]'}`;
        
        const elDetailCurrentPrice = document.getElementById('detail-current-price'); if (elDetailCurrentPrice) elDetailCurrentPrice.innerText = fmt(Number(stock.price) || 0);
        const elCurrentPriceTitle = document.getElementById('label-current-price-title');
        if (elCurrentPriceTitle) { elCurrentPriceTitle.innerText = `現價${market === 'JP' ? '¥' : '$'}`; }
        
        const elDetailEps = document.getElementById('detail-eps'); if (elDetailEps) elDetailEps.innerText = stock.eps ? stock.eps : 'N/A';
        const babanRadio = document.querySelector('input[name="val_method"][value="baban"]'); if(babanRadio) { babanRadio.checked = true; const peArea = document.getElementById('pe-settings-area'); if(peArea) peArea.style.display = 'none'; }
        
        renderValuationBar();
        renderEpsTables(stock);

        const editBtn = document.getElementById('btn-header-edit'); if(editBtn) editBtn.onclick = (e) => { e.stopPropagation(); window.txService.openTransactionModal(market, symbol); };
        document.getElementById('report-frame').srcdoc = ""; document.getElementById('report-content').classList.add('hidden'); document.getElementById('report-loading').classList.add('hidden'); 
        const detailsBlock = document.querySelector('#detail-modal details');
        if (detailsBlock) detailsBlock.removeAttribute('open'); // 強制收合折疊區塊
        prefetchBasicInfo(market, symbol); // 觸發背景預先載入基本資料        
        // 確保函數的最後一行維持開啟彈窗：
        document.getElementById('detail-modal').classList.add('open');

    }
    function closeStockDetail(fromPop = false) { document.getElementById('detail-modal').classList.remove('open'); document.getElementById('report-frame').srcdoc = ""; if(fromPop !== true && typeof history.back === 'function') history.back(); }

    function toggleFilterMenu() { document.getElementById('filter-menu').classList.toggle('hidden'); document.getElementById('filter-overlay').classList.toggle('hidden'); }
    function setMarketFilter(m) { currentFilter=m; document.getElementById('current-filter-label').innerText={'ALL':'全部市場','TW':'台股','US':'美股','JP':'日股'}[m]||m; toggleFilterMenu(); filterStocks(); }
    function toggleSortMenu() { document.getElementById('sort-menu').classList.toggle('hidden'); document.getElementById('sort-overlay').classList.toggle('hidden'); }
    function setSortField(f) { currentSort.field=f; document.getElementById('current-sort-field-label').innerText={'gain':'損益','weight':'佔比','expReturn':'預期報酬','symbol':'股號'}[f]||f; toggleSortMenu(); filterStocks(); }
    function toggleSortOrder() { currentSort.order=currentSort.order==='desc'?'asc':'desc'; document.getElementById('sort-arrow-icon').innerText=currentSort.order==='desc'?'arrow_downward':'arrow_upward'; filterStocks(); }

    function initValuationEvents() {
        const savedCheap = localStorage.getItem('pe_cheap_mult') || 12; const savedPricey = localStorage.getItem('pe_pricey_mult') || 30;
        const cheapInput = document.getElementById('pe-cheap-input'); const priceyInput = document.getElementById('pe-pricey-input');
        if(cheapInput) cheapInput.value = savedCheap; if(priceyInput) priceyInput.value = savedPricey;
        document.querySelectorAll('input[name="val_method"]').forEach(radio => { radio.addEventListener('change', (e) => { const peArea = document.getElementById('pe-settings-area'); if(peArea) peArea.style.display = (e.target.value === 'pe') ? 'flex' : 'none'; renderValuationBar(); }); });
        if(cheapInput) cheapInput.addEventListener('input', (e) => { localStorage.setItem('pe_cheap_mult', e.target.value); renderValuationBar(); });
        if(priceyInput) priceyInput.addEventListener('input', (e) => { localStorage.setItem('pe_pricey_mult', e.target.value); renderValuationBar(); });
    }
    
    function renderValuationBar() {
        if (!currentStock) return; const stock = currentStock; const price = Number(stock.price) || 0; const method = document.querySelector('input[name="val_method"]:checked')?.value || 'baban';
        let cheap = 0, pricey = 0;
        
        if (method === 'baban') { 
            cheap = Number(stock.cheap) || 0; pricey = Number(stock.pricey) || 0; 
        } else { 
            const eps = Number(stock.eps); const cheapMult = Number(document.getElementById('pe-cheap-input')?.value || 12); const priceyMult = Number(document.getElementById('pe-pricey-input')?.value || 30); 
            if (isNaN(eps) || eps <= 0) { document.getElementById('label-cheap-val').innerText = `無EPS`; document.getElementById('label-pricey-val').innerText = `無EPS`; resetBars(); return; } 
            cheap = eps * cheapMult; pricey = eps * priceyMult; 
        }
        
        document.getElementById('label-cheap-val').innerText = cheap.toFixed(1); 
        document.getElementById('label-pricey-val').innerText = pricey.toFixed(1);
        if (cheap === 0 && pricey === 0) { resetBars(); return; }
        
        const mid = (cheap + pricey) / 2; resetBars();
        if (price < cheap) { document.getElementById('bar-1').className = 'flex-1 bg-green-500 transition-all duration-300 shadow-[0_0_8px_rgba(34,197,94,0.7)]'; } 
        else if (price < mid) { document.getElementById('bar-2').className = 'flex-1 bg-[#84cc16] transition-all duration-300 shadow-[0_0_8px_rgba(132,204,22,0.7)]'; } 
        else if (price < pricey) { document.getElementById('bar-3').className = 'flex-1 bg-orange-400 transition-all duration-300 shadow-[0_0_8px_rgba(251,146,60,0.7)]'; } 
        else { document.getElementById('bar-4').className = 'flex-1 bg-red-500 transition-all duration-300 shadow-[0_0_8px_rgba(239,68,68,0.7)]'; }
    }

    function resetBars() { for(let i=1; i<=4; i++) { const el = document.getElementById(`bar-${i}`); if(el) el.className = 'flex-1 bg-gray-800 transition-all duration-300'; } }
    
    function editStockName() {
        const symbol = window.appState.currentDetailSymbol, market = window.appState.currentDetailMarket;
        const nameEl = document.getElementById('detail-name'); if (nameEl.querySelector('input')) return; 
        const currentName = nameEl.innerText;
        nameEl.innerHTML = `<div class="flex items-center gap-2"><input type="text" id="inline-name-input" value="${currentName}" class="bg-[#1A1A1A] border border-[#D4AF37] rounded px-2 py-0.5 text-[18px] text-white w-28 focus:outline-none shadow-inner"><button onclick="window.portfolioService.saveInlineName('${currentName}')" class="text-green-500 hover:text-green-400 p-1 bg-[#2A2A2A] rounded border border-green-900/50"><span class="material-icons text-sm">check</span></button><button onclick="window.portfolioService.cancelInlineName('${currentName}')" class="text-red-500 hover:text-red-400 p-1 bg-[#2A2A2A] rounded border border-red-900/50"><span class="material-icons text-sm">close</span></button></div>`;
    }
    function cancelInlineName(oldName) { document.getElementById('detail-name').innerText = oldName; }
    async function saveInlineName(oldName) { 
        const newName = document.getElementById('inline-name-input').value.trim(); const nameEl = document.getElementById('detail-name'); 
        if (!newName || newName === oldName) { nameEl.innerText = oldName; return; } 
        if (!window.appState.userScriptUrl) { window.showAlert("請先設定 URL"); nameEl.innerText = oldName; return; } 
        nameEl.innerHTML = `<span class="text-sm text-gray-400 animate-pulse font-mono tracking-widest">Saving...</span>`; 
        try { const res = await fetch(window.appState.userScriptUrl, { method: 'POST', body: JSON.stringify({ action: 'edit_name', data: { market: window.appState.currentDetailMarket, symbol: window.appState.currentDetailSymbol, newName: newName } }) }); const json = await res.json(); if(json.success) { nameEl.innerText = newName; if(window.syncSheetData) window.syncSheetData(); } else { throw new Error(json.message); } } catch(e) { window.showAlert("更新失敗: " + e.message); nameEl.innerText = oldName; } 
    }

    return { setPortfolioData, getPortfolioData, updateHomeChart, renderChart, filterStocks, toggleFilterMenu, setMarketFilter, toggleSortMenu, setSortField, toggleSortOrder, openStockDetail, closeStockDetail, editStockName, cancelInlineName, saveInlineName, initValuationEvents, renderValuationBar, resetBars, toggleEpsView, toggleMoreQuarters };
})();

setTimeout(() => { if(window.portfolioService.initValuationEvents) window.portfolioService.initValuationEvents(); }, 1000);