/**
 * [VER] v2.1.0 [2026-03-22]
 * [DESC] 導入「聰明自動對時引擎」：結合 Visibility API，實現背景省電與喚醒即刻刷新。
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

let firebaseConfig = { apiKey: "AIzaSyCG3akQbcQvm1khoNyJ0S5xmwNftruo2D8", authDomain: "investment-dashboard-741c3.firebaseapp.com", projectId: "investment-dashboard-741c3", storageBucket: "investment-dashboard-741c3.firebasestorage.app", messagingSenderId: "542046198044", appId: "1:542046198044:web:e3949cae05a0c8a14cc2d9" };
let auth, currentUser;

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
    else if (document.getElementById('transaction-modal') && document.getElementById('transaction-modal').classList.contains('open')) { window.txService.closeTransactionModal(true); }
    else if (document.getElementById('detail-modal') && document.getElementById('detail-modal').classList.contains('open')) { window.portfolioService.closeStockDetail(true); }
    else if (document.getElementById('favorite-detail-modal') && document.getElementById('favorite-detail-modal').classList.contains('open')) { window.pickService.closeFavoriteDetail(true); }
    else { const targetPage = (e.state && e.state.page) ? e.state.page : 'home'; window.switchPage(targetPage); }
});

// 共用的畫面渲染函式
function applyDataToUI(data) {
    window.appState.cachedSummary = data; 
    window.updateHomeUI();
    if(data.portfolio && window.portfolioService) window.portfolioService.setPortfolioData(data.portfolio);
    if(data.favorites && window.pickService) window.pickService.setFavoritesData(data.favorites);
}

// 中央 API 雲端資料同步引擎 (背景自動執行)
window.syncSheetData = async function() {
    if (!auth || !currentUser || !currentUser.email) return;
    try { 
        const res = await fetch(window.appState.API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'get_portfolio', email: currentUser.email }) 
        }); 
        const data = await res.json(); 
        if(data.success) {
            localStorage.setItem('weGoodCache_' + currentUser.email, JSON.stringify(data));
            applyDataToUI(data);
        }
    } catch(e) { console.error("背景同步失敗:", e.message); }
};

// ==========================================
// 🚀 [新增] 聰明自動對時引擎 (Smart Auto-Sync Engine)
// ==========================================
window.autoSyncTimer = null;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 分鐘 (300,000 毫秒)

function startAutoSync() {
    if (!auth || !currentUser || !currentUser.email) return;
    stopAutoSync(); // 避免重複啟動
    window.autoSyncTimer = setInterval(() => {
        console.log("⏳ [引擎] 5分鐘排程觸發，背景更新資料...");
        window.syncSheetData();
    }, SYNC_INTERVAL_MS);
}

function stopAutoSync() {
    if (window.autoSyncTimer) {
        clearInterval(window.autoSyncTimer);
        window.autoSyncTimer = null;
        console.log("💤 [引擎] 計時器已暫停");
    }
}

// 監聽手機/電腦螢幕的「可見度變化」
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        // 使用者把畫面切回來了！立刻拉取最新資料，並重新啟動計時器
        console.log("👀 [引擎] 偵測到畫面喚醒，立刻對時！");
        if (auth && currentUser) {
            window.syncSheetData();
            startAutoSync();
        }
    } else {
        // 使用者切換到別的 App 或縮小網頁，暫停計時器省電
        console.log("🙈 [引擎] 偵測到畫面隱藏，暫停背景消耗");
        stopAutoSync();
    }
});
// ==========================================


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
        
        localStorage.setItem('weGoodCache_' + currentUser.email, JSON.stringify(data));
        applyDataToUI(data);

        if(window.toggleUserMenu) window.toggleUserMenu(); 
        window.showAlert("✅ 成功從中央資料庫合併並載入最新行情與庫存！", "同步完成");
    } catch(e) { 
        window.showAlert("同步失敗: " + e.message); 
    } finally {
        if(icon) icon.classList.remove('animate-spin', 'text-gold'); if(text) { text.innerText = "立即同步"; text.classList.remove('text-gold'); }
    }
};

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

// 使用者登入狀態與介面更新
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

window.toggleUserMenu = function() { document.getElementById('user-menu-dropdown').classList.toggle('hidden'); document.getElementById('user-menu-overlay').classList.toggle('hidden'); };
window.loadUserSettings = async function(uid) {};

let _modalResolver = null;
window.showAlert = function(msg, title="系統提示", showDriveBtn=false) { 
    window.pushModalState('alert'); return new Promise((resolve) => { _modalResolver = resolve; document.getElementById('system-modal-title').innerText=title; document.getElementById('system-modal-message').innerText=msg; let actions = '<button onclick="window.closeSystemModal()" class="bg-gold text-black px-6 py-2 rounded text-sm font-bold shadow-lg hover:bg-[#FFE082]">OK</button>'; if(showDriveBtn) { actions = `<a href="${REPORT_FOLDER_URL}" target="_blank" class="bg-[#333] text-white border border-[#555] px-4 py-2 rounded text-sm font-bold mr-2">Open Drive</a>` + actions; } document.getElementById('system-modal-actions').innerHTML=actions; document.getElementById('system-modal').classList.remove('hidden'); });
};
window.closeSystemModal = function(fromPop = false) { document.getElementById('system-modal').classList.add('hidden'); if (_modalResolver) { _modalResolver(); _modalResolver = null; } if(fromPop !== true) history.back(); };
window.openHelp = function() { window.showAlert("說明功能建構中"); };
window.loginGoogle = async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){window.showAlert("登入失敗：" + e.message);}};
// 登出時順便關閉自動對時引擎
window.logout = async()=>{try{stopAutoSync(); await signOut(auth); window.showAlert("已登出"); window.location.reload();}catch(e){}};

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
        auth = getAuth(app); 
        
        try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}
        onAuthStateChanged(auth, async (user) => { 
            if(user) { 
                currentUser = user; 
                window.appState.userEmail = user.email; // 🌟 關鍵：將信箱鑰匙交給全域變數
                window.updateUserUI(user); 
                
                const cachedData = localStorage.getItem('weGoodCache_' + user.email);
                if (cachedData) {
                    try { applyDataToUI(JSON.parse(cachedData)); } catch(e){}
                }

                window.switchPage('home'); 
                
                // [啟動] 登入後拉取資料，並開啟自動對時引擎
                window.syncSheetData();
                startAutoSync();
                
            } else { 
                await signInAnonymously(auth); 
            } 
        });
    } catch (err) { console.error("Init Error", err); }
}
initApp();