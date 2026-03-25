/**
 * [VER] v5.0 [2026-02-23]
 * [DESC] 新增交易與彈窗模組
 */
window.txService = (function() {
    let txType = 'buy';

    function setTxType(t) { 
        txType = t; resetTxStatus(); 
        const bB=document.getElementById('btn-tx-buy'), bS=document.getElementById('btn-tx-sell'); 
        if(t==='buy'){ bB.className="tx-btn tx-btn-buy-active flex-1"; bS.className="tx-btn tx-btn-inactive flex-1"; }
        else{ bB.className="tx-btn tx-btn-inactive flex-1"; bS.className="tx-btn tx-btn-sell-active flex-1"; } 
    }
    
    function resetTxStatus() { 
        const sD=document.getElementById('tx-status'), sB=document.getElementById('btn-tx-submit'); 
        if(sD) sD.innerHTML=""; if(sB){ sB.disabled=false; sB.innerText="確認新增"; sB.classList.remove('opacity-50','cursor-not-allowed'); } 
    }
    
    function lookupSymbolName() { 
        const m = document.getElementById('tx-market').value; const s = document.getElementById('tx-symbol').value.trim().toUpperCase(); const nameInput = document.getElementById('tx-name'); 
        if(!s) { nameInput.value = ''; return; } 
        let stock = null;
        if(window.portfolioService) stock = window.portfolioService.getPortfolioData().find(i => String(i.symbol).toUpperCase() === s && (i.market === m)); 
        if(stock) { nameInput.value = stock.name || ""; nameInput.setAttribute('data-auto-filled', 'true'); } else { if (document.activeElement !== nameInput) { if (!nameInput.value || nameInput.getAttribute('data-auto-filled') === 'true') { nameInput.value = ''; nameInput.removeAttribute('data-auto-filled'); } } } 
    }
    
    function openTransactionModal(m, s) { 
        if(window.pushModalState) window.pushModalState('tx'); 
        const mS=document.getElementById('tx-market'), sI=document.getElementById('tx-symbol'); 
        
        // 🌟 判斷是否為同一檔股票，若不是才清空資料 (保留未送出資料的記憶功能)
        const isSameStock = (mS.value === (m || 'TW')) && (sI.value === (s || ''));
        
        mS.value=m||'TW'; sI.value=s||''; 
        resetTxStatus(); 
        
        // 只有切換股票或全新開啟時，才清空價格與股數表單
        if(!isSameStock || !s) {
            document.getElementById('tx-name').value = ''; 
            document.getElementById('tx-price').value=''; 
            document.getElementById('tx-qty').value=''; 
            setTxType('buy'); 
            if(s) lookupSymbolName(); 
        }
        
        mS.disabled=!!s; sI.readOnly=!!s; 
        if(s) sI.classList.add('opacity-60','cursor-not-allowed'); else sI.classList.remove('opacity-60','cursor-not-allowed'); 
        
        document.getElementById('transaction-modal').classList.add('open'); 
    }
    
    function closeTransactionModal(fromPop = false) { 
        document.getElementById('transaction-modal').classList.remove('open'); 
        if(fromPop !== true && typeof history.back === 'function') history.back(); 
    }

    async function saveTransaction() {
        const m = document.getElementById('tx-market').value; const s = document.getElementById('tx-symbol').value; const name = document.getElementById('tx-name').value; const p = document.getElementById('tx-price').value; const q = document.getElementById('tx-qty').value;
        if (!s || !p || !q) return window.showAlert("請填寫完整");
        let qty = Number(q); if (txType === 'sell') qty = -qty;
        
        if (txType === 'sell' && window.portfolioService) { 
            const stock = window.portfolioService.getPortfolioData().find(i => String(i.symbol).toUpperCase() === s.toUpperCase() && i.market === m); 
            if (stock && Math.abs(qty) > stock.qty) return window.showAlert(`賣出量大於庫存 (${stock.qty})`); 
        }
        
        const sB = document.getElementById('btn-tx-submit'); const sD = document.getElementById('tx-status');
        sB.disabled = true; sB.innerText = "同步中...";
        try {
            const res = await fetch(window.appState.API_URL, { method: 'POST', body: JSON.stringify({ action: 'add', data: { market: m, symbol: s, price: Number(p), qty: qty, name: name } }) });
            const json = await res.json();
            if (json.success) { 
                sD.innerHTML = '<span class="text-green-500">新增完成 ✅</span>'; 
                // 🌟 送出成功後清空記憶資料
                document.getElementById('tx-price').value=''; 
                document.getElementById('tx-qty').value=''; 
                if(window.syncSheetData) await window.syncSheetData(); 
                sB.disabled = false; sB.innerText = "確認新增"; 
            } else { throw new Error(json.message); }
        } catch (e) { window.showAlert("錯誤：" + e.message); sB.disabled = false; sB.innerText = "確認新增"; }
    }

    return { setTxType, resetTxStatus, lookupSymbolName, openTransactionModal, closeTransactionModal, saveTransaction };
})();