# NGHỊCH THỦY HÀN · BỘ CHUYỂN ĐỔI MÃ QR CHUẨN VNG PRO
> Hỗ trợ chuyển đổi mã diện mạo, màu tóc, màu trang phục, makeup và thiết lập chụp ảnh từ bản TRUNG (NetEase) sang bản VNG Games PC & Mobile chuẩn xác 100%.

---

## 1. Tổng Quan Cơ Chế & Phân Tích Kỹ Thuật

### 1.1 Cơ chế hoạt động của Trạm Thiết Kế NetEase (`h.163.com/avatar`)
- **Web App**: SPA Vue.js lưu trữ tại NetEase CDN (`h.res.netease.com`).
- **Official API Gateway**: `https://hapi.hi.163.com/l36/fashion`
  - `/web/work/list/recommend?page=1&pageSize=16`: Danh sách đề cử.
  - `/web/work/list/hot?page=1&pageSize=16`: Danh sách thịnh hành nhiều tim.
  - `/web/work/list/new?page=1&pageSize=16`: Danh sách tác phẩm mới tải lên.
  - `/web/work/detail?workId=<ID>`: Chi tiết tác phẩm. Thuộc tính `property` chứa URL file nén dữ liệu diện mạo `nshm@@@1@@@1###...`.
  - `videoPreviewUrl` / `previewUrl`: Ảnh render khuôn mặt/nhân vật độ phân giải cao.

### 1.2 Phân tích lỗ hổng & Hạn chế của `nth-qrcode-converter.pages.dev`
- **Lỗi chứng chỉ & SSL Certificate**: Phụ thuộc thô vào IP máy chủ `103.159.51.79:8443` với chứng chỉ tự ký (self-signed). Trình duyệt người dùng thường xuyên báo lỗi `NET::ERR_CERT_AUTHORITY_INVALID` hoặc chặn CORS/Mixed Content.
- **Trải nghiệm phân mảnh (UX Friction)**: Người dùng phải tự sang trang Trung Quốc `h.163.com`, gặp rào cản ngôn ngữ, tìm ID rồi quay về tab converter dán link thủ công.
- **Thiếu bộ duyệt trực quan**: Không có gallery xem trước diện mạo trong cùng ứng dụng.

### 1.3 Cải tiến vượt trội trên phiên bản này
1. **Bộ Động Cơ Chuyển Đổi Chuẩn Xác Nhất (Precision Engine)**:
   - **Tối ưu hóa đa nền tảng**: Tùy chọn chuyển đổi chuyên biệt cho **VNG PC Client** và **VNG Mobile (Android / iOS)**.
   - **Nhận diện khung xương model bắt buộc**: Tự động phát hiện chính xác model khuôn mặt (Nữ 01, Nữ 05, Nam 02...) và hiển thị cảnh báo hướng dẫn người chơi chọn đúng model trong game để chống 100% tình trạng lệch xương cằm hay méo mắt.
   - **Báo cáo tương thích & Thay thế lớp bản quyền**: Phát hiện các hoa điền/style chưa cập nhật ở VNG và thông báo rõ ràng để người chơi chủ động chọn hoa điền thay thế.
   - **Gợi ý cân chỉnh ánh sáng & sắc độ da**: Tư vấn vi chỉnh thanh trượt độ sáng da để khuôn mặt đạt độ tự nhiên cao nhất dưới hệ thống shader của VNG.
2. **Sinh Mã QR Tức Thì & Không Thể Lỗi**:
   - Tích hợp bộ vẽ QR trực tiếp ngay tại client (0ms) kết hợp bộ sinh Base64 Data URL từ máy chủ, khắc phục hoàn toàn sự cố ảnh QR không hiển thị do lỗi SSL hay timeout mạng.
3. **Giao Diện Võ Hiệp Hiện Đại (Modern Wuxia Glassmorphism)**: Tông màu Thủy mặc, Kim cổ và Bích ngọc đậm chất Nghịch Thủy Hàn, hỗ trợ cả PC và Mobile mượt mà.
4. **Hỗ Trợ Đầy Đủ Tất Cả Chế Độ**:
   - Khuôn mặt (Face)
   - Trang điểm giữ thân (Makeup)
   - Bảng màu tóc (Hair Dye RGBA)
   - Bảng màu áo (Top) & quần (Bottom)
   - Thiết lập chụp ảnh đoàn phim (Photo Presets)
5. **Dán ảnh Clipboard (Ctrl + V)**: Chụp màn hình hoặc copy ảnh QR ở bất cứ đâu rồi bấm Ctrl + V trên trang để chuyển đổi ngay.

---

## 2. Cách Khởi Động & Chạy Thử Nghiệm

Dự án sử dụng thuần thư viện tiêu chuẩn của Node.js, **không cần cài thêm bất kỳ gói npm nặng nào**.

```bash
# Di chuyển vào thư mục dự án
cd d:/MyProjects/webchuyencode

# Khởi chạy máy chủ
npm start
# hoặc
node server.js
```

Mở trình duyệt truy cập: **`http://localhost:3000`**

---

## 3. Cấu Trúc Thư Mục

```text
webchuyencode/
├── package.json         # Cấu hình dự án & scripts khởi chạy
├── server.js            # Reverse proxy + Static server siêu nhẹ
├── README.md            # Tài liệu kỹ thuật chi tiết
└── public/
    ├── index.html       # Giao diện chính chuẩn SEO & Responsive
    ├── css/
    │   └── style.css    # Thiết kế Wuxia Glassmorphism cao cấp
    └── js/
        └── app.js       # Logic điều khiển, API client, Gallery & QR
```

---

## 4. Hướng Dẫn Nhập Vào Game Nghịch Thủy Hàn VNG
1. Sau khi bấm **Chuyển Mã**, tải ảnh QR về máy (hoặc chép liên kết QR).
2. Mở game **Nghịch Thủy Hàn VNG** (PC Client hoặc Mobile).
3. Vào màn hình **Tạo nhân vật / Đổi diện mạo**.
4. Bấm biểu tượng **Quét mã QR (Nhập diện mạo)** ở góc màn hình và chọn ảnh vừa tải về.
5. Để chỉ đổi lớp trang điểm mà không làm biến dạng mặt hoặc thân hình, hãy chọn mục **Trang Điểm** ở phía dưới trước khi quét QR.
