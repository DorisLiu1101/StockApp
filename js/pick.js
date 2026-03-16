/**
 * [VER] v2.0.0 [2026-03-16]
 * [DESC] 配合 SPA 架構，加入列表渲染防呆機制，並導出 forceRender 功能供切換分頁時重繪
 */
window.pickService = (function() {
    let favoritesData = []; 
    let currentFilter = 'ALL';
    let currentSort = { field: 'symbol', order: 'asc' };

    function renderList(list) {
        const container = document.getElementById('pick-list-container');
        // [加入防呆保護]：如果畫面上沒有收藏列表容器 (例如切換到其他分頁了)，就中止執行
        if (!container) return;

        if (!list || list.length === 0) {
            container.innerHTML = "<p class='text-center text-gray-600 text-sm py-10 uppercase tracking-widest'>目前無收藏個股</p>";
            return;
        }

        let html = "";
        list.forEach(item => {
            let badgeClass = "bg-[#333] text-gray-300 border-[#555]";
            if(item.market === 'TW') badgeClass = "bg-blue-950 text-blue-300 border-blue-800";
            else if(item.market === 'US') badgeClass = "bg-yellow-950 text-yellow-300 border-yellow-800";
            else if(item.market === 'JP') badgeClass = "bg-red-950 text-red-300 border-red-800";

            html += `
            <div onclick="window.pickService.openFavoriteDetail('${item.market}', '${item.symbol}')" class="app-card py-[5px] px-[10px] flex justify-between items-center shadow-sm border border-[#333] hover:border-gold cursor-pointer transition-colors my-[10px] mx-[5px] min-h-[50px] active:scale-[0.98]">
                <div class="flex items-center gap-2 overflow-hidden w-[55%]">
                    <span class="text-xs px-1.5 py-0.5 rounded border font-bold uppercase min-w-[30px] text-center flex-shrink-0 ${badgeClass}">${item.market}</span>
                    <span class="text-[20px] font-bold text-white font-mono tracking-wide flex-shrink-0 leading-tight">${item.symbol}</span>
                    <span class="text-[18px] text-gray-400 font-light truncate leading-tight">${item.name || '--'}</span>
                </div>
                <div class="flex items-center gap-3 w-[45%] justify-end flex-shrink-0">
                    <span class="text-[18px] font-bold text-gray-100 font-mono leading-tight">${item.price ? item.price : '--'}</span>
                    <span class="text-[16px] font-bold text-[#D4AF37] font-mono whitespace-nowrap bg-[#D4AF37]/10 px-1.5 py-0.5 rounded leading-tight">Exp. ${item.expReturn ? item.expReturn : '--'}%</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    function applyFilterAndSort() {
        let filtered = favoritesData.filter(i => currentFilter === 'ALL' || i.market === currentFilter);
        filtered.sort((a, b) => {
            if (currentSort.field === 'symbol') {
                return currentSort.order === 'desc' 
                    ? -String(a.symbol).localeCompare(String(b.symbol), undefined, {numeric: true}) 
                    : String(a.symbol).localeCompare(String(b.symbol), undefined, {numeric: true});
            } else if (currentSort.field === 'expReturn') {
                let vA = Number(a.expReturn) || 0; let vB = Number(b.expReturn) || 0;
                return currentSort.order === 'desc' ? vB - vA : vA - vB;
            }
        });
        renderList(filtered);
    }

    function toggleFilter() { document.getElementById('pick-filter-menu').classList.toggle('hidden'); document.getElementById('pick-filter-overlay').classList.toggle('hidden'); }
    function setMarketFilter(market) { currentFilter = market; const labels = { 'ALL': '全部', 'TW': '台股', 'US': '美股', 'JP': '日股' }; document.getElementById('pick-filter-label').innerText = labels[market] || market; toggleFilter(); applyFilterAndSort(); }
    function toggleSort() { document.getElementById('pick-sort-menu').classList.toggle('hidden'); document.getElementById('pick-sort-overlay').classList.toggle('hidden'); }
    function setSortField(field) { currentSort.field = field; const labels = { 'symbol': '股號', 'expReturn': '預期報酬' }; document.getElementById('pick-sort-label').innerText = labels[field] || field; toggleSort(); applyFilterAndSort(); }
    function toggleSortOrder() { currentSort.order = currentSort.order === 'desc' ? 'asc' : 'desc'; document.getElementById('pick-sort-arrow').innerText = currentSort.order === 'desc' ? 'arrow_downward' : 'arrow_upward'; applyFilterAndSort(); }

    async function addFavorite() {
        const market = document.getElementById('pick-market').value; const symbolInput = document.getElementById('pick-symbol'); const symbol = symbolInput.value.trim().toUpperCase();
        if (!symbol) return window.showAlert("請輸入股號");
        const scriptUrl = window.appState ? window.appState.userScriptUrl : "";
        if (!scriptUrl) return window.showAlert("請先於設定中綁定 API 網址");

        window.showAlert("正在寫入共用資料庫...", "處理中");
        try {
            const res = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify({ action: 'add_favorite', data: { market: market, symbol: symbol } }) });
            const json = await res.json();
            if (json.success) { window.closeSystemModal(); symbolInput.value = ""; window.manualSync(); } 
            else throw new Error(json.message);
        } catch (e) { window.closeSystemModal(); window.showAlert("寫入失敗：" + e.message); }
    }

    function setFavoritesData(data) {
        if (data && Array.isArray(data)) { favoritesData = data; applyFilterAndSort(); }
    }

    function openFavoriteDetail(market, symbol) {
        if(window.pushModalState) window.pushModalState('fav-detail');
        const stock = favoritesData.find(s => s.market === market && s.symbol === symbol);
        if(!stock) return window.showAlert("找不到資料");
        
        if(window.appState) { window.appState.currentDetailSymbol = symbol; window.appState.currentDetailMarket = market; }
        
        const mktTag = document.getElementById('fav-detail-market');
        mktTag.innerText = market;
        if(market === 'TW') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-blue-950 text-blue-300 border border-blue-800"; 
        else if(market === 'US') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-yellow-950 text-yellow-300 border border-yellow-800"; 
        else if(market === 'JP') mktTag.className = "text-[13.5px] px-2 py-0.5 rounded font-bold uppercase tracking-tight bg-red-950 text-red-300 border border-red-800";
        
        document.getElementById('fav-detail-symbol').innerText = symbol;
        document.getElementById('fav-detail-name').innerText = stock.name || '--';
        
        const expEl = document.getElementById('fav-detail-exp-top');
        expEl.innerText = stock.expReturn ? stock.expReturn + '%' : '--';
        if (Number(stock.expReturn) >= 0) expEl.className = "text-2xl font-bold tracking-tighter leading-none text-[#EF4444] font-mono";
        else expEl.className = "text-2xl font-bold tracking-tighter leading-none text-[#22C55E] font-mono";

        const price = Number(stock.price) || 0; const cheap = Number(stock.cheap) || 0; const pricey = Number(stock.pricey) || 0;
        const thermSection = document.getElementById('fav-thermometer-section');
        if (cheap > 0 && pricey > 0) {
            thermSection.classList.remove('hidden');
            const fmt = (n) => n.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1});
            document.getElementById('fav-val-cheap').innerText = fmt(cheap);
            document.getElementById('fav-val-pricey').innerText = fmt(pricey);
            let pct = 0; let badgeText = "現價"; let badgeColor = "bg-[#D4AF37] text-black"; 
            if (price <= cheap) { pct = 0; badgeText = "低於淑價"; badgeColor = "bg-green-600 text-white"; } 
            else if (price >= pricey) { pct = 100; badgeText = "高於貴價"; badgeColor = "bg-red-600 text-white"; } 
            else { pct = ((price - cheap) / (pricey - cheap)) * 100; pct = Math.max(0, Math.min(100, pct)); }
            
            document.getElementById('fav-therm-indicator-line').style.left = pct + "%"; 
            document.getElementById('fav-detail-price-text').style.left = pct + "%"; 
            document.getElementById('fav-detail-price-text').innerText = fmt(price); 
            
            const label = document.getElementById('fav-therm-current-label');
            label.style.left = pct + "%"; label.innerText = badgeText;
            
            let alignClass = "-translate-x-1/2"; 
            if (pct <= 5) alignClass = "translate-x-0"; else if (pct >= 95) alignClass = "-translate-x-full";
            label.className = `absolute text-[11px] font-black px-2 py-0.5 rounded shadow-lg z-20 transform ${alignClass} top-0 whitespace-nowrap ${badgeColor}`;
        } else { thermSection.classList.add('hidden'); }

        document.getElementById('fav-report-frame').srcdoc = "";
        document.getElementById('fav-report-content').classList.add('hidden');
        document.getElementById('fav-report-loading').classList.add('hidden');
        document.getElementById('favorite-detail-modal').classList.add('open');
    }

    function closeFavoriteDetail(fromPop = false) {
        const modal = document.getElementById('favorite-detail-modal');
        if(modal) modal.classList.remove('open');
        const frame = document.getElementById('fav-report-frame');
        if(frame) frame.srcdoc = "";
        if(fromPop !== true && typeof history.back === 'function') history.back();
    }

    function editFavoriteName() {
        const nameEl = document.getElementById('fav-detail-name');
        if (nameEl.querySelector('input')) return; 
        const currentName = nameEl.innerText === '--' ? '' : nameEl.innerText;
        nameEl.innerHTML = `<div class="flex items-center gap-2"><input type="text" id="fav-inline-name-input" value="${currentName}" class="bg-[#1A1A1A] border border-[#D4AF37] rounded px-2 py-0.5 text-[18px] text-white w-28 focus:outline-none shadow-inner"><button onclick="window.pickService.saveInlineFavName('${currentName}')" class="text-green-500 hover:text-green-400 p-1 bg-[#2A2A2A] rounded border border-green-900/50"><span class="material-icons text-sm">check</span></button><button onclick="window.pickService.cancelInlineFavName('${currentName}')" class="text-red-500 hover:text-red-400 p-1 bg-[#2A2A2A] rounded border border-red-900/50"><span class="material-icons text-sm">close</span></button></div>`;
    }
    function cancelInlineFavName(oldName) { document.getElementById('fav-detail-name').innerText = oldName || '--'; }
    async function saveInlineFavName(oldName) { 
        const newName = document.getElementById('fav-inline-name-input').value.trim(); const nameEl = document.getElementById('fav-detail-name'); 
        if (!newName || newName === oldName) { nameEl.innerText = oldName || '--'; return; } 
        if (!window.appState.userScriptUrl) { window.showAlert("請先設定 URL"); nameEl.innerText = oldName || '--'; return; } 
        nameEl.innerHTML = `<span class="text-sm text-gray-400 animate-pulse font-mono tracking-widest">Saving...</span>`; 
        try { 
            const res = await fetch(window.appState.userScriptUrl, { method: 'POST', body: JSON.stringify({ action: 'edit_fav_name', data: { market: window.appState.currentDetailMarket, symbol: window.appState.currentDetailSymbol, newName: newName } }) }); 
            const json = await res.json(); 
            if(json.success) { 
                nameEl.innerText = newName; 
                if(window.manualSync) window.manualSync(); 
            } else throw new Error(json.message); 
        } catch(e) { window.showAlert("更新失敗: " + e.message); nameEl.innerText = oldName || '--'; } 
    }

    function removeFavorite() {
        window.showAlert("提示：移除收藏功能正在後端建置中，稍後更新即可使用！", "建構中");
    }

    return {
        addFavorite, toggleFilter, setMarketFilter, toggleSort, setSortField, toggleSortOrder, setFavoritesData,
        openFavoriteDetail, closeFavoriteDetail, removeFavorite, editFavoriteName, cancelInlineFavName, saveInlineFavName,
        forceRender: applyFilterAndSort // [導出渲染接口]：讓主程式可以在切換分頁後強制重繪畫面
    };
})();