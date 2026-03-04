1. Giai đoạn Phát hiện (Detection)

Khi khách hàng gửi tin nhắn đến Zalo OA, hệ thống thực hiện các bước:

Bot xử lý: Tin nhắn được gửi đến AI api để lấy câu trả lời. Cấu trúc json trả về có dạng:
{
  "answer": "Tôi rất tiếc vì bạn đang bực mình. Tôi sẽ chuyển yêu cầu của bạn đến nhân viên hỗ trợ ngay lập tức.",
  "needhelp": "Yes"
}

Phân loại: Nếu AI trả về kết quả có needhelp: "Yes", hệ thống kích hoạt chế độ Chờ hỗ trợ.

Trạng thái hệ thống:

Tắt auto_reply đối với conversation_id này.

Đánh dấu hội thoại trên dashboard với tag là bot-failed.

2. Giai đoạn Thông báo & Tiếp nhận (Dispatching)

Hệ thống kết nối nhân viên thông qua Zalo cá nhân:

Gửi Notification: Hệ thống quét danh sách nhân viên đang ở trạng thái Available (không bận hỗ trợ khách khác).

Cấu trúc tin nhắn Zalo: Gửi đến Zalo cá nhân nhân viên một tin nhắn tương tác:

    🔔 KHÁCH HÀNG CẦN HỖ TRỢ

    Khách hàng: Nguyễn Văn A

    Nội dung: "Tôi muốn khiếu nại về đơn hàng..."

    Nền tảng: Zalo OA

    [Nút: Tiếp nhận hỗ trợ]

Xử lý Tranh chấp (Concurrency):

Khi Nhân viên A nhấn "Tiếp nhận hỗ trợ", hệ thống ngay lập tức gửi cập nhật (callback) đến Zalo của các nhân viên khác: "Yêu cầu này đã được Nhân viên A tiếp nhận" .

Trên Website, đoạn chat sẽ được cập nhật đang hỗ trợ với tài khoản của nhân viên đã tiếp nhận hỗ trợ và khóa đoạn chat đối với tất cả tài khoản nhân viên khác.

3. Giai đoạn Hỗ trợ Real-time (Active Support)

Đây là lúc luồng tin nhắn được bắc cầu (Bridge) qua hệ thống:

Hệ thống gửi ngay 1 tin nhắn Text tổng hợp lịch sử từ 10 đến 20 tin nhắn gần nhất dạng ví dụ: [Khách]: "Chào shop, đơn hàng #123 của mình sao chưa thấy giao?" [Bot]: "Chào bạn, để mình kiểm tra trạng thái đơn hàng giúp bạn nhé..." [Khách]: "Giao chậm quá, mình bực mình rồi đấy!" [Bot]: "Tôi rất tiếc vì bạn đang bực mình. Tôi sẽ chuyển yêu cầu của bạn đến nhân viên hỗ trợ ngay lập tức." và 1 thông báo "Đã kết nối"

Với tin nhắn là hình ảnh, hệ thống sẽ tải về server trung gian, sau đó gửi lại cho nhân viên dưới dạng media_id của Zalo cá nhân để họ có thể xem trực tiếp trong khung chat Zalo.

Luồng tin nhắn (Forwarding):

Nhân viên -> Khách: Nhân viên nhắn tin vào hội thoại với OA trên Zalo cá nhân -> Hệ thống nhận Webhook -> Forward tin nhắn đó đến Khách hàng dưới danh nghĩa OA.

Khách -> Nhân viên: Khách nhắn cho OA -> Hệ thống Forward trực tiếp đến Zalo cá nhân của Nhân viên đang tiếp nhận.

Đồng bộ Website: Mọi tin nhắn qua lại giữa Nhân viên và Khách phải được cập nhật Real-time lên giao diện Web quản trị thông qua WebSocket để các nhân viên khác (đang bị lock) vẫn có thể theo dõi (Read-only).

Để nhân viên xử lý ngay tại khung chat Zalo cá nhân mà hệ thống vẫn biết đó là gửi cho khách nào, chúng ta cần cơ chế Session Binding:

Gán phiên (Binding): Khi nhân viên A nhấn "Hỗ trợ" khách B, Server sẽ lưu vào Cache (Redis): Staff_Zalo_ID_A <-> Customer_Zalo_ID_B.

Forwarding:

Bất kỳ tin nhắn nào nhân viên A gửi vào OA sau đó sẽ được Server chặn lại qua Webhook.

Server kiểm tra Cache: "À, ông A đang hỗ trợ ông B".

Server dùng API OA gửi đúng tin nhắn đó tới ông B.

4. Giai đoạn Kết thúc (Handover)

Chuyển giao quyền điều khiển lại cho AI:

Lệnh kết thúc:
 * Cách 1: Nhân viên gõ lệnh /chatbot trong khung chat Zalo.

 * Cách 2: Nhân viên nhấn nút "Kết thúc và chuyển cho chatbot" trong menu nhanh của OA (Rich Menu thiết lập riêng cho Staff).

Hệ thống xử lý:

Bật lại auto_reply: true cho cuộc hội thoại.

Giải phóng trạng thái "Bận" của nhân viên để họ có thể nhận thông báo từ khách hàng mới.

5. Các điểm lưu ý về Ràng buộc & An toàn

Media Handling: Hệ thống cần xử lý được việc forward Hình ảnh/File (tải về server trung gian trước khi gửi đi) vì Zalo API thường yêu cầu media_id riêng biệt cho từng nền tảng.

Lọc thông báo: Nhân viên đang trong phiên hỗ trợ sẽ không bị làm phiền bởi thông báo "Khách hàng cần hỗ trợ" của các cuộc hội thoại khác
