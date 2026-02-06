(function () {
    if (window.ChatWidget) return;

    // 1. Icon for the FAB (Matching your image)
    const CHAT_ICON = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 11.5C21 16.1944 16.9706 20 12 20C10.5181 20 9.12457 19.6616 7.91039 19.0635L3 21L4.5 16.5C3.56152 15.1119 3 13.3857 3 11.5C3 6.80558 7.02944 3 12 3C16.9706 3 21 6.80558 21 11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 12C8 12 9 14 12 14C15 14 16 12 16 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

    function createIframe(src) {
        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.style.position = 'fixed';
        iframe.style.right = '24px';
        iframe.style.bottom = '24px'; // Changed: Same as FAB bottom
        iframe.style.width = '360px';
        iframe.style.height = '450px'; // Increased height slightly for better form display
        iframe.style.border = 'none';
        iframe.style.boxShadow = '0 12px 48px rgba(0,0,0,0.15)';
        iframe.style.borderRadius = '16px';
        iframe.style.zIndex = 999999;
        iframe.style.display = 'none';
        iframe.style.transition = 'all 0.3s ease';
        iframe.setAttribute('aria-hidden', 'true');
        return iframe;
    }

    function createFab() {
        const btn = document.createElement('button');
        btn.innerHTML = CHAT_ICON;
        btn.style.position = 'fixed';
        btn.style.right = '24px';
        btn.style.bottom = '24px';
        btn.style.width = '60px';
        btn.style.height = '60px';
        btn.style.borderRadius = '30px';
        btn.style.background = '#6c3fb5'; // Matching your brand purple
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
        btn.style.zIndex = 1000000; // Higher than iframe to stay on top if needed
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.transition = 'transform 0.2s ease';
        return btn;
    }

    function init(opts) {
        opts = opts || {};
        const orgId = opts.organizationId;
        const accountId = opts.accountId;
        const baseUrl = opts.baseUrl || (window.location.origin);

        if (!orgId) return console.warn('ChatWidget: organizationId is required');
        if (!accountId) return console.warn('ChatWidget: accountId is required');

        let iframeSrc = `${baseUrl.replace(/\/$/, '')}/widget/lead-form?organizationId=${encodeURIComponent(orgId)}&accountId=${encodeURIComponent(accountId)}`;

        const iframe = createIframe(iframeSrc);
        const fab = createFab();

        document.body.appendChild(iframe);
        document.body.appendChild(fab);

        // Toggle logic: FAB disappears when Form is open
        function toggleWidget(isOpen) {
            if (isOpen) {
                iframe.style.display = 'block';
                fab.style.display = 'none'; // Hide FAB when form replaces it
                iframe.setAttribute('aria-hidden', 'false');
            } else {
                iframe.style.display = 'none';
                fab.style.display = 'flex'; // Show FAB again
                iframe.setAttribute('aria-hidden', 'true');
            }
        }

        fab.addEventListener('click', () => toggleWidget(true));

        // Listener for messages from the iframe (e.g., clicking a close button inside the form)
        window.addEventListener('message', (ev) => {
            if (ev.data && ev.data.type === 'CHAT_WIDGET_CLOSE') {
                toggleWidget(false);
            }
        }, false);

        // Listener for messages from the iframe
        window.addEventListener('message', (ev) => {
            if (!ev.data) return;

            // 1. Handle Closing
            if (ev.data.type === 'CHAT_WIDGET_CLOSE') {
                toggleWidget(false);
            }

            // 2. Handle Expanding (Maximize)
            if (ev.data.type === 'CHAT_WIDGET_EXPAND') {
                iframe.style.width = '800px';   // Or 100% for full screen
                iframe.style.height = '600px';  // Or 90vh
                iframe.style.bottom = '24px';
                iframe.style.right = '24px';
            }

            // 3. Handle Minimizing (Back to normal size)
            if (ev.data.type === 'CHAT_WIDGET_MINIMIZE') {
                iframe.style.width = '360px';
                iframe.style.height = '450px';
            }
        }, false);

        return {
            open: () => toggleWidget(true),
            close: () => toggleWidget(false)
        };
    }

    window.ChatWidget = { init };
})();