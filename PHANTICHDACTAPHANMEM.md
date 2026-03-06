# 1. Giới thiệu

## 1.1 Mục đích tài liệu  
Tài liệu này mô tả chi tiết **Yêu cầu phần mềm (Software Requirements Specification - SRS)** của hệ thống “Hệ thống Chat hỗ trợ đa kênh” được triển khai trong repository `test-preny`. Mục tiêu là cung cấp cái nhìn toàn bộ về chức năng, kiến trúc, API, dữ liệu, luồng xử lý, và các ràng buộc phi chức năng của hệ thống.

## 1.2 Phạm vi hệ thống  
Hệ thống là một nền tảng quản lý hội thoại đa kênh (Zalo, Facebook, Widget Website) dùng cho đội ngũ hỗ trợ khách hàng. Hệ thống hỗ trợ:

- Quản lý người dùng (admin + staff)
- Kết nối tích hợp với Zalo OA, Facebook Page, và widget website
- Lưu trữ và hiển thị hội thoại, tin nhắn
- Hệ thống auto-reply (AI hỗ trợ trả lời tự động)
- Luồng “gom chuyển” (handover) khi cần hỗ trợ nhân viên
- Cơ chế khóa/ mở khóa hội thoại và phân quyền tổ chức
- Truyền sự kiện thời gian thực bằng WebSocket (Socket.IO)

## 1.3 Định nghĩa và thuật ngữ  
- **Admin**: Người quản trị (tạo tài khoản, cấu hình hệ thống, quản lý nhân viên).  
- **Staff**: Nhân viên hỗ trợ, làm việc trong tổ chức của một admin.  
- **Organization**: Nhóm gồm admin + staff; dữ liệu được cô lập theo tổ chức (organizationId).  
- **Account**: Đại diện người dùng (accountId).  
- **Conversation**: Mối hội thoại giữa khách hàng (customer) và hệ thống/hỗ trợ.  
- **Message**: Tin nhắn gửi/nhận trong conversation.  
- **Integration**: Kết nối với kênh (Zalo, Facebook, …) bao gồm token/refresh.  
- **WebSocket (Socket.IO)**: Kênh realtime để cập nhật UI (tin nhắn mới, đổi trạng thái, khóa).  
- **Bot Auto-Reply**: Tự động phản hồi bằng API “microtunchat” (external chat API).  
- **Lock/Unlock (conversation lock)**: Cơ chế giữ quyền xử lý trên 1 conversation.  
- **Organization Isolation (Account Isolation)**: Dữ liệu được phân chia theo `organizationId` thay vì chỉ `accountId`, để hỗ trợ nhiều user (staff) trong cùng tổ chức dùng chung dữ liệu.

## 1.4 Tổng quan hệ thống  
Hệ thống gồm hai phần chính:
- **Backend (Flask/Python)**: Cung cấp REST API, xử lý webhook, quản lý dữ liệu MongoDB, Socket.IO realtime, jobs định kỳ (token refresh, lock expiration).
- **Frontend (Next.js/React)**: Giao diện admin/dashboard để quản lý chat, cấu hình, và quản trị.

---

# 2. Tổng quan hệ thống

## 2.1 Mô tả hệ thống  
Hệ thống cho phép doanh nghiệp (admin) kết nối tài khoản Zalo OA, Facebook Page (và widget website) vào một nền tảng chat chung. Nhân viên (staff) có thể:
- Xem hội thoại đa kênh
- Trả lời tin nhắn
- Khóa mở hội thoại để tránh xung đột hỗ trợ
- Kích hoạt/deactivate các kết nối kênh
- Nhận thông báo realtime khi có tin nhắn mới, hội thoại bị mở khóa/khóa, hay cấu hình thay đổi

Hệ thống lưu trữ dữ liệu trong MongoDB và sử dụng Redis để hỗ trợ cơ chế “phiên làm việc” (binding), queue hỗ trợ (pending queue), PKCE OAuth code verifier.

## 2.2 Kiến trúc tổng thể  
- **Frontend** (Next.js, React, Ant Design): quản lý UI, gọi API backend, duy trì state phiên, kết nối Socket.IO.
- **Backend** (Flask + Socket.IO + APScheduler): xử lý REST API, webhook, lưu trữ dữ liệu MongoDB, realtime với Socket.IO, job định kỳ.
- **Database**: MongoDB (collections: users, conversations, messages, integrations, chatbots, customers, training_data).
- **Cache/Session**: Redis (dùng cho PKCE state, khóa hỗ trợ, queue, token refresh dữ liệu tạm).
- **Third Party**: Zalo API, Facebook Graph API, external AI chat API (microtunchat) dùng cho auto-reply.

## 2.3 Các thành phần chính  
- **Authentication & Authorization**
- **User & Staff Management**
- **Chatbot Management**
- **Integration Management (Zalo/Facebook/Widget)**
- **Conversation & Message Storage**
- **Realtime Socket.IO Layer**
- **Auto-reply (AI) Engine**
- **Locking & Handover Workflow**
- **Scheduler Jobs** (token refresh, lock expiration)
- **Widget Lead Capture API**

## 2.4 Sơ đồ kiến trúc (mô tả bằng text)
1. **Client (browser)** ↔ **REST API / Socket.IO** ↔ **Flask server**
2. **Flask server** ↔ **MongoDB** (dữ liệu chính)
3. **Flask server** ↔ **Redis** (PKCE, session, pending queue, binding)
4. **Flask server** ↔ **Zalo / Facebook API** (OAuth + webhook + gửi tin nhắn)
5. **Flask server** ↔ **External AI Chat API** (reply tự động)

---

# 3. Stakeholders và User Roles

## 3.1 Danh sách các loại người dùng  
- **Admin**: Người quản trị chính, có quyền tạo tài khoản, cấu hình bot, thêm tích hợp, tạo/ quản lý nhân viên, truy cập toàn bộ dữ liệu trong tổ chức.
- **Staff**: Người hỗ trợ khách hàng, làm việc trong tổ chức của admin, có quyền truy cập hội thoại tổ chức, nhận tin nhắn và trả lời.
- **Customer**: Khách hàng cuối tương tác qua Zalo/Facebook/Widget; không trực tiếp sử dụng hệ thống nhưng là đối tượng của hội thoại.
- **System (Bot Service)**: Thành phần nội bộ tự động trả lời (AI) và quản lý luồng “handover”.

## 3.2 Quyền và trách nhiệm của từng role

### Admin
- Đăng ký/Đăng nhập, xác thực email, reset mật khẩu.
- Tạo staff user + quản lý staff (kích hoạt, khóa, xóa, thay đổi mật khẩu, xem mật khẩu).
- Thiết lập tích hợp Zalo/Facebook, bật/tắt kênh.
- Quản lý chatbot (tạo, sửa, xóa).
- Xem, xử lý tất cả hội thoại trong tổ chức.
- Kiểm soát bot reply (bật/tắt), khóa hội thoại, điều phối nhân viên.
- Giám sát thống kê thông tin (số tin nhắn, bot replies).

### Staff
- Đăng nhập/đăng xuất.
- Xem danh sách hội thoại trong tổ chức.
- Mở thao tác (lock) hội thoại, trả lời tin nhắn.
- Yêu cầu quyền truy cập (request access) cho hội thoại đang được khóa.
- Chấp nhận/ từ chối yêu cầu truy cập.
- Nhận thông báo realtime qua Socket.IO.
- (Đối với Zalo) thực hiện “hợp nhất session” (session binding) để trả lời tin nhắn qua tài khoản Zalo cá nhân.

### Customer
- Gửi tin nhắn qua mạng xã hội (Zalo/Facebook) hoặc widget web.
- Nhận trả lời tự động (bot) hoặc phản hồi từ nhân viên.

### System / Bot
- Tự động trả lời (AI), kích hoạt khi bot_reply = true.
- Quản lý queue pending support (cho staff).
- Refresh token (Zalo/Facebook) định kỳ.
- Xử lý webhook từ nguồn bên ngoài.

---

# 4. Danh sách chức năng hệ thống (Functional Requirements)

Mỗi chức năng có mã (FR-XX) để tham chiếu.
  
## FR-01: User Authentication  
### Mô tả  
Hỗ trợ đăng ký, đăng nhập, xác thực email, reset mật khẩu và logout.

### Actor  
- Admin, Staff

### Input  
- Email, mật khẩu, mã xác thực, token reset

### Output  
- Phiên đăng nhập, session cookie, thông tin user

### Quy trình xử lý  
1. **Đăng ký**: `POST /api/register` (email, password, fullName, phone).
2. Tạo user record, gửi email xác thực (EmailService).
3. **Xác thực email**: `GET /api/verify-email?token=...`
4. **Đăng nhập**: `POST /api/login` (email/username + password).
5. **Logout**: `POST /api/logout` (Flask-Login session destroy).
6. **Quên/mật khẩu**: `POST /api/forgot-password` -> gửi email reset.
7. **Reset mật khẩu**: `POST /api/reset-password`.

### Điều kiện trước  
- Email hợp lệ, mật khẩu đủ độ dài, token hợp lệ.

### Điều kiện sau  
- Tạo session, cập nhật cờ `is_verified`, đảm bảo `is_active` (chặn user bị vô hiệu).

---

## FR-02: User Profile Management  
### Mô tả  
Quản lý thông tin cá nhân (avatar, tên, mật khẩu).

### Actor  
- Admin, Staff

### Input  
- accountId (header / session), file avatar, tên mới, mật khẩu mới

### Output  
- Cập nhật profile, trả về URL avatar

### Quy trình xử lý  
- `GET /api/user/profile`  
- `POST /api/user/avatar` (multipart/form-data file upload)  
- `POST /api/user/change-password`  
- `POST /api/user/change-name`  

### Điều kiện trước  
- User đang kết nối xác thực (session hoặc header X-Account-Id)

### Điều kiện sau  
- Avatar lưu vào thư mục avatars, URL công khai.
- Mật khẩu mã hóa lưu trong Mongo.

---

## FR-03: Staff Management  
### Mô tả  
Admin quản lý tài khoản nhân viên (tạo, sửa, xoá, bật/tắt, xem mật khẩu).

### Actor  
- Admin

### Input  
- accountId admin + thông tin staff

### Output  
- Danh sách staff, thông tin cập nhật

### Quy trình xử lý  
- `POST /api/user/staff` -> tạo staff (username, name, password, phone).  
- `GET /api/user/staff` -> list staff (pagination, tìm kiếm).  
- `PUT /api/user/staff/:id` -> cập nhật staff.  
- `DELETE /api/user/staff/:id` -> xóa staff.  
- `POST /api/user/staff/:id/active` -> bật/tắt.  
- `GET /api/user/staff/:id/password` -> lấy mật khẩu (yêu cầu token 5 phút).

### Điều kiện trước  
- Admin đã đăng nhập hợp lệ.

### Điều kiện sau  
- Staff tạo/ cập nhật/ xóa dữ liệu trong `users` collection, có `parent_account_id` = admin.
- Gửi socket `force-logout` nếu bị khóa/xóa.

---

## FR-04: Chatbot Management  
### Mô tả  
Quản lý các “chatbot” (kịch bản, greeting, fields), dùng cho widget và định danh người dùng.

### Actor  
- Admin (và staff trong tổ chức bằng cách truy cập data chung)

### Input  
- accountId, tên bot, trường, ảnh đại diện

### Output  
- Danh sách bot, chi tiết bot

### Quy trình xử lý  
- `GET /api/chatbots`  
- `POST /api/chatbots`  
- `DELETE /api/chatbots/:botId`  
- `GET /api/chatbots/:botId`  
- `PUT /api/chatbots/:botId`  
- `POST /api/chatbots/avatar` (upload avatar)

### Điều kiện trước  
- User xác thực (accountId header hoặc session)

### Điều kiện sau  
- Dữ liệu lưu trong collection `chatbots` với `accountId` và `organizationId`.

---

## FR-05: Integration Management (Zalo / Facebook / Widget)  
### Mô tả  
Quản lý các tích hợp Messenger: đăng nhập OAuth, webhook, bật/tắt, xóa, hiển thị trạng thái kết nối.

### Actor  
- Admin, Staff (trong tổ chức)

### Input  
- Token OAuth, truy vấn trạng thái, yêu cầu kích hoạt/hủy

### Output  
- Danh sách integrations, trạng thái kết nối, phản hồi realtime

### Quy trình xử lý  
- `GET /api/integrations` (ưu tiên organizationId)
- `POST /api/integrations/:id/activate`
- `POST /api/integrations/:id/deactivate`
- `DELETE /api/integrations/:id`
- `GET /api/integrations/conversations/all` (lấy toàn bộ danh sách conversation hiện có qua các chatbot)
- `POST /api/integrations/conversations/nickname` (cập nhật nickname khách hàng)
- `POST /api/integrations/customers/phone` (đổi số điện thoại + note)
- `POST /api/integrations/conversations/:conv_id/lock`, `/unlock`, `/request-access`
- Socket events: `new-message`, `update-conversation`, `conversation-locked`, `conversation-unlocked`, `request-access`, `request-access-response`, `integration-added`, `integration-removed`.

### Điều kiện trước  
- accountId xác thực, tích hợp tồn tại hoặc thuộc tổ chức/ account.

### Điều kiện sau  
- Dữ liệu `integrations` được lưu trong collection `integrations` kèm `organizationId` nếu có.
- Socket thông báo đến nhóm room tổ chức / account.

---

## FR-06: Conversation Management  
### Mô tả  
Theo dõi, hiển thị, khóa/mở, gán / chuyển trách nhiệm (handover), cập nhật trạng thái đọc.

### Actor  
- Admin, Staff

### Input  
- conv_id (cấu trúc: `{platform}:{oa_id}:{sender_id}`), accountId, user interaction

### Output  
- Danh sách conversations, chi tiết conversation, cập nhật trạng thái (unread, tags, lock)

### Quy trình xử lý  
- Lưu hội thoại khi nhận webhook hoặc gửi tin từ UI.
- Tự động cập nhật `last_message`, `unread_count`, `tags`, `bot_reply`.
- Cơ chế lock/unlock (giữ bằng `current_handler`, `lock_expires_at` + công việc định kỳ expire).
- Thực hiện request-access (yêu cầu quyền của người khác).
- Cập nhật nickname, phone, note.

### Điều kiện trước  
- Conversation tồn tại trong Mongo, hoặc được dựng mới khi nhận webhook (upsert).

### Điều kiện sau  
- Conversation được lưu trong `conversations` collection, có `organizationId` / `accountId` để ngăn cách.

---

## FR-07: Message Handling  
### Mô tả  
Lưu trữ và truy vấn tin nhắn từ các kênh, đánh dấu đã đọc, áp dụng auto-reply (bot).

### Actor  
- Admin, Staff, System (bot)

### Input  
- Tin nhắn webhook (Zalo/Facebook), tin nhắn gửi từ UI, tin nhắn auto-reply

### Output  
- Message list cho conversation, trạng thái read/unread, thống kê

### Quy trình xử lý  
- Khi nhận webhook (Zalo/Facebook): xác định customer_id, conversation_id, upsert conversation và lưu message (`messages` collection).
- Khi gửi từ UI: lưu message hướng out và gọi API bên ngoài (Zalo/Facebook) nếu cần.
- Khi auto-reply: gọi external AI API rồi lưu message out, cập nhật conversation.
- Khi read: `mark_read` conversation/messages.

### Điều kiện trước  
- Conversation có `conversation_id` hợp lệ hoặc dựa trên `platform/oa_id/sender_id`.

### Điều kiện sau  
- Tin nhắn được cập nhật với `conversation_id`, `accountId`/`organizationId`, `bot_reply`, `is_read`, `tags`.

---

## FR-08: Auto-reply (AI) Engine  
### Mô tả  
Khi hội thoại ở chế độ bot (auto-reply), tự động gửi câu trả lời dựa trên external AI.

### Actor  
- System (Backend)

### Input  
- Câu hỏi (text) từ khách, token truy cập API (config)

### Output  
- Tin nhắn trả lời và cập nhật trạng thái hội thoại (bot_reply, bot-failed)

### Quy trình xử lý  
- Extract message (webhook) -> gọi external chat API (`microtunchat`) -> xác định answer + needhelp.
- Nếu trả về `needhelp`, tắt bot reply (set_bot_reply_by_id False), đánh dấu `tags=bot-failed`, thêm vào pending queue.
- Lưu tin nhắn trả lời và broadcast qua Socket.IO.

### Điều kiện trước  
- Conversation đang được config bot_reply = true (mặc định khi tạo mới).

### Điều kiện sau  
- Nếu no answer từ API, cập nhật tag `bot-failed` và disable auto-reply.
- Nếu needhelp, push vào hàng đợi kèm notify staff (dispatch_support_needed).

---

## FR-09: Real-time Collaboration (Socket.IO)  
### Mô tả  
Hệ thống cung cấp cập nhật realtime cho dashboard staff: tin nhắn mới, conversation update, lock/unlock, integration changes.

### Actor  
- Client (browser), server

### Input  
- Event WebSocket từ sever (emit)

### Output  
- UI cập nhật tức thời

### Quy trình xử lý  
- Client kết nối Socket.IO tới backend (`/`), gửi auth `{account_id}` (hoặc tự động lấy từ cookie).
- Backend join room `account:{accountId}` và `organization:{organizationId}` (nếu có) khi connect.
- Backend emit các event (list):
  - `new-message`
  - `update-conversation`
  - `conversation-locked`
  - `conversation-unlocked`
  - `integration-added`
  - `integration-removed`
  - `request-access`
  - `request-access-response`
  - `force-logout`
  - `support-needed`

### Điều kiện trước  
- Client phải gửi `account_id` hoặc giữ session (Flask-Login).

### Điều kiện sau  
- Thông tin chỉ được gửi đến phòng xác định, đảm bảo không rò rỉ giữa tổ chức.

---

# 5. Mô tả chi tiết các module hệ thống

## 5.1 Authentication Module  
### Chức năng  
- Quản lý đăng ký, đăng nhập, session, xác thực email, reset mật khẩu.

### API liên quan  
- `/api/register` (POST)  
- `/api/login` (POST)  
- `/api/verify-email` (GET)  
- `/api/resend-verification` (POST)  
- `/api/forgot-password` (POST)  
- `/api/reset-password` (POST)  
- `/api/logout` (POST)  

### Data flow  
- User gửi dữ liệu -> `UserModel` tạo / xác thực -> gửi email (EmailService) -> tạo session Flask.

### Interaction với module khác  
- `UserModel` kết nối với `Conversation`/`Integration` thông qua `accountId`, `organizationId` để xác thực.

---

## 5.2 Conversation Management  
### Chức năng  
- Lưu, cập nhật, truy vấn conversation.
- Hỗ trợ lock/unlock, update nickname, phone note, bot reply.

### API liên quan  
- `/api/integrations/conversations/all` (GET)  
- `/api/integrations/conversations/nickname` (POST)  
- `/api/integrations/conversations/<conv_id>/lock` (POST)  
- `/api/integrations/conversations/<conv_id>/unlock` (POST)  
- `/api/integrations/conversations/<conv_id>/request-access` (POST)  
- Socket events: `conversation-locked`, `conversation-unlocked`, `update-conversation`

### Data flow  
- Webhook (Zalo/Facebook) gọi internal `ConversationModel.upsert_conversation`.
- UI gọi API, gọi `ConversationModel.find_by_chatbot_id`, `find_by_oa_and_customer`.

### Interaction với module khác  
- `MessageModel` để lấy/đếm tin nhắn.
- `UserModel` để xác định `organizationId` (phân quyền).
- `IntegrationModel` kiểm tra kênh kết nối.
- `Socket.IO` gửi cập nhật.

---

## 5.3 Messaging System  
### Chức năng  
- Lưu tin nhắn vào Mongo.
- Lấy tin nhắn theo conversation / tổ chức.
- Đánh dấu đọc, tìm tin nhắn trùng.

### API liên quan  
- `/api/widget/conversations/<conv_id>/messages` (GET/POST)  
- Các API riêng cho Zalo/Facebook (trong backend, không phải endpoint công khai).  
- Socket events: `new-message`.

### Data flow  
- Tin nhắn được nhận từ webhook hoặc API UI -> `MessageModel.add_message`.
- Tin nhắn được hiển thị trong UI qua `get_messages` (hay organization query).

### Interaction với module khác  
- `ConversationModel` cập nhật `last_message`, `unread_count`.
- `Support Dispatch`/`Workflow` dùng thông tin tin nhắn để trigger cảnh báo.

---

## 5.4 Chatbot Engine  
### Chức năng  
- Quản lý metadata chatbot (tên, avatar, greeting, trường dữ liệu).
- Lưu training data (câu hỏi/đáp) phục vụ tính năng chatbot.

### API liên quan  
- `/api/chatbots` CRUD  
- `/api/chatbots/<bot_id>/training` CRUD  

### Data flow  
- Dữ liệu lưu trong `chatbots` và `training_data`.

### Interaction với module khác  
- Widget lead dùng `chatbot_id` để biết tổ chức và account.
- `Integration` liên kết `chatbot_id` với các kênh.

---

## 5.5 Integration System  
### Chức năng  
- Quản lý token OAuth, kết nối tới Zalo/Facebook.
- Cập nhật token tự động (refresh job).
- Xử lý webhook (tin nhắn, sự kiện).
- Bật/tắt integration.

### API liên quan  
- `/api/integrations`  
- `/api/zalo/auth-url`, `/zalo-auth-exclusive-callback`, `/zalo/webhook`  
- `/api/facebook/auth-url`, `/facebook-callback`, `/facebook/webhook`  
- `/api/integrations/:id/activate|deactivate|delete`

### Data flow  
- OAuth flow lấy token -> lưu `IntegrationModel`.  
- Webhook dữ liệu vào backend -> xác định integration -> tạo/ cập nhật conversation/message.

### Interaction với module khác  
- `ConversationModel`/`MessageModel` để đồng bộ nội dung.
- `SupportWorkflow/Dispatch` để cảnh báo nhân viên khi cần.

---

## 5.6 Widget Chat  
### Chức năng  
- Nhận lead từ widget (API công khai) -> tạo conversation + message.
- Hỗ trợ bot reply qua AI.
- Cho phép staff xem/ trả lời, giữ lock.

### API liên quan  
- `/api/widget/lead` (POST)  
- `/api/widget/conversations/<conv_id>/messages` (GET/POST)  
- `/api/widget/conversations/<conv_id>/mark-read` (POST)

### Data flow  
- Widget gửi lead (name/phone/message) với header `X-Chatbot-ID`.
- Backend tạo `customer` + `conversation` + `message`.
- Trigger auto-reply worker (thread) via `EXTERNAL_CHAT_API`.

### Interaction với module khác  
- `ConversationModel`/`MessageModel` để lưu.
- `Socket.IO` để phát sự kiện đến dashboard.

---

## 5.7 Admin Dashboard  
### Chức năng  
- Hiển thị danh sách hội thoại (có filter, tìm kiếm, chọn kênh)
- Hiển thị tin nhắn (chat box)
- Gửi tin nhắn, gửi file.
- Quản lý ticket/tags (bot-interacting / bot-failed)  
- Quản lý staff, chatbot, tích hợp.

### API liên quan  
- api.js gọi hầu hết các endpoint backend.
- Socket.io để cập nhật realtime.

### Data flow  
- Dữ liệu lấy qua API, cập nhật state React.
- Socket event cập nhật conversation/message, lock.

---

# 6. API Specification

> Toàn bộ endpoint ghi nhận trong backend, chủ yếu `/api/...`, `/api/widget/...`, `/api/zalo/...`, `/api/facebook/...`.

---

## 6.1 Authentication & User APIs

| Endpoint | Method | Params / Body | Response |
|---|---|---|---|
| `/api/register` | POST | `{ email, password, confirmPassword, fullName, phone }` | `{success, message}` |
| `/api/login` | POST | `{ email|username, password }` | `{ success, message, user: { accountId, email, username, role, ... }, session_expires_at }` |
| `/api/verify-email` | GET | Query: `token, email, accountId` | `{success, message}` |
| `/api/resend-verification` | POST | `{ email }` | `{success,message}` |
| `/api/user-status` | GET | Query: `email` | `{success,data:{email,is_verified,accountId}}` |
| `/api/forgot-password` | POST | `{ email }` | `{success,message}` |
| `/api/reset-password` | POST | `{ email, token, password, confirmPassword }` | `{success,message}` |
| `/api/logout` | POST | none | `{success,message}` |

---

## 6.2 Profile APIs

| Endpoint | Method | Headers / Body | Response |
|---|---|---|---|
| `/api/user/profile` | GET | Header: `X-Account-Id` | `{success,data:{email,username,name,accountId,phone_number,avatar_url,is_verified,created_at}}` |
| `/api/user/avatar` | POST | Header: `X-Account-Id`; FormData: `avatar` | `{success,message,data:{avatar_url}}` |
| `/api/user/change-password` | POST | Header: `X-Account-Id`; `{ currentPassword, newPassword, confirmNewPassword }` | `{success,message}` |
| `/api/user/change-name` | POST | Header: `X-Account-Id`; `{ newName }` | `{success,message,data:{newName}}` |

---

## 6.3 Staff Management APIs

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/user/staff` | POST | `{ username, name, phoneNumber, password }` | `{success,message,data:{accountId,username,name,phoneNumber}}` |
| `/api/user/staff` | GET | Query: `skip, limit, search` | `{success,data:{staff:[], total, skip, limit}}` |
| `/api/user/staff/:id/active` | POST | `{ is_active }` | `{success,data:{accountId,is_active}}` |
| `/api/user/staff/:id` | PUT | `{ name, username, phoneNumber, newPassword }` | `{success,message,data:{...}}` |
| `/api/user/staff/:id` | DELETE | none | `{success,message}` |
| `/api/user/staff/:id/password` | GET | Query: `token` | `{success,data:{password,username}}` |
| `/api/user/verify-password` | POST | `{ password }` | `{success,message,data:{token,expires_at}}` |

---

## 6.4 Chatbot APIs

| Endpoint | Method | Body/Query | Response |
|---|---|---|---|
| `/api/chatbots` | GET | none | `{success,data:[{id,name,...}]}` |
| `/api/chatbots` | POST | `{ name, purpose, greeting, fields, avatar_url }` | `{success,data:{...}}` |
| `/api/chatbots/:botId` | GET | none | `{success,data:{...}}` |
| `/api/chatbots/:botId` | PUT | `{ name, purpose, greeting, fields, avatar_url }` | `{success,data:{...}}` |
| `/api/chatbots/:botId` | DELETE | none | `{success,message}` |
| `/api/chatbots/avatar` | POST | multipart: `avatar`, optional `chatbotId` | `{success,message,data:{avatar_url}}` |

### Chatbot Training APIs

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/chatbots/:botId/training` | GET | Query: `limit, skip, q, order` | `{success,data:[...], total}` |
| `/api/chatbots/:botId/training` | POST | `{ status, question, answer }` | `{success,data:{...}}` |
| `/api/chatbots/:botId/training/:trainingId` | PUT | `{ status, question, answer }` | `{success,data:{...}}` |
| `/api/chatbots/:botId/training/:trainingId` | DELETE | none | `{success,message}` |
| `/api/chatbots/:botId/training/bulk-delete` | POST | `{ ids: [] }` | `{success,deleted}` |

---

## 6.5 Integration APIs

| Endpoint | Method | Body/Query | Response |
|---|---|---|---|
| `/api/integrations` | GET | Query: `platform`, `chatbotId` | `{success,data:[...]}` |
| `/api/integrations/:id/activate` | POST | none | `{success,data:{...}}` |
| `/api/integrations/:id/deactivate` | POST | none | `{success,data:{...}}` |
| `/api/integrations/:id` | DELETE | none | `{success,data:{...}}` |
| `/api/integrations/conversations/all` | GET | none | `{success,data:[...],stats:{totalMessages,botReplies}}` |
| `/api/integrations/conversations/nickname` | POST | `{ oa_id, customer_id, nick_name }` | `{success,data:{...}}` |
| `/api/integrations/customers/phone` | POST | `{ oa_id, customer_id, phone, note }` | `{success,data:{...}}` |
| `/api/integrations/conversations/:conv_id/lock` | POST | `{ ttl_seconds }` | `{success,data:{...}}` |
| `/api/integrations/conversations/:conv_id/unlock` | POST | `{ force }` | `{success,data:{...}}` |
| `/api/integrations/conversations/:conv_id/request-access` | POST | none | `{success}` |

### Widget APIs

| Endpoint | Method | Body/Query | Response |
|---|---|---|---|
| `/api/widget/lead` | POST | `{ name, phone, message }` + Header `X-Chatbot-ID` | `{success, conversation_id, conv_id, message_doc}` |
| `/api/widget/conversations/:conv_id/messages` | GET | Query: `limit, skip` | `{success,data:[...],conversation:{...}}` |
| `/api/widget/conversations/:conv_id/messages` | POST | `{ text, image }` | `{success,data}` |
| `/api/widget/conversations/:conv_id/mark-read` | POST | none | `{success,updated}` |

---

## 6.6 Zalo APIs (OAuth & Webhook)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/zalo/auth-url` | GET | Lấy URL OAuth (PKCE) cho Zalo OA |
| `/zalo-auth-exclusive-callback` | GET/POST | Callback OAuth Zalo (token exchange, lưu Integration) |
| `/webhook` | GET | Xác thực webhook Zalo |
| `/webhook` | POST | Nhận event tin nhắn Zalo |

> Lưu ý: Zalo webhook chịu trách nhiệm xác định `oa_id`, `sender_id`, `recipient_id`, `direction`, `message` từ payload không cố định.

---

## 6.7 Facebook APIs (OAuth & Webhook)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/facebook/auth-url` | GET | Lấy URL OAuth Facebook |
| `/facebook-callback` | GET/POST | Callback OAuth Facebook (nhận access token, list page, lưu integration) |
| `/webhook` | GET | Xác thực webhook Facebook |
| `/webhook` | POST | Nhận event tin nhắn Facebook |

---

## 6.8 Socket.IO (Realtime Events)

### Kết nối
- Client kết nối đến nhân (server) Socket.IO, gửi auth object `{ account_id }` qua `io()` connect.

### Các event emit từ server

| Event | Payload | Mô tả |
|---|---|---|
| `new-message` | { platform, oa_id, sender_id, message, message_doc, conv_id, conversation_id, ... } | Có tin nhắn mới |
| `update-conversation` | { conversation_id, conv_id, last_message, unread_count, tags, ... } | Cập nhật danh sách conversation |
| `conversation-locked` | { conv_id, conversation_id, handler, lock_expires_at } | Lock hội thoại |
| `conversation-unlocked` | { conv_id, conversation_id } | Unlock hội thoại |
| `request-access` | { conv_id, conversation_id, requester } | Yêu cầu truy cập |
| `request-access-response` | { conv_id, accepted, responder } | Phản hồi yêu cầu |
| `integration-added` | { integration_id, oa_id, platform } | Integration mới |
| `integration-removed` | { integration_id, oa_id, platform } | Integration bị xóa |
| `force-logout` | { reason } | Ép logout session (khi staff bị vô hiệu) |
| `support-needed` | { conv_id, platform, customer_name, content, pending_count, organization_id } | Cảnh báo support queue |

---

# 7. Database Design

## 7.1 Danh sách bảng (collections MongoDB)

- `users`
- `conversations`
- `messages`
- `integrations`
- `chatbots`
- `customers`
- `training_data`

---

## 7.2 Mô tả từng bảng

### `users`  
**Mục đích:** Lưu thông tin Admin/Staff.  
**Field chính:**
- `_id` (ObjectId)
- `accountId` (UUID as string) – khóa chính logic.
- `email` (string)
- `password` (bcrypt hash or plain for staff legacy)
- `name`, `username`, `phone_number`, `avatar_url`
- `role`: `admin` | `staff`
- `organizationId`: UUID (admin tạo, staff kế thừa)
- `parent_account_id`: admin accountId for staff.
- `is_verified`, `is_active`
- `verification_token`, `verification_token_expires_at`
- `reset_password_token`, `reset_password_token_expires_at`
- `zalo_user_id` (nếu staff liên kết Zalo)

**Indexes:**
- unique: `accountId`, `email`
- `organizationId`

---

### `conversations`  
**Mục đích:** Lưu metadata hội thoại cho UI (danh sách) và trạng thái lock.

**Field chính:**
- `_id` (ObjectId)
- `accountId` / `organizationId` (phân quyền)
- `chatbot_id`, `chatbot_info`
- `oa_id` (Zalo OA / Facebook Page / widget identifier)
- `customer_id` (format: `<platform>:<sender_id>`)
- `customer_info` (name, avatar, phone, note)
- `last_message`, `updated_at`
- `unread_count`
- `bot_reply` / `bot-reply`
- `tags` (`bot-interacting`, `staff-interacting`, `bot-failed`, ...)
- `current_handler` { accountId, name, started_at }
- `lock_expires_at`
- `nicknames` (map per organization)
- `created_at`

**Indexes:**
- unique: `(accountId, oa_id, customer_id)` (đảm bảo isolation)
- `(oa_id, customer_id)` (legacy)
- `(chatbot_id, updated_at)`
- `(organizationId, oa_id, customer_id)` (org isolation)
- `(organizationId, oa_id, updated_at)` và `(organizationId, customer_id, updated_at)`

---

### `messages`  
**Mục đích:** Lưu tất cả tin nhắn gửi/nhận.

**Field chính:**
- `_id` (ObjectId)
- `platform` (`zalo`/`facebook`/`widget`/`instagram`/...)
- `oa_id`
- `sender_id`
- `direction` (`in` | `out`)
- `text`
- `metadata` (đính kèm)
- `sender_profile` (name/avatar)
- `is_read`
- `bot_reply` (bool)
- `conversation_id` (ObjectId liên kết conversation)
- `accountId`, `organizationId`
- `created_at`, `updated_at`
- `tags`

**Indexes:**
- `conversation_id` + `created_at`
- `(accountId, platform, oa_id, created_at)`
- `(organizationId, conversation_id, created_at)`

---

### `integrations`  
**Mục đích:** Lưu kết nối kênh (Zalo / Facebook / ...).

**Field chính:**
- `_id` (ObjectId)
- `accountId`, `organizationId`
- `platform` (`zalo`, `facebook`, `instagram`, `widget`)
- `oa_id` (Zalo OA id / Page id)
- `access_token`, `refresh_token`, `expires_at`
- `is_active`
- `name`, `oa_name`, `avatar_url`
- `chatbotId` (liên kết chatbot)
- `meta` (dữ liệu tùy biến)
- `created_at`, `updated_at`, `connected_at`

**Indexes:**
- `(platform, oa_id)` unique
- `(accountId, platform, chatbotId)`
- `(organizationId, platform, oa_id)`
- `(organizationId, chatbotId, platform)`

---

### `chatbots`  
**Mục đích:** Metadata chatbot.

**Field chính:**
- `_id` (ObjectId)
- `accountId`, `organizationId`
- `name`, `purpose`, `greeting`, `fields` (array)
- `avatar_url`
- `created_at`, `updated_at`

**Indexes:**
- `accountId`, `organizationId`

---

### `customers`  
**Mục đích:** Map user “khách” theo kênh (Zalo user / widget / ...).

**Field chính:**
- `_id` (string): `platform:platform_specific_id`
- `platform`, `platform_specific_id`
- `name`, `avatar`, `phone`
- `is_staff` (bool)
- `updated_at`, `created_at`

**Indexes:**
- unique `(platform, platform_specific_id)`

---

### `training_data`  
**Mục đích:** Lưu “cặp hỏi đáp” cho chatbot (dữ liệu training nội bộ).

**Field chính:**
- `_id` (ObjectId)
- `accountId`
- `botId`
- `status`
- `question`, `answer`
- `created_at`, `updated_at`

**Indexes:**
- `(accountId, botId)`

---

# 8. Luồng hoạt động hệ thống (System Workflows)

## 8.1 Luồng gửi tin nhắn (Khách → Hệ thống)
1. Khách gửi tin nhắn qua Zalo/Facebook/Widget.
2. Kênh gọi webhook tới zalo.py hoặc facebook.py hoặc widget.py.
3. Backend:
   - Xác định `oa_id`, `sender_id`, `direction` (in/out).
   - Tìm `Integration` theo `oa_id` + `platform`.
   - Tạo/ cập nhật `Customer` record.
   - Upsert Conversation (`ConversationModel.upsert_conversation`) với `accountId/organizationId/chatbot_id`.
   - Lưu message (`MessageModel.add_message`), gắn `conversation_id` (ObjectId conversation).
   - Nếu `bot_reply=true`: khởi tạo worker auto-reply (thread) gọi external AI API.
   - Phát Socket event `new-message` + `update-conversation`.

## 8.2 Luồng auto-reply bot
1. Worker gọi API `EXTERNAL_CHAT_API` với `question`.
2. Nhận `answer` và `needhelp` (bool).
3. Lưu message out và cập nhật conversation.
4. Nếu `needhelp=true` hoặc API trả lỗi/không answer:
   - set `bot_reply=false` (tắt auto-reply)
   - tag `bot-failed`
   - thêm conversation vào pending queue (Redis)
   - gửi notification (zalo message + socket) cho staff.
5. Emit socket update.

## 8.3 Luồng tạo conversation  
- Khi nhận message mới hoặc submit từ widget, hệ thống gọi `ConversationModel.upsert_conversation`, đảm bảo:
  - `accountId` hoặc `organizationId` dùng để phân cách.
  - `chatbot_id` và `chatbot_info` gắn vào conversation.
  - `unread_count` tăng nếu incoming.
  - Tag `bot-interacting` / `staff-interacting` tùy trạng thái.

## 8.4 Luồng xử lý webhook  
1. Xác thực integration (active, token).
2. Giải mã payload -> xác định `platform`, `oa_id`, `sender_id`, `message`.
3. Nếu là tin nhắn khách (`direction=in`):
   - Lưu message & cập nhật conversation.
   - Nếu có `current_handler` (staff khóa), gọi `support_dispatch.forward_customer_message_to_staff` để gửi nội bộ.
4. Nếu là tin nhắn hệ thống, bỏ qua hoặc cập nhật trạng thái (ví dụ: bật/tắt, read).

## 8.5 Luồng khóa hội thoại (Lock/Unlock)
1. Staff gọi API `lock` (POST /api/integrations/conversations/:conv_id/lock).
2. Server kiểm tra:
   - Trường hợp `admin`: fetch conversation nhưng không khóa.
   - Trường hợp staff: check `current_handler` đang free / expired.
3. Mã hoá lock (TTL) vào `current_handler` + `lock_expires_at`.
4. Phát socket `conversation-locked` tới room tổ chức.
5. Sau TTL, job định kỳ trong app.py (`expire_locks`) sẽ:
   - Xóa khóa, cập nhật tag, phát sự kiện `conversation-unlocked`.

## 8.6 Luồng phê duyệt truy cập (Request Access)
1. Staff A đã khóa hội thoại.
2. Staff B gọi `request-access`: server emit `request-access` đến room `account:<handler_accountId>`.
3. Staff A chấp nhận/từ chối (emit `request-access-response`).
4. Server gửi lại cho requester B.

---

# 9. Kiến trúc hệ thống

## 9.1 Backend architecture  
- **Flask** là web framework chính.
- **Flask-SocketIO** với `eventlet` cung cấp realtime.
- **Flask-Login** quản lý session (cookies).
- **Flask-APScheduler** chạy jobs định kỳ (token refresh, lock expiration).
- **MongoDB** lưu trữ tất cả dữ liệu.
- **Redis** dùng cho:
  - Token PKCE (lưu state của OAuth)
  - Support queue + binding session + busy flag
- **Module**:
  - `routes/`: HTTP endpoint
  - `models/`: MongoDB abstraction
  - `utils/`: Redis client, email service, dispatch/workflow helpers

## 9.2 Frontend architecture  
- **Next.js app router** (app folder)
- **React + Ant Design** UI
- **Socket.IO client**: xử lý event realtime
- **API Client**: api.js gọi backend, xử lý lỗi
- **State**:
  - `useState`, `useReducer`, `useTransition` cho trạng thái conversation.
  - `localStorage` lưu `accountId`.

## 9.3 Realtime communication  
- Backend dùng Socket.IO với rooms:
  - `account:<accountId>`: gửi riêng cho người dùng / session của họ.
  - `organization:<organizationId>`: gửi cho toàn bộ nhân viên trong tổ chức.
- Client join room khi kết nối, server xác định room dựa trên `accountId` (được truyền khi kết nối hoặc từ session).

## 9.4 Integration architecture  
- **OAuth flow**
  - Zalo & Facebook: cấp token -> lưu `IntegrationModel`.
  - Token refresh (job) chạy định kỳ bằng `APScheduler`.
- **Webhook**
  - Backend cung cấp endpoint `/webhook` (Zalo/Facebook) để nhận event.
  - Backend “normalize” payload nhiều mẫu khác nhau.
- **Message sending**
  - Gửi trả lời qua API của Zalo/Facebook.
  - Lưu message vào DB.

---

# 10. Non-functional Requirements

## 10.1 Performance  
- MongoDB có nhiều index (theo `conversation_id`, `accountId`, `organizationId`, `chatbot_id`, `created_at`) để tối ưu query.
- Message limit/ pagination đặt mặc định (`limit` 50, top 2000), tránh bị timeout.
- Socket IO dùng `eventlet` để xử lý nhiều kết nối.

## 10.2 Security  
- **Phân quyền/ cô lập dữ liệu**
  - `organizationId` là primary key phân vùng (tổ chức).
  - `accountId` là fallback key (tài khoản).
- **Authentication**
  - Flask-Login với session cookie.
  - Kiểm tra `X-Account-Id` cho các endpoint (cần xác thực).
- **OAuth**
  - PKCE lưu trữ state vào Redis.
  - Token OAuth được lưu trong DB, không trả về client.
- **Socket**
  - Client phải cung cấp `account_id` để join room.
  - Server chỉ phát sự kiện vào room tương ứng.
- **Upload**
  - Kiểm tra kích thước (`MAX_UPLOAD_SIZE` 1MB).
  - Kiểm tra định dạng file, rename file an toàn.
- **Password**
  - Bcrypt mã hoá mật khẩu.
  - Staff (legacy) có thể lưu mật khẩu thẳng (chú ý bảo mật).
- **Email**
  - Gửi link xác thực & reset password.
- **Đã khắc phục**
  - Bị fix nhiều: `accountId` isolation, `organizationId` isolation, `conversation_id` object conversion.

## 10.3 Scalability  
- Cấu trúc database phân vùng theo `organizationId` cho phép multi-tenant.
- Socket rooms giúp chỉ gửi dữ liệu cần thiết.
- Redis queue/binding cho phép mở rộng nhiều instance backend.
- Scheduler (APScheduler) dùng tasks lặp lại; có thể mở rộng thành cron job.

## 10.4 Reliability  
- Mã dùng `try/except` rộng giúp tránh crash toàn bộ server khi lỗi.
- Các hành động không quan trọng (ví dụ gửi email, socket emit) không phá hoại luồng chính.
- Job refresh token chạy định kỳ để tránh token expire.

## 10.5 Logging & Monitoring  
- Sử dụng `logging` (mặc định `INFO`).
- Ghi log cho event quan trọng: Lỗi webhook, thất bại API, khóa conversation.
- Có thể mở rộng bằng `logging.handlers` hoặc tích hợp dịch vụ logging.

---

# 11. Third-party Integrations

## 11.1 Zalo OA  
- **OAuth**: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_REDIRECT_URI`, `ZALO_VERIFICATION_TOKEN`.
- **Webhook**: `/webhook` endpoint xác thực `verify_token`.
- **Gửi tin nhắn**: `_send_message_to_zalo` sử dụng `access_token`.
- **Auto-reply**: gọi API `EXTERNAL_CHAT_API` (microtunchat) sau đó gửi tin.

## 11.2 Facebook  
- **OAuth**: `FB_APP_ID`, `FB_APP_SECRET`, `FB_REDIRECT_URI`, `FB_SCOPE`.
- **Graph API**: lấy Page, access token, webhook event.
- **Gửi tin nhắn**: `_send_message_to_facebook` (đang trong module facebook).
- **Webhook**: `/webhook` endpoint xử lý nhiều kiểu payload.

## 11.3 External AI Chat API  
- URL: `https://microtunchat-app-1012095270393.us-central1.run.app/chat`
- Dùng cho auto-reply (Zalo/Facebook/Widget).
- Trả về JSON `{ answer, needhelp }`.

## 11.4 Redis  
- Lưu PKCE state (`zalo:pkce:...`, `facebook:pkce:...`), queue pending (`support:pending:...`), binding staff (`support:binding:staff_zalo:...`), busy flag (`support:busy:org:staff`).

---

# 12. Error Handling & Edge Cases

## 12.1 Xử lý lỗi chung  
- Hầu hết endpoints wrap try/except, trả `500` với message chung.
- Mỗi endpoint validate input chặt chẽ (missing field, định dạng).
- Lỗi validate trả `400`.
- Lỗi auth/không tìm thấy trả `403/404`.

## 12.2 Edge cases chính  
- **Webhook payload không chuẩn**: xử lý nhiều mẫu khác nhau, fallback JSON.
- **Token OAuth hết hạn**: `IntegrationModel.integrations_needing_refresh` + job refresh.
- **Conversation lock expired**: job `expire_locks` chạy mỗi 60s.
- **Xử lý account isolation bị lỗi**: fallback cho `accountId` nếu `organizationId` không tồn tại.
- **Lỗi chuyển `conversation_id` thành ObjectId**: `MessageModel` và `ConversationModel` đều lắng nghe, nếu fail thì bỏ qua `conversation_id` (message vẫn lưu).
- **Access token/kênh không tồn tại**: webhook được ignore (return 200).
- **Auto-reply API lỗi**: gắn tag `bot-failed`, tự động chuyển sang support queue.

---

# 13. Deployment Architecture

## 13.1 Server structure  
- server chứa backend Flask.
- client chứa frontend Next.js.
- start-server.sh (phiên bản dev) khởi động Docker Mongo + dev servers bằng tmux.

## 13.2 Docker / environment  
- Không có Dockerfile trong repository (chỉ `docker start local-mongo` trong start script).
- .env (không nằm trong repo) cung cấp biến môi trường:
  - `MONGODB_URI`, `SECRET_KEY`, `FLASK_ENV`, `FRONTEND_URL`, `ZALO_*`, `FB_*`, `REDIS_URL`, v.v.

## 13.3 Config variables  
- `Config` trong config.py quản lý cấu hình cơ bản.

## 13.4 Chạy hệ thống  
- Backend: `python app.py` (hoặc `flask run` nếu thay đổi).
- Frontend: `npm run dev` (Next.js).
- Yêu cầu: MongoDB, Redis (và các biến env tương ứng).

---

# 14. Future Improvements

## 14.1 Bảo mật
- Mã hóa password staff (hiện có thể lưu plain text legacy).
- Hạn chế `X-Account-Id` header (nên dùng token JWT thay vì header tự do).
- Thêm CSRF protection cho form (đặc biệt widget endpoint).

## 14.2 Tính năng
- Phân quyền chi tiết (role-based access).
- File attachment + media preview (hiện chỉ hỗ trợ ảnh).
- Dashboard thống kê mạnh hơn (time series, các KPI).
- Thêm module trực tiếp cho Instagram.
- API quản lý widget key/chữ ký để xác thực request widget.

## 14.3 Hiệu năng & mở rộng
- Chuyển sang cluster Mongo / replica set.
- Tối ưu query & index (với lượng message lớn).
- Triển khai job queue (Celery/RQ) cho auto-reply và các tác vụ nặng.

## 14.4 Tối ưu code
- Tách module và giảm duplication giữa Zalo/Facebook/Widget (shared message parsing, webhook parsing).
- Cải thiện logging/metrics (ví dụ, Prometheus, Sentry).
- Tăng coverage test, đặc biệt với webhook parsing.

---

**Kết luận:**  
Hệ thống là một nền tảng chat đa kênh, tập trung vào quản lý hội thoại khách hàng, phân quyền tổ chức, và hỗ trợ auto-reply. Tài liệu này trình bày đầy đủ các khía cạnh chức năng, cấu trúc dữ liệu, luồng xử lý, API, và các ràng buộc quan trọng cho việc phát triển, bảo trì và mở rộng.