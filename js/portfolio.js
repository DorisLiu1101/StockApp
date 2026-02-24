/**
 * [VER] v5.2.1 [2026-02-23]
 * [DESC] 
 * 1. 優化庫存詳情溫度計標籤，導入智慧邊緣對齊與不換行設定，修復文字跑位問題。
 * 2. 修正庫存詳情預期報酬率預設值，無資料時顯示 -- 而非 0%，避免誤導。
 */
window.portfolioService = (function() {
    let allPortfolioData = [];
    let currentFilter = 'ALL', currentChartFilter = 'ALL', currentSort = { field: 'gain', order: 'desc' };

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
        const colors=['#D4AF37','#B4941F','#756010','#4B5563','#1F2937']; let grad="conic-gradient(", curr=0, leg="";
        if (vals.length === 0) { document.getElementById('portfolio-chart').style.background = '#222'; document.getElementById('sector-legend').innerHTML = '<div class="text-xs text-gray-600">無數據</div>'; document.getElementById('chart-center-text').innerText = "0%"; return; }
        vals.forEach((v,i)=>{ const c=colors[i]||colors[colors.length-1]; grad+=`${c} ${curr}% ${curr+v}%, `; curr+=v; leg+=`<div class="flex items-center justify-between text-xs mb-1"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:${c}"></div><span class="text-gray-400 truncate w-24">${labels[i]}</span></div><span class="text-gray-400 font-mono">${v}%</span></div>`; });
        document.getElementById('portfolio-chart').style.background=grad.slice(0,-2)+")"; document.getElementById('sector-legend').innerHTML=leg; document.getElementById('chart-center-text').innerText = vals.reduce((a,b)=>a+b,0) + "%";
    }

    function filterStocks() {
        const q = document.getElementById('stock-search').value.toLowerCase();
        let f = allPortfolioData.filter(i => { const m = (currentFilter === 'ALL') || (i.market === currentFilter); return m && (String(i.symbol).toLowerCase().includes(q) || String(i.name||'').toLowerCase().includes(q)); });
        f.sort((a, b) => {
            if (currentSort.field === 'symbol') return currentSort.order === 'desc' ? -String(a.symbol).localeCompare(String(b.symbol),undefined,{numeric:true}) : String(a.symbol).localeCompare(String(b.symbol),undefined,{numeric:true});
            let vA=0, vB=0; if(currentSort.field==='expReturn') {vA=Number(a.expReturn)||0; vB=Number(b.expReturn)||0;} else if(currentSort.field==='gain') {vA=a.gain; vB=b.gain;} else if(currentSort.field==='weight') {vA=a.marketValue; vB=b.marketValue;} return currentSort.order==='desc'?vB-vA:vA-vB;
        });
        renderStockList(f);
    }

    function renderStockList(list) {
        const c = document.getElementById('stock-list-container');
        if(!list.length) { c.innerHTML="<p class='text-center text-gray-600 text-sm py-16 uppercase tracking-widest'>No Positions Found</p>"; return; }
        let html = "";
        list.forEach(item => {
            const isGain = item.gain >= 0; const fmt = (n) => n.toLocaleString(); const gainAmt = (isGain ? "+" : "") + fmt(Math.round(item.gain));
            let badgeClass = item.market === 'TW' ? "bg-blue-950 text-blue-300 border-blue-800" : (item.market === 'US' ? "bg-yellow-950 text-yellow-300 border-yellow-800" : "bg-red-950 text-red-300 border-red-800");
            html += `<div onclick="window.portfolioService.openStockDetail('${item.market}', '${item.symbol}')" class="app-card py-[5px] px-[10px] flex flex-col justify-center cursor-pointer hover:bg-[#1A1A1A] transition-all my-[10px] mx-[5px] active:scale-[0.98] shadow-md h-full"><div class="flex justify-between items-center mb-1"><div class="flex items-center gap-2 min-w-0 flex-1 mr-2 overflow-hidden"><span class="text-xs px-1.5 py-0.5 rounded border font-bold uppercase min-w-[30px] text-center flex-shrink-0 ${badgeClass}">${item.market}</span><span class="text-[20px] font-bold text-white font-mono tracking-wide flex-shrink-0">${item.symbol}</span><span class="text-[18px] text-gray-400 font-light truncate">${item.name || ''}</span></div><div class="text-[18px] font-bold text-gray-100 font-mono tracking-tight flex-shrink-0">${fmt(item.price)}</div></div><div class="flex justify-between items-center"><div class="text-[18px] text-gray-500 font-mono">${fmt(item.qty)} sh</div><div class="text-[18px] font-bold ${isGain?'text-[#E57373]':'text-[#4DB6AC]'} font-mono">${(isGain?'+':'')}${item.gainPct}% <span class="text-[18px] opacity-80 ml-1">(${gainAmt})</span></div></div></div>`;
        });
        c.innerHTML = html;
    }

    function openStockDetail(market, symbol) {
        if(window.pushModalState) window.pushModalState('detail');
        const stock = allPortfolioData.find(s => s.market === market && s.symbol === symbol); if(!stock) return window.showAlert("無此持股資料");
        if(window.appState) { window.appState.currentDetailSymbol = symbol; window.appState.currentDetailMarket = market; }
        const fmt = (n) => n.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1}); const isGain = stock.gain >= 0;
        const mktTag = document.getElementById('detail-market-tag'); mktTag.innerText = market;
        if(market === 'TW') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-blue-950 text-blue-300 border border-blue-800"; else if(market === 'US') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-yellow-950 text-yellow-300 border border-yellow-800"; else if(market === 'JP') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-red-950 text-red-300 border border-red-800"; 
        document.getElementById('detail-symbol').innerText = symbol; document.getElementById('detail-name').innerText = stock.name || symbol; document.getElementById('detail-sector').innerText = stock.sector || "其他"; document.getElementById('debug-symbol').innerText = symbol;
        document.getElementById('detail-report-date').innerText = stock.reportDate || "--";
        const roiEl = document.getElementById('detail-roi'); roiEl.innerText = (isGain ? "+" : "") + stock.gainPct + "%"; roiEl.className = `text-2xl font-bold tracking-tighter leading-none ${isGain ? 'text-[#EF4444]' : 'text-[#22C55E]'}`;
        const prefix = market === 'US' ? '$ ' : (market === 'JP' ? '¥ ' : '$ ');
        document.getElementById('detail-qty').innerText = fmt(stock.qty); document.getElementById('detail-cost').innerText = fmt(stock.cost); const costOrg = stock.cost * stock.qty; document.getElementById('detail-exp-return-grid').innerText = (stock.expReturn !== "" && stock.expReturn != null) ? stock.expReturn + "%" : "--"; document.getElementById('detail-cost-twd-primary').innerText = prefix + fmt(Math.round(costOrg)); const costTWD = stock.marketValue - stock.gain; document.getElementById('detail-cost-twd-secondary').innerText = "NT$ " + fmt(Math.round(costTWD)); const mktOrg = stock.price * stock.qty; document.getElementById('detail-market-primary').innerText = prefix + fmt(Math.round(mktOrg)); document.getElementById('detail-market-secondary').innerText = "NT$ " + fmt(stock.marketValue); const gainOrg = stock.gainOrg || ((stock.price - stock.cost) * stock.qty); document.getElementById('detail-gain-primary').innerText = (gainOrg >= 0 ? "+" : "") + fmt(Math.round(gainOrg)); document.getElementById('detail-gain-primary').className = `text-val-md ${gainOrg >= 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`; document.getElementById('detail-gain-secondary').innerText = (isGain ? "+NT$ " : "NT$ ") + fmt(Math.round(stock.gain)); document.getElementById('detail-gain-secondary').className = `text-[13px] font-bold font-mono mt-1.5 ${isGain ? 'text-[#EF4444]' : 'text-[#22C55E]'}`;
        const price = Number(stock.price) || 0; const cheap = Number(stock.cheap) || 0; const pricey = Number(stock.pricey) || 0; const thermSection = document.getElementById('thermometer-section');
        if (cheap > 0 && pricey > 0) {
            thermSection.classList.remove('hidden'); document.getElementById('val-cheap').innerText = fmt(cheap); document.getElementById('val-pricey').innerText = fmt(pricey); let pct = 0; let badgeText = "現價"; let badgeColor = "bg-[#D4AF37] text-black"; if (price <= cheap) { pct = 0; badgeText = "低於淑價"; badgeColor = "bg-green-600 text-white"; } else if (price >= pricey) { pct = 100; badgeText = "高於貴價"; badgeColor = "bg-red-600 text-white"; } else { pct = ((price - cheap) / (pricey - cheap)) * 100; pct = Math.max(0, Math.min(100, pct)); } document.getElementById('therm-indicator-line').style.left = pct + "%"; document.getElementById('detail-price-text').style.left = pct + "%"; document.getElementById('detail-price-text').innerText = fmt(price); const label = document.getElementById('therm-current-label'); label.style.left = pct + "%"; label.innerText = badgeText; 
            
            // 智慧邊緣對齊邏輯
            let alignClass = "-translate-x-1/2"; // 預位置中
            if (pct <= 5) alignClass = "translate-x-0"; // 靠左邊界
            else if (pct >= 95) alignClass = "-translate-x-full"; // 靠右邊界
            
            label.className = `absolute text-[11px] font-black px-2 py-0.5 rounded shadow-lg z-20 transform ${alignClass} top-0 whitespace-nowrap ${badgeColor}`;
        } else { thermSection.classList.add('hidden'); }
        const editBtn = document.getElementById('btn-header-edit'); if(editBtn) editBtn.onclick = (e) => { e.stopPropagation(); window.txService.openTransactionModal(market, symbol); };
        document.getElementById('report-frame').srcdoc = ""; document.getElementById('report-content').classList.add('hidden'); document.getElementById('report-loading').classList.add('hidden'); document.getElementById('detail-modal').classList.add('open');
    }
    function closeStockDetail(fromPop = false) { document.getElementById('detail-modal').classList.remove('open'); document.getElementById('report-frame').srcdoc = ""; if(fromPop !== true && typeof history.back === 'function') history.back(); }

    function toggleFilterMenu() { document.getElementById('filter-menu').classList.toggle('hidden'); document.getElementById('filter-overlay').classList.toggle('hidden'); }
    function setMarketFilter(m) { currentFilter=m; document.getElementById('current-filter-label').innerText={'ALL':'全部市場','TW':'台股','US':'美股','JP':'日股'}[m]||m; toggleFilterMenu(); filterStocks(); }
    function toggleSortMenu() { document.getElementById('sort-menu').classList.toggle('hidden'); document.getElementById('sort-overlay').classList.toggle('hidden'); }
    function setSortField(f) { currentSort.field=f; document.getElementById('current-sort-field-label').innerText={'gain':'損益','weight':'佔比','expReturn':'預期報酬','symbol':'股號'}[f]||f; toggleSortMenu(); filterStocks(); }
    function toggleSortOrder() { currentSort.order=currentSort.order==='desc'?'asc':'desc'; document.getElementById('sort-arrow-icon').innerText=currentSort.order==='desc'?'arrow_downward':'arrow_upward'; filterStocks(); }

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

    return { setPortfolioData, getPortfolioData, updateHomeChart, renderChart, filterStocks, toggleFilterMenu, setMarketFilter, toggleSortMenu, setSortField, toggleSortOrder, openStockDetail, closeStockDetail, editStockName, cancelInlineName, saveInlineName };
})();