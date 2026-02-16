/*
  [VER] v1.3
  [DESC] 說明書資料模組 (Help Data Module)
         1. 匯入 gas_code.js 顯示 App Script
         2. 完整保留原本文字說明內容
*/

// 原有：文字說明內容 (v1.0)
const TEXT_CONTENT = `
    <section>
        <h4 class="text-gold font-bold text-xl mb-4 border-b border-[#333] pb-2">1. 快速開始 (Quick Start)</h4>
        <ul class="list-disc pl-5 space-y-3 text-gray-300 leading-relaxed">
            <li>
                <strong class="text-white">步驟一：連結資料庫</strong><br>
                初次使用請點擊 App 右上角的「齒輪」設定頁，貼上您的 Google Apps Script 網頁應用程式網址 (Exec URL)。
            </li>
            <li>
                <strong class="text-white">步驟二：同步資料</strong><br>
                點擊設定頁中的「SAVE」按鈕，系統會自動儲存網址並開始同步您的投資組合。若需手動更新數據，可隨時再次點擊該按鈕。
            </li>
        </ul>
    </section>

    <section>
        <h4 class="text-gold font-bold text-xl mb-4 border-b border-[#333] pb-2">2. 試算表結構 (Sheet Structure)</h4>
        <p class="text-gray-300 mb-3">請確保您的 Google Sheet 包含以下 5 個分頁 (名稱必須完全一致，大小寫敏感)：</p>
        
        <div class="space-y-4">
            <div class="bg-[#1A1A1A] p-4 rounded-lg border border-[#333]">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-black font-bold bg-gold px-2 py-0.5 rounded text-xs">Funds</span>
                    <span class="text-sm text-gray-500">現金與匯率設定</span>
                </div>
                <div class="text-sm text-gray-400 pl-1">
                    欄位順序：<code>Account</code>, <code>Currency</code>, <code>Rate</code>, <code>Position</code>
                </div>
            </div>

            <div class="bg-[#1A1A1A] p-4 rounded-lg border border-[#333]">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-white font-bold bg-blue-900 px-2 py-0.5 rounded text-xs">TW</span>
                    <span class="text-white font-bold bg-yellow-900 px-2 py-0.5 rounded text-xs">US</span>
                    <span class="text-white font-bold bg-red-900 px-2 py-0.5 rounded text-xs">JP</span>
                    <span class="text-sm text-gray-500">各國庫存分頁</span>
                </div>
                <div class="text-sm text-gray-400 pl-1 leading-loose">
                    欄位順序：<br>
                    <code>Symbol</code> (股號), <code>Name</code> (名稱), <code>Sector</code> (產業), 
                    <code>Expected Return</code> (預期報酬), <code>Pricey</code> (貴價), 
                    <code>Cheap</code> (淑價), <code>Price</code> (現價), <code>Cost</code> (成本), 
                    <code>Qty</code> (股數)
                </div>
            </div>

            <div class="bg-[#1A1A1A] p-4 rounded-lg border border-[#333]">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-white font-bold bg-gray-700 px-2 py-0.5 rounded text-xs">History</span>
                    <span class="text-sm text-gray-500">交易歷史紀錄</span>
                </div>
                <div class="text-sm text-gray-400 pl-1">
                    此分頁由系統自動維護，建議保留標題列即可，無需手動輸入內容。
                </div>
            </div>
        </div>
    </section>

    <section>
        <h4 class="text-gold font-bold text-xl mb-4 border-b border-[#333] pb-2">3. 交易功能 (Transaction)</h4>
        <ul class="list-disc pl-5 space-y-3 text-gray-300 leading-relaxed">
            <li>
                <strong class="text-white">新增持股：</strong><br>
                點擊底部導航欄的 (+) 按鈕，或在個股詳情頁點擊 "Transaction"。
            </li>
            <li>
                <strong class="text-white">智慧填入：</strong><br>
                輸入已知股號時，系統會自動帶出股票名稱；若為新標的則顯示 NEW。
            </li>
            <li>
                <strong class="text-white">防呆機制：</strong><br>
                賣出時若輸入股數大於庫存股數，系統會阻擋交易並彈出紅色警示。
            </li>
        </ul>
    </section>

    <section>
        <h4 class="text-gold font-bold text-xl mb-4 border-b border-[#333] pb-2">4. 常見問題 (FAQ)</h4>
        <ul class="list-disc pl-5 space-y-3 text-gray-300 leading-relaxed">
            <li>
                <strong class="text-white">Q: 為什麼找不到分析報告？</strong><br>
                A: 請確認 Google Drive 資料夾權限已設為「知道連結者皆可檢視」，且檔名包含該股號 (例如: <code>2330.html</code>)。
            </li>
            <li>
                <strong class="text-white">Q: 數據沒有更新？</strong><br>
                A: 本 App 顯示的是 Google Sheet 內的數據。請確認您的 Google Sheet 公式 (如 <code>=GOOGLEFINANCE</code>) 是否運作正常。
            </li>
        </ul>
    </section>
`;

import { GAS_SCRIPT_DATA } from './gas_code.js';

// 新增：後端代碼區塊
const GAS_SECTION = `
<section class="bg-[#1A1A1A] p-4 rounded-xl border border-[#333] shadow-lg mb-8">
    <div class="flex justify-between items-end mb-3">
        <div>
            <h4 class="text-gold font-bold text-lg leading-none mb-1">系統後端代碼</h4>
            <span class="text-[11px] text-gray-500 font-mono">Google Apps Script (v21)</span>
        </div>
        <button onclick="window.copyGasCode()" id="btn-copy-gas" class="bg-gold hover:bg-[#FFE082] text-black text-xs font-bold px-4 py-1.5 rounded transition shadow-lg flex items-center gap-1 active:scale-95 focus:outline-none">
            <span class="material-icons text-sm">content_copy</span>
            <span id="btn-copy-text">複製代碼</span>
        </button>
    </div>
    
    <div class="relative group">
        <!-- h-48 約為 12rem (192px)，約可顯示 10-12 行 -->
        <textarea id="gas-code-area" readonly class="w-full bg-[#0A0A0A] text-gray-400 text-[11px] font-mono p-3 rounded border border-[#333] h-48 resize-none focus:outline-none focus:border-gold/50 transition-colors selection:bg-gold selection:text-black leading-relaxed hide-scrollbar" spellcheck="false">${GAS_SCRIPT_DATA}</textarea>
        
        <!-- Hover Hint -->
        <div class="absolute bottom-2 right-4 text-[10px] text-gray-600 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            唯讀預覽 (Read Only)
        </div>
    </div>
</section>
`;

export const HELP_CONTENT = `
<div id="help-body" class="space-y-8 max-w-2xl mx-auto">
    ${GAS_SECTION}
    ${TEXT_CONTENT}
</div>
`;
