/**
 * [VER] v1.1 [2026-03-22]
 * [DESC] 完整修復版：整合 SPA 動態路由、多管理員白名單、與中央 GAS API 引擎
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let firebaseConfig = { apiKey: "AIzaSyCG3akQbcQvm1khoNyJ0S5xmwNftruo2D8", authDomain: "investment-dashboard-741c3.firebaseapp.com", projectId: "investment-dashboard-741c3", storageBucket: "investment-dashboard-741c3.firebasestorage.app", messagingSenderId: "542046198044", appId: "1:542046198044:web:e3949cae05a0c8a14cc2d9" };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let db, auth, currentUser;

// 全域狀態與中央 API 網址
window.appState = { 
    API_URL: "https://script.google.com/macros/s/AKfycbxVmt4TZ8WuKRrkNd1YjXXG6ErnsRU61hjbbfAoWg0z1E98s0F1pBO_NXUR9Nf_gqGW/exec", 
    currentDetailSymbol: "", 
    currentDetailMarket: "", 
    cachedSummary: null 
};

const REPORT_FOLDER_URL = "https://drive.google.com/drive/folders/1GdtSyWHYhwZ8JnugPGzgBhIRwXKScIZR";

// 歷史狀態與返回鍵保護機制
window.pushModalState = function(modalName) { history.pushState({ modal: modalName }, ''); };
window.addEventListener('popstate', (e) => {
    if (document.getElementById('system-modal') && !document.getElementById('system-modal').classList.contains('hidden')) { window.closeSystemModal(true); }
    else if (document.getElementById('settings-modal') && document.getElementById('settings-modal').classList.contains('open')) { window.closeSettings(true); }
    else if (document.getElementById('transaction-modal') && document.getElementById('transaction-modal').classList.contains('open')) { window.txService.closeTransactionModal(true); }
    else if (document.getElementById('detail-modal') && document.getElementById('detail-modal').classList.contains('open')) { window.portfolioService.closeStockDetail(true); }
    else if (document.getElementById('favorite-detail-modal') && document.getElementById('favorite-detail-modal').classList.contains('open')) { window.pickService.closeFavoriteDetail(true); }
    else { const targetPage = (e.state && e.state.page) ? e.state.page : 'home'; window.switchPage(targetPage); }
});

// 中央 API 雲端資料同步引擎 (背景執行)
window.syncSheetData = async function() {
    if (!auth || !currentUser || !currentUser.email) return;
    try { 
        const res = await fetch(window.appState.API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'get_portfolio', email: currentUser.email }) 
        }); 
        const data = await res.json(); 
        if(data.success) {
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'portfolio', 'summary'), data, {merge:true}); 
        }
    } catch(e) { console.error("背景同步失敗:", e.message); }
};

// 中央 API 雲端資料同步引擎 (手動點擊)
window.manualSync = async function() {
    if (!auth || !currentUser || !currentUser.email) return window.showAlert("無法取得使用者信箱，請重新登入。");
    const icon = document.getElementById('sync-icon'), text = document.getElementById('sync-text');
    if(icon) icon.classList.add('animate-spin', 'text-gold'); if(text) { text.innerText = "雲端資料融合中..."; text.classList.add('text-gold'); }
    try { 
        const res = await fetch(window.appState.API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'get_portfolio', email: currentUser.email }) 
        }); 
        const data = await res.json(); 
        
        if(!data.success) throw new Error(data.message);
        
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'portfolio', 'summary'), data, {merge:true}); 
        if(window.toggleUserMenu) window.toggleUserMenu(); 
        window.showAlert("✅ 成功從中央資料庫合併並載入最新行情與庫存！", "同步完成");
    } catch(e) { 
        window.showAlert("同步失敗: " + e.message); 
    } finally {
        if(icon) icon.classList.remove('animate-spin', 'text-gold'); if(text) { text.innerText = "立即同步"; text.classList.remove('text-gold'); }
    }
};

// Firebase 即時資料監聽
function startDataListener(uid) {
    onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'portfolio', 'summary'), (snap) => {
        if(snap.exists()) {
            const d=snap.data();
            window.appState.cachedSummary = d; 
            window.updateHomeUI();
            if(d.portfolio && window.portfolioService){ window.portfolioService.setPortfolioData(d.portfolio); }
            if(d.favorites && window.pickService){ window.pickService.setFavoritesData(d.favorites); }
        }
    });
}

// 總覽畫面更新
window.updateHomeUI = function() {
    const d = window.appState.cachedSummary;
    if(!d) return;
    const fmt=(n)=>n.toLocaleString();
    const ta = document.getElementById('total-asset'); if(ta) ta.innerText=fmt(d.totalAsset||0);
    const dp = document.getElementById('daily-profit'); if(dp) dp.innerText=(d.dailyProfit>=0?"+":"")+fmt(d.dailyProfit||0);
    const tr = document.getElementById('total-return'); if(tr) tr.innerText=(d.dailyProfitPct>=0?"+":"")+(d.dailyProfitPct||0)+"%";
    const cl = document.getElementById('cash-level'); if(cl) cl.innerText=(d.cashLevel||0)+"%";
};

// 使用者登入狀態與介面更新 (含管理者白名單機制)
window.updateUserUI = function(user) {
    const btnLogin = document.getElementById('btn-login'), userMenu = document.getElementById('user-menu-container');
    if (user.isAnonymous) { 
        if(btnLogin) btnLogin.classList.remove('hidden'); 
        if(userMenu) userMenu.classList.add('hidden'); 
    } else {
        if(btnLogin) btnLogin.classList.add('hidden'); 
        if(userMenu) userMenu.classList.remove('hidden');
        if(user.photoURL) { const img = document.getElementById('header-avatar-img'); img.src = user.photoURL; img.classList.remove('hidden'); }
        document.getElementById('menu-user-name').innerText = user.displayName || user.email || "User";
        
        // 管理者權限解鎖機制
        const btnAdmin = document.getElementById('btn-admin-panel');
        if (btnAdmin) {
            const adminEmails = ['watting.reg@gmail.com', 'watting@gmail.com'];
            if (adminEmails.includes(user.email)) {
                btnAdmin.classList.remove('hidden');
            } else {
                btnAdmin.classList.add('hidden');
            }
        }
    }
};

// 選單與視窗操作
window.toggleUserMenu = function() { document.getElementById('user-menu-dropdown').classList.toggle('hidden'); document.getElementById('user-menu-overlay').classList.toggle('hidden'); };
window.loadUserSettings = async function(uid) { /* 舊版 URL 抓取機制已作廢，保留空函式防呆 */ };

let _modalResolver = null;
window.showAlert = function(msg, title="系統提示", showDriveBtn=false) { 
    window.pushModalState('alert'); return new Promise((resolve) => { _modalResolver = resolve; document.getElementById('system-modal-title').innerText=title; document.getElementById('system-modal-message').innerText=msg; let actions = '<button onclick="window.closeSystemModal()" class="bg-gold text-black px-6 py-2 rounded text-sm font-bold shadow-lg hover:bg-[#FFE082]">OK</button>'; if(showDriveBtn) { actions = `<a href="${REPORT_FOLDER_URL}" target="_blank" class="bg-[#333] text-white border border-[#555] px-4 py-2 rounded text-sm font-bold mr-2">Open Drive</a>` + actions; } document.getElementById('system-modal-actions').innerHTML=actions; document.getElementById('system-modal').classList.remove('hidden'); });
};
window.closeSystemModal = function(fromPop = false) { document.getElementById('system-modal').classList.add('hidden'); if (_modalResolver) { _modalResolver(); _modalResolver = null; } if(fromPop !== true) history.back(); };
window.openSettings = function() { window.pushModalState('settings'); document.getElementById('settings-modal').classList.add('open'); window.toggleUserMenu(); };
window.closeSettings = function(fromPop = false) { document.getElementById('settings-modal').classList.remove('open'); if(fromPop !== true) history.back(); };
window.saveSettings = async function() { window.showAlert("目前已採用中央 API 架構，不需再手動綁定網址。", "設定停用"); window.closeSettings(); };
window.openHelp = function() { window.showAlert("說明功能建構中"); };
window.loginGoogle = async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){window.showAlert("登入失敗：" + e.message);}};
window.logout = async()=>{try{await signOut(auth); window.showAlert("已登出"); window.location.reload();}catch(e){}};

// 動態路由核心邏輯 (Dynamic Fetch)
window.switchPage = async function(p) { 
    const container = document.getElementById('app-main-container');
    if(!container) return;
    
    container.innerHTML = '<div class="flex flex-col justify-center items-center h-[60vh]"><span class="material-icons animate-spin text-gold text-4xl mb-4">sync</span><span class="text-gray-500 font-mono text-sm tracking-widest">載入畫面中...</span></div>';

    try {
        const res = await fetch(`views/${p}.html`);
        if (!res.ok) throw new Error(`找不到 ${p}.html 檔案`);
        const html = await res.text();
        container.innerHTML = html;

        document.querySelectorAll('.bottom-nav-item').forEach(el=>el.classList.remove('active', 'text-gold'));
        const nav = document.getElementById('nav-'+p);
        if(nav) nav.classList.add('active', 'text-gold');

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (p === 'home') { window.updateHomeUI(); if(window.portfolioService) window.portfolioService.updateHomeChart('ALL'); }
        if (p === 'list' && window.portfolioService) window.portfolioService.filterStocks();
        if (p === 'pick' && window.pickService && window.pickService.forceRender) window.pickService.forceRender();

    } catch(e) {
        container.innerHTML = `<div class="flex justify-center items-center h-[60vh] text-red-500 font-bold tracking-widest"><span class="material-icons mr-2">error_outline</span> ${e.message}</div>`;
    }
};

// 處理底部導覽列跳轉
window.navToPage = function(p) {
    let currentPage = (history.state && history.state.page) ? history.state.page : 'home';
    if (p === currentPage) return; 

    if (p === 'home') { history.pushState({ page: 'home' }, ''); } 
    else { 
        if (currentPage === 'home') history.pushState({ page: p }, ''); 
        else history.replaceState({ page: p }, ''); 
    }
    window.switchPage(p);
};

history.replaceState({ page: 'home' }, '');

// 初始化與登入判定
async function initApp() {
    try {
        const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        auth = getAuth(app); db = getFirestore(app);
        try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}
        onAuthStateChanged(auth, async (user) => { 
            if(user) { 
                currentUser = user; 
                window.updateUserUI(user); 
                startDataListener(user.uid); 
                window.switchPage('home'); 
            } else { 
                await signInAnonymously(auth); 
            } 
        });
    } catch (err) { console.error("Init Error", err); }
}
initApp();