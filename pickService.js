/**
 * [VER] v1.0.0 [2026-02-22]
 * [DESC] 撿股(收藏)頁面專用邏輯模組：包含新增寫入共用資料庫、篩選、排序與單行卡片渲染
 */

window.pickService = (function() {
    // 內部狀態
    let favoritesData = []; // 暫存從資料庫抓下來的收藏清單
    let currentFilter = 'ALL';
    let currentSort = { field: 'symbol', order: 'asc' };

    // --- 渲染收藏清單 (極簡單行卡片) ---
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

            // 單行卡片設計：[市場] 股號 名稱 (靠左) | 現價 Exp. X% (靠右)
            html += `
            <div class="app-card py-3 px-3 flex justify-between items-center shadow-sm border border-[#333] hover:border-gold transition-colors">
                <div class="flex items-center gap-2 overflow-hidden w-[55%]">
                    <span class="text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase min-w-[26px] text-center flex-shrink-0 ${badgeClass}">${item.market}</span>
                    <span class="text-[15px] font-bold text-white font-mono tracking-wide flex-shrink-0">${item.symbol}</span>
                    <span class="text-[13px] text-gray-400 truncate">${item.name || '--'}</span>
                </div>
                <div class="flex items-center gap-3 w-[45%] justify-end flex-shrink-0">
                    <span class="text-[14px] font-bold text-gray-100 font-mono">${item.price ? item.price : '--'}</span>
                    <span class="text-[12px] font-bold text-[#D4AF37] font-mono whitespace-nowrap bg-[#D4AF37]/10 px-1.5 py-0.5 rounded">Exp. ${item.expReturn ? item.expReturn : '--'}%</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    // --- 篩選與排序邏輯 ---
    function applyFilterAndSort() {
        let filtered = favoritesData.filter(i => currentFilter === 'ALL' || i.market === currentFilter);
        
        filtered.sort((a, b) => {
            if (currentSort.field === 'symbol') {
                return currentSort.order === 'desc' 
                    ? -String(a.symbol).localeCompare(String(b.symbol), undefined, {numeric: true}) 
                    : String(a.symbol).localeCompare(String(b.symbol), undefined, {numeric: true});
            } else if (currentSort.field === 'expReturn') {
                let vA = Number(a.expReturn) || 0;
                let vB = Number(b.expReturn) || 0;
                return currentSort.order === 'desc' ? vB - vA : vA - vB;
            }
        });
        renderList(filtered);
    }

    // --- 介面操作：選單切換 ---
    function toggleFilter() {
        document.getElementById('pick-filter-menu').classList.toggle('hidden');
        document.getElementById('pick-filter-overlay').classList.toggle('hidden');
    }
    
    function setMarketFilter(market) {
        currentFilter = market;
        const labels = { 'ALL': '全部', 'TW': '台股', 'US': '美股', 'JP': '日股' };
        document.getElementById('pick-filter-label').innerText = labels[market] || market;
        toggleFilter();
        applyFilterAndSort();
    }

    function toggleSort() {
        document.getElementById('pick-sort-menu').classList.toggle('hidden');
        document.getElementById('pick-sort-overlay').classList.toggle('hidden');
    }

    function setSortField(field) {
        currentSort.field = field;
        const labels = { 'symbol': '股號', 'expReturn': '預期報酬' };
        document.getElementById('pick-sort-label').innerText = labels[field] || field;
        toggleSort();
        applyFilterAndSort();
    }

    function toggleSortOrder() {
        currentSort.order = currentSort.order === 'desc' ? 'asc' : 'desc';
        document.getElementById('pick-sort-arrow').innerText = currentSort.order === 'desc' ? 'arrow_downward' : 'arrow_upward';
        applyFilterAndSort();
    }

    // --- 呼叫後端：新增收藏 ---
    async function addFavorite() {
        const market = document.getElementById('pick-market').value;
        const symbolInput = document.getElementById('pick-symbol');
        const symbol = symbolInput.value.trim().toUpperCase();

        if (!symbol) return window.showAlert("請輸入股號");
        
        // 使用首頁設定的 GAS API URL
        const scriptUrl = window.appState ? window.appState.userScriptUrl : "";
        if (!scriptUrl) return window.showAlert("請先於設定中綁定 API 網址");

        window.showAlert("正在寫入共用資料庫...", "處理中"); // 簡易 loading 提示

        try {
            const res = await fetch(scriptUrl, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'add_favorite',
                    data: { market: market, symbol: symbol }
                })
            });
            const json = await res.json();

            if (json.success) {
                window.closeSystemModal();
                symbolInput.value = ""; // 清空輸入框
                window.showAlert(`已成功將 ${market} ${symbol} 加入共用收藏庫！\n(資料讀取功能建置中)`);
                // TODO: 未來這裡會呼叫 loadFavorites() 重新抓取 C~H 欄的資料
            } else {
                throw new Error(json.message);
            }
        } catch (e) {
            window.closeSystemModal();
            window.showAlert("寫入失敗：" + e.message);
        }
    }

    // 暴露對外方法
    return {
        addFavorite,
        toggleFilter, setMarketFilter,
        toggleSort, setSortField, toggleSortOrder
    };
})();