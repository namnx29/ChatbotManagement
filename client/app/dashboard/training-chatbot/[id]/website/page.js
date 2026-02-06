'use client';

import { Card, Typography, Space } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

const { Title, Text, Paragraph } = Typography;

export default function EmbedPage() {
    const pathname = usePathname();

    const chatbotId = useMemo(() => {
        const m = pathname.match(/training-chatbot\/([^\/]+)/);
        return m ? m[1] : '';
    }, [pathname]);

    const embedCode = useMemo(
        () => `<script
  src="http://103.7.40.236:3002/widget-sdk.js"
  data-chatbot-id="${chatbotId}"
  async
  defer
></script>`,
        [chatbotId]
    );

    return (
        <Space orientation="vertical" size={24} style={{ width: '100%', padding: 24 }}>
            <Title level={3}>Tích hợp với website</Title>

            <Text>
                Dán đoạn mã này ngay trước thẻ <Text code>{'</body>'}</Text>
            </Text>

            <Card
                size="small"
                styles={{
                    body: {
                        background: '#0f172a',
                        borderRadius: 8,
                        padding: 16,
                    },
                }}
                title={
                    <Space>
                        <CodeOutlined />
                        <Text>HTML</Text>
                    </Space>
                }
                extra={
                    <Text copyable={{ text: embedCode }}>
                        Copy
                    </Text>
                }
            >
                <Paragraph
                    style={{
                        margin: 0,
                        color: '#e5e7eb',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {embedCode}
                </Paragraph>
            </Card>
        </Space>
    );
}
