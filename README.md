# Kaned Ecosystem

Một không gian học tập cho sinh viên Việt Nam. Thư viện học liệu là **một module** trong hệ sinh thái;
cùng với nó là công cụ tính GPA, tra thông tin môn học và lập kế hoạch học tập theo điều kiện tiên quyết.

React + TypeScript ở front end, Express + PostgreSQL ở back end, một monorepo, chạy được trên Render +
Vercel mà không phải đổi code.

---

## Chạy trên máy

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

**Đăng nhập demo:** `ngoc.tb@fpt.edu.vn` / `kaned2026`

Tài khoản này đã có điểm của 10 môn, trong đó một môn trượt (`NWC203`, 3.5) để công cụ kế hoạch học tập có
thứ gì đó thật sự bị chặn mà hiển thị.

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
│  └─ web/                 React 18 + Vite + Tailwind v4 + TanStack Query
│     ├─ src/components/   ui/ (primitives) · layout/ · library/
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
  - *Thông tin môn học* — tra theo mã môn hoặc tên, xem tín chỉ, nội dung, chuẩn đầu ra, cách đánh giá,
    điều kiện tiên quyết và những môn mà nó mở ra
  - *Kế hoạch học tập* — đọc điểm đã lưu, đối chiếu chương trình học và chỉ ra môn học được, môn bị chặn
    (kèm lý do: chưa học / chưa qua / đang học / điểm chưa đủ), cùng gợi ý một kỳ trong giới hạn 18 tín chỉ

---

## Lưu file

Mặc định tệp đi thẳng từ trình duyệt lên **Cloudinary** bằng chữ ký do API cấp (`POST /api/uploads/signature`),
nên một tệp 50 MB không phải đi qua server. Khi chưa cấu hình Cloudinary, API tự chuyển sang nhận tệp qua
`POST /api/uploads/direct` và ghi vào `apps/api/uploads/` để phát triển local — không phải sửa gì ở front end.

## Đăng nhập Google

Tạo OAuth client (Web application) ở [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
thêm `http://localhost:5173` vào *Authorized JavaScript origins*, rồi điền `GOOGLE_CLIENT_ID` vào
`apps/api/.env`. Front end tự lấy client ID từ `GET /api/auth/config`, nên hai đầu không bao giờ lệch nhau.
API xác thực ID token bằng `google-auth-library` trước khi tạo hoặc liên kết tài khoản.

## Bảo mật

- Access token sống 15 phút, chỉ nằm trong bộ nhớ của tab — không vào `localStorage`
- Refresh token là cookie `httpOnly`, được băm trước khi lưu vào database, và xoay vòng mỗi lần dùng
- Mật khẩu băm bằng bcrypt; `helmet`, CORS theo danh sách origin, rate limit cho toàn bộ `/api`
- Khi lên production, cookie chuyển sang `SameSite=None; Secure` để Vercel gọi được Render

---

## Deploy

Xem [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) cho các bước đầy đủ (Render + Vercel + Neon),
và [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) cho quyết định kỹ thuật và cách mở rộng thêm module.
