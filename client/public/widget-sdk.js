(function () {
    if (window.ChatWidget) return;

    const scriptTag = document.currentScript || document.querySelector('script[src*="widget-sdk.js"]');

    const config = {
        chatbotId: scriptTag?.getAttribute('data-chatbot-id'),
        baseUrl: scriptTag?.src ? new URL(scriptTag.src).origin : window.location.origin
    };

    const CHAT_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5C21 16.1944 16.9706 20 12 20C10.5181 20 9.12457 19.6616 7.91039 19.0635L3 21L4.5 16.5C3.56152 15.1119 3 13.3857 3 11.5C3 6.80558 7.02944 3 12 3C16.9706 3 21 6.80558 21 11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12C8 12 9 14 12 14C15 14 16 12 16 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

    function createIframe(src) {
        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.style.cssText = "position:fixed;right:24px;bottom:24px;width:360px;height:450px;border:none;box-shadow:0 12px 48px rgba(0,0,0,0.15);border-radius:16px;z-index:999999;display:none;transition:all 0.3s ease;";
        iframe.setAttribute('aria-hidden', 'true');
        return iframe;
    }

    function createFab() {
        const btn = document.createElement('button');
        btn.innerHTML = CHAT_ICON;
        btn.style.cssText = "position:fixed;right:24px;bottom:24px;width:60px;height:60px;border-radius:30px;background:#6c3fb5;color:white;border:none;box-shadow:0 6px 18px rgba(0,0,0,0.2);z-index:1000000;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s ease;";
        return btn;
    }

    function init(opts) {
        const chatbotId = opts.chatbotId || config.chatbotId;
        const baseUrl = opts.baseUrl || config.baseUrl;

        if (!chatbotId) return console.warn('ChatWidget: Missing chatbotId');

        const iframeSrc = `${baseUrl.replace(/\/$/, '')}/widget/lead-form?chatbotId=${encodeURIComponent(chatbotId)}`;
        const iframe = createIframe(iframeSrc);
        const fab = createFab();

        document.body.appendChild(iframe);
        document.body.appendChild(fab);

        const toggleWidget = (isOpen) => {
            iframe.style.display = isOpen ? 'block' : 'none';
            fab.style.display = isOpen ? 'none' : 'flex';
            iframe.setAttribute('aria-hidden', !isOpen);
        };

        fab.addEventListener('click', () => toggleWidget(true));

        window.addEventListener('message', (ev) => {
            if (!ev.data) return;
            if (ev.data.type === 'CHAT_WIDGET_CLOSE') toggleWidget(false);
            if (ev.data.type === 'CHAT_WIDGET_EXPAND') {
                iframe.style.width = '800px'; iframe.style.height = '600px';
            }
            if (ev.data.type === 'CHAT_WIDGET_MINIMIZE') {
                iframe.style.width = '360px'; iframe.style.height = '450px';
            }
        });

        return { open: () => toggleWidget(true), close: () => toggleWidget(false) };
    }

    window.ChatWidget = { init };

    if (config.chatbotId) {
        if (document.readyState === 'complete') {
            init({});
        } else {
            window.addEventListener('load', () => init({}));
        }
    }
})();