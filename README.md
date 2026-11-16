# Kaned Ecosystem

Một không gian học tập cho sinh viên Việt Nam. Thư viện học liệu là **một module** trong hệ sinh thái;
cùng với nó là công cụ tính GPA, tra thông tin môn học và lập kế hoạch học tập theo điều kiện tiên quyết.

React + TypeScript ở front end, Express + PostgreSQL ở back end, một monorepo, chạy được trên Render +
Vercel mà không phải đổi code.

---

## Chạy trên máy

**Cách nhanh (Windows):** điền `DATABASE_URL` vào `apps/api/.env` rồi double-click **`setup.bat`**.
Nó cài dependencies, tạo bảng, nạp dữ liệu mẫu và khởi động cả API lẫn web. Những lần sau chỉ cần
`start.bat`. Phần bên dưới là các bước thủ công tương đương.

Cần **Node 20+** và một database PostgreSQL. Hai lựa chọn:

- **Supabase / Neon (nhanh nhất, không cài gì)** — tạo project, copy connection string, dán vào
  `DATABASE_URL` trong `apps/api/.env`. Bỏ qua bước `createdb` bên dưới vì database đã có sẵn.
- **Postgres cài trên máy** — làm đủ các bước bên dưới.

```bash
# 1. Cài phụ thuộc cho cả monorepo và build package dùng chung
npm install
npm run build:shared

# 2. Tạo database rỗng (một lần)
#    Windows:  "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres kaned
createdb -U postgres kaned

# 3. Tạo file .env từ mẫu rồi sửa DATABASE_URL cho khớp database vừa tạo
#    PowerShell:  copy apps\api\.env.example apps\api\.env
#                 copy apps\web\.env.example apps\web\.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Tạo bảng rồi nạp dữ liệu mẫu
npm run db:push
npm run db:seed

# 5. Chạy cả API và web
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000 (health check: `/health`)

`npm run dev` (và `start.bat`, `setup.bat`) tự tắt server Kaned cũ còn chạy ngầm từ lần trước, nên không còn
lỗi `EADDRINUSE :::4000` hay web nhảy sang cổng 5174, 5175… Chương trình khác đang dùng cổng 4000 / 5173 thì
không bị tắt — terminal sẽ báo tên và PID để bạn tự tắt.

**Đăng nhập demo**

| Tài khoản | Mật khẩu | Vào |
| --- | --- | --- |
| `ngoc.tb@fpt.edu.vn` (sinh viên FPTU, kỳ 5) | `kaned2026` | `/app` |
| `admin@kaned.vn` (quản trị viên) | `kaned2026` | `/admin` |

Tài khoản sinh viên đã có điểm 4 kỳ đầu, trong đó DBI202 4.5 (chưa qua nhưng đủ ≥ 4 cho PRJ301) và JPD113
3.8 (chặn JPD123), để trang Môn học & điều kiện có thứ thật sự bị chặn mà hiển thị.

Dữ liệu mẫu chỉ nạp **một lần cho mỗi phiên bản**: chạy lại `setup.bat` hay `npm run db:seed` không ghi đè
những gì bạn đã sửa trong trang quản trị. Muốn nạp lại từ đầu: `npm run db:seed -w @kaned/api -- --force`.

---

## Cấu trúc

```
kaned/
├─ apps/
│  ├─ api/                 Express + Drizzle ORM + PostgreSQL
│  │  ├─ src/db/           schema, migrations, seed
│  │  ├─ src/modules/      auth · catalog · documents · grades · uploads · users
│  │  ├─ src/middleware/   auth, validate, error, rate limit
│  │  └─ src/lib/          jwt, cookies, storage (Cloudinary), dto mappers
│  └─ web/                 React 18 + Vite + TanStack Query, CSS thuần
│     ├─ src/components/   ui/ (primitives) · layout/ · library/ · paper/
│     ├─ src/features/     auth · dashboard · library · gpa · subjects · profile
│     └─ src/lib/          api client, query keys, formatting
└─ packages/
   └─ shared/              Dùng chung cho cả hai đầu: zod schema, DTO types,
                           tính GPA, và bộ giải điều kiện tiên quyết
```

Logic nghiệp vụ nằm trong `packages/shared` dưới dạng hàm thuần, không phụ thuộc React hay Express:

| File | Nội dung |
| --- | --- |
| `grading.ts` | Thang điểm 10 → điểm chữ → hệ 4, GPA theo trọng số tín chỉ, xếp loại, tính điểm cần để đạt mục tiêu |
| `planner.ts` | Đồ thị tiên quyết: môn nào học được, môn nào bị chặn và vì thiếu môn nào |
| `schemas.ts` | zod schema cho mọi request — API validate bằng nó, form trên web cũng vậy |
| `types.ts` | DTO mà API trả về, web dùng trực tiếp làm kiểu dữ liệu |

Nhờ vậy cùng một công thức GPA chạy ở cả hai phía, và thêm một module mới (thẻ ghi nhớ, thời khoá biểu)
là thêm một thư mục trong `features/` cộng một router trong `modules/`, không phải sửa phần còn lại.

---

## Các lệnh

| Lệnh | Việc nó làm |
| --- | --- |
| `npm run dev` | Chạy song song API (4000) và web (5173) |
| `npm run build` | Build shared → api → web |
| `npm run typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `npm run db:push` | Đồng bộ schema vào database (nhanh, cho lúc phát triển) |
| `npm run db:generate` | Sinh file migration SQL từ schema |
| `npm run db:migrate` | Chạy migration (dùng khi deploy) |
| `npm run db:seed` | Nạp lại dữ liệu mẫu |
| `npm run db:studio` | Mở Drizzle Studio để xem dữ liệu |

---

## Những gì có trong trang trong

Sau khi đăng nhập, `/app` là không gian học tập:

- **Bảng điều khiển** — GPA, tín chỉ tích luỹ, tài liệu đã lưu, và các module trong hệ sinh thái
- **Thư viện** (`/app/library`) — lọc theo trường, môn, loại tài liệu, định dạng, năm, học kỳ, đánh giá;
  bộ lọc nằm trong URL nên chia sẻ được một đường dẫn đã lọc sẵn. Có xem lưới / danh sách, sắp xếp,
  phân trang, lưu tài liệu, trang chi tiết kèm đánh giá và tài liệu liên quan.
- **Tải lên** (`/app/upload`) — kéo thả, kiểm tra định dạng và dung lượng, hiển thị tiến trình
- **Công cụ** (menu dropdown trên thanh trên):
  - *Tính GPA* — nhập điểm hệ 10, xem điểm chữ và hệ 4 ngay trên bảng, lưu lại để công cụ khác dùng,
    xuất CSV, và tính xem kỳ tới cần trung bình bao nhiêu để chạm GPA mục tiêu
- **Môn học & điều kiện** (`/app/subjects`) — chương trình 9 kỳ với ô nhập điểm trên từng môn và bảng chi tiết
  bên cạnh: nội dung, chuẩn đầu ra, điều kiện tiên quyết, môn mà nó mở ra, tài liệu. Gõ điểm là trạng thái
  học được / bị chặn đổi ngay, kèm gợi ý một kỳ trong giới hạn 18 tín chỉ

---

## Trang quản trị (`/admin`)

Dành cho tài khoản có quyền **Quản trị viên** hoặc **Kiểm duyệt viên** (kiểm duyệt viên chỉ thấy Tổng quan,
Tài liệu và Nhật ký). Mục "Trang quản trị" hiện trong menu ảnh đại diện.

- **Tổng quan** — số liệu, tài liệu mới theo tuần, hàng chờ duyệt, trường nhiều tài liệu, thay đổi gần đây
- **Tài liệu** — lọc theo trạng thái / trường / loại / định dạng, duyệt – từ chối – gỡ – xoá từng cái hoặc
  hàng loạt, sửa thông tin, và **đăng tài liệu mới bằng tệp hoặc bằng liên kết**
- **Trường học** — thêm / sửa / xoá trường; trong mỗi trường quản lý **khoa, ngành** (số kỳ, điểm qua môn,
  tổng tín chỉ) và **kỳ học** của trường (Fall 2026, HK1 2026–2027… có ngày bắt đầu / kết thúc)
- **Môn học** — danh mục môn của từng trường, đề cương; đổi mã môn tự cập nhật điều kiện ở các môn khác.
  Bấm vào một môn để mở trang của môn đó, nơi sắp tài liệu vào **thư mục** (xem bên dưới)
- **Chương trình đào tạo** — bảng các kỳ của một ngành: kéo thả môn giữa các kỳ, thêm / bớt kỳ, bấm vào môn
  để đặt điều kiện (môn tiên quyết, điểm tối thiểu, "đạt N trong nhóm", giới hạn nợ môn, điểm TB nhóm).
  Đây đúng là dữ liệu mà trang Môn học & điều kiện của sinh viên dùng.
- **Người dùng** — tìm, lọc, cấp / thu hồi quyền (không tự đổi quyền mình, không bỏ được admin cuối cùng)
- **Nhật ký thay đổi** — ai đã làm gì, khi nào

Nhấn **Ctrl K** (⌘K trên Mac) ở bất kỳ trang quản trị nào để tìm nhanh trường, môn, tài liệu, người dùng
hoặc nhảy tới một trang. Nút **Tạo mới** ở thanh trên cùng mở nhanh các thao tác tạo.

### Thư mục trong môn học

Mỗi môn có cây thư mục riêng, lồng tối đa 3 cấp — ví dụ môn CSD201 có thư mục *Đề thi* chứa *Đề thi 1*,
*Đề thi 2*, *Đề thi 3*, hoặc *Đề thi › 2025 › Giữa kỳ*. Trong trang môn (Quản trị › Môn học › bấm vào môn):

- **Thư mục mới** / **Thư mục con** để tạo; menu "⋯" cạnh thư mục để đổi tên, đưa ra cấp ngoài hoặc xoá
- **Kéo một dòng tài liệu thả vào thư mục** ở cột trái, hoặc chọn nhiều dòng rồi bấm **Chuyển vào thư mục**
- **Đăng tài liệu vào đây** mở form đăng với môn và thư mục đã điền sẵn
- Xoá thư mục không xoá tài liệu: tài liệu và thư mục con được đưa lên thư mục cha

Sinh viên thấy tài liệu của môn được nhóm theo thư mục ở trang Môn học & điều kiện, thấy thư mục trong
đường dẫn của trang tài liệu và có thể chọn thư mục khi tải tài liệu lên.

### Theo dõi người dùng

Chỉ **quản trị viên** thấy (kiểm duyệt viên không thấy):

- **Người dùng** có cột *Hoạt động* (chấm xanh = đang online, hoặc "Hoạt động 5 phút trước") và các tab lọc
  *Đang online · Hoạt động hôm nay · 7 ngày qua · Vắng hơn 30 ngày · Chưa từng hoạt động*
- **Tổng quan** có khung *Đang online*: ai đang mở Kaned, đang xem trang nào, đã dùng bao lâu trong phiên
- Bấm vào một người để mở **trang chi tiết tài khoản**: đang xem gì ngay lúc này, thời gian dùng hôm nay /
  7 ngày / 30 ngày, biểu đồ thời gian dùng mỗi ngày, khung giờ hay dùng, thiết bị và IP gần nhất, và 4 tab:
  - *Phiên truy cập* — mỗi lần vào: lúc bắt đầu, dùng bao lâu, thiết bị, IP; bấm để xem dòng thời gian
    từng trang đã mở và xem bao lâu
  - *Lịch sử xem* — mọi trang, tài liệu, môn học đã mở, lọc theo loại
  - *Tài liệu xem nhiều* — xếp theo tổng thời gian đọc
  - *Hoạt động* — đăng nhập (bằng gì, từ IP nào), đăng xuất, tìm kiếm, tải, đăng, lưu, đánh giá tài liệu,
    đổi mật khẩu, liên kết tài khoản
- Nút "⋯" → **Đăng xuất mọi thiết bị** thu hồi mọi phiên của tài khoản đó
- Ctrl K tìm được người dùng theo tên / email

Cách đếm: tab đang mở báo về mỗi 30 giây. Thời gian chỉ được tính khi tab **đang hiển thị** và người dùng
**có thao tác** trong 5 phút gần nhất (15 phút khi đang đọc tài liệu, hoặc khi đang cuộn trong khung xem
PDF / slide). "Đang online" = báo về trong 2 phút gần nhất. Server giới hạn thời gian mỗi lần báo theo thời
gian thật đã trôi qua, nên không thể khai khống.

**Quyền riêng tư.** Kaned không ghi nội dung người dùng gõ, không quay màn hình. Lịch sử được giữ
`ACTIVITY_RETENTION_DAYS` ngày (mặc định 180) rồi tự xoá. Sinh viên được thông báo việc này trong
*Cài đặt tài khoản*. Nếu đưa Kaned cho người dùng thật, hãy ghi rõ việc thu thập này trong chính sách
quyền riêng tư của bạn.

Muốn tài khoản Google của bạn thành quản trị viên: đăng nhập bằng `admin@kaned.vn`, vào **Người dùng**,
đổi quyền tài khoản của bạn thành *Quản trị viên*.

## Tài liệu dạng liên kết

Ngoài tệp PDF / Word / PowerPoint / Excel, tài liệu có thể là một **liên kết**: Google Slides, Docs, Sheets,
Drive, YouTube, Canva, Figma, Notion, OneDrive hay bất kỳ trang web nào. Google Slides / Docs / Drive,
YouTube, Canva và Figma được nhúng xem ngay trên trang tài liệu; các trang khác mở ở tab mới. Sinh viên
dán liên kết ở bước 1 của trang Tải lên, admin dán trong ô "Liên kết" khi đăng tài liệu.

## Idempotency-Key

Mọi thao tác ghi quan trọng — đăng / sửa / xoá tài liệu, lưu, đánh giá, đếm lượt tải, lưu điểm, sửa hồ sơ,
tải tệp lên và **toàn bộ thao tác trong trang quản trị** — bắt buộc có header `Idempotency-Key`. Gửi lại
cùng khoá với cùng nội dung thì server trả lại đúng kết quả lần đầu (kèm `Idempotent-Replayed: true`) thay
vì làm lần hai; cùng khoá mà nội dung khác thì bị từ chối (422); khoá đang được xử lý thì trả 409 và web tự
chờ rồi hỏi lại. Web app tự gắn khoá, và với các biểu mẫu thì giữ nguyên khoá cho tới khi lưu thành công,
nên bấm đúp hay mạng chập chờn cũng không tạo bản trùng. Các endpoint cấp phiên đăng nhập (`/auth/login`,
`/register`, `/google`, `/refresh`, `/logout`) không dùng khoá vì kết quả của chúng là token, không được lưu
lại để phát lại.

## Lưu file

Mặc định tệp đi thẳng từ trình duyệt lên **Cloudinary** bằng chữ ký do API cấp (`POST /api/uploads/signature`),
nên một tệp 50 MB không phải đi qua server. Khi chưa cấu hình Cloudinary, API tự chuyển sang nhận tệp qua
`POST /api/uploads/direct` và ghi vào `apps/api/uploads/` để phát triển local — không phải sửa gì ở front end.

## Đăng nhập bằng tài khoản bên thứ ba

Sinh viên có thể đăng nhập / đăng ký bằng **Google, Microsoft, GitHub hoặc Facebook**. Mỗi nhà cung cấp tự
hiện trên trang đăng nhập khi `apps/api/.env` có **cả client ID lẫn secret** của nó — không phải sửa code,
chỉ cần khởi động lại API. Chưa bật cái nào thì trang đăng nhập chỉ có email + mật khẩu.

Ở mọi nhà cung cấp, địa chỉ chuyển về (redirect / callback URL) có dạng:

```
http://localhost:5173/api/auth/oauth/<provider>/callback        ← khi chạy trên máy
<API_PUBLIC_URL>/api/auth/oauth/<provider>/callback             ← production
```

với `<provider>` là `google`, `microsoft`, `github` hoặc `facebook`.

**Google** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials* →
*OAuth client ID* → loại *Web application* → thêm callback URL ở trên vào *Authorized redirect URIs*. Điền
*Client ID* / *Client secret* vào `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Lần đầu Google bắt cấu hình
*OAuth consent screen*; khi app còn ở chế độ *Testing*, chỉ các email trong *Test users* đăng nhập được.

**Microsoft** (tài khoản Outlook / Microsoft 365 của trường) — [Microsoft Entra](https://entra.microsoft.com) →
*App registrations* → *New registration* → *Accounts in any organizational directory and personal Microsoft
accounts* → *Redirect URI* loại *Web* = callback URL. Sau đó *Certificates & secrets* → *New client secret*
(chép cột **Value**). Điền *Application (client) ID* và secret vào `MICROSOFT_CLIENT_ID` /
`MICROSOFT_CLIENT_SECRET`. Muốn chỉ cho email của một trường: đặt `MICROSOFT_TENANT` bằng tenant ID của trường.

**GitHub** — *Settings* → *Developer settings* → *OAuth Apps* → *New OAuth App*: *Homepage URL*
`http://localhost:5173`, *Authorization callback URL* = callback URL. Bấm *Generate a new client secret*, điền
vào `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

**Facebook** — [Meta for Developers](https://developers.facebook.com/apps) → *Create app* → chọn trường hợp
dùng *Facebook Login* → thêm callback URL vào *Valid OAuth Redirect URIs* (khi app ở chế độ Development, địa
chỉ `localhost` được chấp nhận sẵn). *App settings → Basic* có *App ID* / *App secret* → điền vào
`FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`.

Logo chính thức của các hãng không đi kèm repo; nút hiện chữ cái đầu. Muốn có logo, đặt tệp từ bộ nhận diện
của từng hãng vào `apps/web/src/assets/brands/` (`google.svg`, `microsoft.svg`, `github.svg`, `facebook.svg`).

### Luồng đăng nhập

1. Bấm nút → API tạo `state`, PKCE và `nonce`, cất vào cookie mã hoá, rồi chuyển sang trang của nhà cung cấp
2. Người dùng đồng ý → nhà cung cấp trả về `code` → API kiểm tra `state`, đổi `code` lấy token ở phía server,
   lấy tên + email, rồi tìm hoặc tạo tài khoản và đặt cookie phiên
3. Trình duyệt về `/auth/callback` → vào đúng trang đang mở dở (hoặc `/app`). Tài khoản mới đi qua
   `/welcome` để chọn trường và ngành (bỏ qua được)

Kaned gắn tài khoản bên ngoài với tài khoản Kaned theo các luật sau:

| Trường hợp | Kết quả |
| --- | --- |
| Tài khoản bên ngoài đã liên kết | Đăng nhập vào tài khoản đó |
| Email **đã xác minh** trùng một tài khoản Kaned | Tự liên kết rồi đăng nhập |
| Email trùng nhưng nhà cung cấp **không xác minh** email (thường gặp với Microsoft) | Từ chối, hướng dẫn đăng nhập bằng mật khẩu rồi liên kết trong Cài đặt — chặn chiếm tài khoản bằng email giả |
| Email chưa có ai dùng | Tạo tài khoản mới |
| Nhà cung cấp không cho email (Facebook đăng ký bằng số điện thoại, GitHub chưa xác minh email) | Từ chối, giải thích lý do |

Trong **Cài đặt tài khoản** (`/app/settings`, có trong menu ảnh đại diện) người dùng liên kết / bỏ liên kết
từng nhà cung cấp và đặt hoặc đổi mật khẩu. Không bỏ được cách đăng nhập cuối cùng; đổi mật khẩu thì các
thiết bị khác bị đăng xuất. Người dùng cũ đã đăng nhập Google trước bản này vẫn giữ liên kết.

## Bảo mật

- Access token sống 15 phút, chỉ nằm trong bộ nhớ của tab — không vào `localStorage`
- Refresh token là cookie `httpOnly`, được băm trước khi lưu vào database, và xoay vòng mỗi lần dùng
- Mật khẩu băm bằng bcrypt; `helmet`, CORS theo danh sách origin, rate limit cho toàn bộ `/api`
- Đăng nhập bên thứ ba dùng authorization code + PKCE; `state`, PKCE verifier và `nonce` nằm trong cookie
  mã hoá AES-GCM chỉ sống 10 phút và chỉ dùng một lần. Token của nhà cung cấp không bao giờ tới trình duyệt và
  không được lưu. Mọi đường quay về web đi tới `WEB_URL` trong cấu hình, `next` chỉ nhận đường dẫn nội bộ
  (không có open redirect)
- Khi lên production, cookie chuyển sang `SameSite=None; Secure` để Vercel gọi được Render

---

## Deploy

Xem [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) cho các bước đầy đủ (Render + Vercel + Neon),
và [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) cho quyết định kỹ thuật và cách mở rộng thêm module.
