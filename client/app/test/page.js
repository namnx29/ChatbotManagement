'use client';

export default function TestPage() {
    return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', color: 'white' }}>
            <h1>Đây là Website của khách hàng</h1>
            <p>Chat widget sẽ hiện ở góc dưới bên phải...</p>

            {/* 1. Load the SDK first */}
            <script
              src="https://elcom.vn/widget-sdk.js"
              data-chatbot-id="69b194a76667c4ca71dcab38"
              async
              defer
            ></script>
        </div>
    );
}