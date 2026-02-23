/**
 * [VER] v1.0 [2026-02-23]
 * [DESC] 收藏清單與專屬彈窗模組
 */

window.pickService = (function() {
    let favoritesData = []; 
    let currentFilter = 'ALL';
    let currentSort = { field: 'symbol', order: 'asc' };

    function renderList(list) {
        const container = document.getElementById('pick-list-container');
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

            // 點擊事件改為開啟「專屬收藏視窗」
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

    // --- 全新：專屬收藏視窗邏輯 ---
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
        document.getElementById('fav-detail-price').innerText = stock.price ? stock.price : '--';
        document.getElementById('fav-detail-exp').innerText = stock.expReturn ? stock.expReturn + '%' : '--';
        document.getElementById('fav-detail-date').innerText = stock.reportDate || '--';

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

    function removeFavorite() {
        window.showAlert("提示：移除收藏功能正在後端建置中，稍後更新即可使用！", "建構中");
    }

    return {
        addFavorite, toggleFilter, setMarketFilter, toggleSort, setSortField, toggleSortOrder, setFavoritesData,
        openFavoriteDetail, closeFavoriteDetail, removeFavorite
    };
})();