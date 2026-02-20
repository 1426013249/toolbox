/**
 * ToolBox 打赏系统 - 共享组件 (donate.js)
 * 
 * 功能：
 * 1. 自动在 Footer 注入打赏按钮
 * 2. 注入赞赏弹窗 HTML（含环境检测）
 * 3. 提供 showThankYouCard() 供下载完成后调用
 * 4. GA4 事件追踪
 * 
 * 使用方式：
 * 在工具页 <head> 中引入 donate.css，在 </body> 前引入 donate.js 即可。
 * 下载完成后调用 window.ToolBoxDonate.showThankYou() 触发感谢卡片。
 */
(function () {
    'use strict';

    // ---- 环境检测 ----
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

    // ---- 二维码图片路径自动计算 ----
    function getAssetPath() {
        const scripts = document.querySelectorAll('script[src*="donate.js"]');
        if (scripts.length > 0) {
            const src = scripts[scripts.length - 1].src;
            const dir = src.substring(0, src.lastIndexOf('/'));
            return dir + '/../assets/wechat-donate.png';
        }
        // fallback: 查找 style.css 的路径
        const links = document.querySelectorAll('link[href*="style.css"]');
        if (links.length > 0) {
            const href = links[links.length - 1].getAttribute('href');
            const dir = href.substring(0, href.lastIndexOf('/'));
            return dir + '/../assets/wechat-donate.png';
        }
        return '../../shared/../assets/wechat-donate.png';
    }

    const qrPath = getAssetPath();

    // ---- GA4 事件追踪 ----
    function trackEvent(eventName, params) {
        if (typeof gtag === 'function') {
            gtag('event', eventName, params || {});
        }
    }

    // ---- 注入赞赏弹窗 HTML ----
    function injectDonateModal() {
        if (document.getElementById('donate-overlay')) return; // 已存在则跳过

        const overlay = document.createElement('div');
        overlay.className = 'donate-overlay';
        overlay.id = 'donate-overlay';
        overlay.onclick = function (e) {
            if (e.target === this) closeDonateModal();
        };

        const paymentHTML = isWeChat
            ? `<img class="donate-qr" src="${qrPath}" alt="微信赞赏码">
               <p class="donate-hint">长按识别二维码赞赏 · 金额随意</p>`
            : `<img class="donate-qr" src="${qrPath}" alt="微信赞赏码">
               <p class="donate-hint">截图保存 → 打开微信扫一扫</p>`;

        overlay.innerHTML = `
            <div class="donate-modal">
                <button class="donate-close" onclick="ToolBoxDonate.close()" aria-label="关闭">✕</button>
                <h3>🛠️ 支持 ToolBox 持续运营</h3>
                <p>ToolBox 坚持<strong>免费、无广告、不收集数据</strong>。<br>
                   你的支持是我持续更新的动力 ☕</p>
                ${paymentHTML}
            </div>`;

        document.body.appendChild(overlay);
    }

    // ---- 注入 Footer 打赏按钮 ----
    function injectFooterDonate() {
        const footer = document.querySelector('.site-footer');
        if (!footer) return;

        // 检查是否已有打赏按钮（首页可能已有）
        if (footer.querySelector('[data-donate-btn]')) return;

        const donateLink = document.createElement('p');
        donateLink.style.marginTop = '0.5rem';
        donateLink.innerHTML = `
            <a href="javascript:void(0)" data-donate-btn
               onclick="ToolBoxDonate.open()"
               style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 1.1rem;
                      background:rgba(99,102,241,0.12);border-radius:100px;color:#a5b4fc;
                      font-size:0.82rem;font-weight:600;text-decoration:none;
                      transition:all 0.2s;cursor:pointer;border:1px solid rgba(99,102,241,0.2)">
                ☕ 支持 ToolBox
            </a>`;

        footer.appendChild(donateLink);
    }

    // ---- 感谢卡片（下载完成后触发） ----
    function showThankYouCard() {
        // 追踪工具使用完成事件
        trackEvent('tool_use_complete', {
            tool_name: document.title.split('—')[0]?.trim() || 'unknown',
            page_path: location.pathname
        });

        // 避免重复显示
        if (document.getElementById('toolbox-thank-card')) return;

        const card = document.createElement('div');
        card.id = 'toolbox-thank-card';
        card.className = 'thank-you-card';
        card.innerHTML = `
            <div class="thank-card-inner">
                <span class="thank-card-icon">🎉</span>
                <div class="thank-card-text">
                    <strong>处理完成！</strong>
                    <span>觉得好用？</span>
                </div>
                <button class="thank-card-btn" onclick="ToolBoxDonate.open()">
                    ☕ 请我喝杯咖啡
                </button>
                <button class="thank-card-dismiss" onclick="this.closest('.thank-you-card').remove()" aria-label="关闭">
                    以后再说
                </button>
            </div>`;

        // 找合适位置插入：工具操作区下方
        const toolArea = document.querySelector('.tool-area') || document.querySelector('.main-content');
        if (toolArea) {
            toolArea.parentNode.insertBefore(card, toolArea.nextSibling);
        } else {
            document.body.appendChild(card);
        }

        // 动画触发
        requestAnimationFrame(() => card.classList.add('show'));
    }

    // ---- 弹窗控制 ----
    function openDonateModal() {
        injectDonateModal();
        const overlay = document.getElementById('donate-overlay');
        if (overlay) {
            overlay.classList.add('show');
            trackEvent('click_donate_button', {
                trigger_source: 'manual',
                page_path: location.pathname
            });
        }
    }

    function closeDonateModal() {
        const overlay = document.getElementById('donate-overlay');
        if (overlay) overlay.classList.remove('show');
    }

    // ---- 复制支付宝账号 ----
    function copyAlipay() {
        const account = 'toolbox@example.com'; // TODO: 替换为真实支付宝账号
        navigator.clipboard.writeText(account).then(() => {
            const btn = document.querySelector('.donate-copy-alipay');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = '✅ 已复制';
                btn.style.background = 'rgba(16, 185, 129, 0.2)';
                btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                setTimeout(() => {
                    btn.textContent = orig;
                    btn.style.background = '';
                    btn.style.borderColor = '';
                }, 2000);
            }
            trackEvent('copy_alipay_account', { page_path: location.pathname });
        }).catch(() => {
            // fallback for older browsers
            prompt('请复制以下支付宝账号：', account);
        });
    }

    // ---- 初始化 ----
    function init() {
        injectFooterDonate();
        // 不立即注入弹窗 HTML，等用户点击时再注入（延迟加载）
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ---- 暴露公共 API ----
    window.ToolBoxDonate = {
        open: openDonateModal,
        close: closeDonateModal,
        showThankYou: showThankYouCard,
        copyAlipay: copyAlipay
    };
})();
