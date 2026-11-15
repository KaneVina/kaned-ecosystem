# Kiến trúc và lý do chọn

## Monorepo bằng npm workspaces

```
packages/shared  ←── apps/api
       ↑
       └───────────  apps/web
```

Không dùng Turborepo hay pnpm để không thêm công cụ phải cài. `packages/shared` được cả hai app import,
nên một DTO đổi tên là lỗi biên dịch ở cả hai phía ngay lập tức, thay vì lỗi runtime lúc chạy thật.

Web dùng alias trỏ thẳng vào **source** của shared (`vite.config.ts` và `tsconfig.json`), nên sửa shared là
hot reload thấy ngay. API import qua `dist`, vì vậy script `predev`/`prebuild` của API tự build shared trước.

## Vì sao Drizzle thay vì Prisma

Prisma tải engine binary riêng cho từng nền tảng khi `generate`. Trên Windows và trên Render đó là một
bước dễ vỡ (và trong môi trường bị chặn mạng thì không tải được). Drizzle là TypeScript thuần: không
binary, không bước generate, `npm install` là xong. Schema trong `apps/api/src/db/schema.ts` vừa là định
nghĩa bảng vừa là kiểu dữ liệu, và `db.query.*` cho API quan hệ gần giống Prisma.

## Dữ liệu

```
University → Faculty → Major → (majorSubjects) → Subject
                                      │
                                      ├── subjectPrerequisites  (đồ thị, có loại cạnh)
                                      ├── documents → reviews / bookmarks / tags
                                      └── grades (của từng user)
```

`majorSubjects` là chương trình học: nó giữ `termNo`, tức môn đó thuộc kỳ mấy của ngành nào — cùng một môn
có thể nằm ở kỳ 3 của ngành này và kỳ 5 của ngành khác. `subjectPrerequisites` là đồ thị có hướng, mỗi cạnh
mang một loại:

| Loại | Nghĩa |
| --- | --- |
| `PREREQUISITE` | Phải qua môn kia trước |
| `COREQUISITE` | Học cùng kỳ cũng được |
| `PRIOR` | Phải đã học, điểm thế nào không quan trọng |

Thêm một module mới chỉ là thêm bảng trỏ vào `users` và `subjects`; phần còn lại không phải sửa.

## Đường đi của một request

```
request
  → helmet, cors (credentials), compression, cookieParser
  → rate limit cho /api
  → router của module
      → validate(zod schema từ shared)  →  res.locals
      → service (truy vấn Drizzle)
      → dto mapper (row → DTO mà shared khai báo)
  → errorHandler (ApiError | ZodError | mã lỗi Postgres 23505 / 23503)
```

Service không bao giờ trả thẳng row của database ra ngoài: mọi phản hồi đi qua một mapper trong
`src/lib/dto.ts`, nên không có chuyện lộ `passwordHash` vì quên `select`.

## Phiên đăng nhập

| | Access token | Refresh token |
| --- | --- | --- |
| Sống | 15 phút | 30 ngày |
| Ở đâu | Biến trong bộ nhớ tab | Cookie `httpOnly`, path `/api/auth` |
| Lưu ở server | Không | Có, đã băm HMAC |
| Khi dùng | Gắn vào header mỗi request | Đổi lấy cặp token mới, và bị xoay vòng |

Access token không nằm trong `localStorage`, nên một script chèn được vào trang cũng không đọc được nó.
Refresh token xoay vòng mỗi lần dùng: nếu một token cũ bị dùng lại, nó đã bị thu hồi.

Trên web, axios interceptor bắt lỗi 401, gọi `/auth/refresh` **một lần duy nhất** dù mười request cùng
hỏng một lúc (single-flight), rồi chạy lại các request đã hỏng. Lúc mở trang, `bootstrapSession()` thử
refresh trước khi router quyết định điều hướng, nên tải lại trang không bị đẩy về trang đăng nhập.

## Front end

- **TanStack Query** giữ toàn bộ dữ liệu server; không có global store nào khác. Khoá query tập trung
  trong `lib/queryClient.ts` để không bao giờ gõ sai chuỗi khoá.
- **Bộ lọc nằm trong URL** (`useLibraryFilters`), nên một trang thư viện đã lọc có thể lưu lại, chia sẻ,
  và nút back của trình duyệt hoạt động đúng.
- **Tailwind v4** với token khai báo trong `@theme` ở `styles/index.css`. Màu, bóng, bán kính đều là biến
  CSS, nên đổi chủ đề là sửa một chỗ.
- **Primitive trước, trang sau**: `components/ui/` là Button, Field, Card, Badge, Dropdown, Modal,
  Skeleton, Toast… Mọi trang chỉ ghép primitive lại, nhờ vậy khoảng cách, bán kính và trạng thái focus
  giống nhau ở mọi nơi mà không cần ai nhớ con số.
- **Lưu dấu tài liệu cập nhật lạc quan**: bấm là đổi ngay trên cache, lỗi thì trả lại trạng thái cũ.

## Tải file

```
browser ──POST /api/uploads/signature──► API  (ký bằng api_secret, không trả secret ra)
browser ──POST upload (XHR, có %)─────► Cloudinary
browser ──POST /api/documents─────────► API  (lưu url + public_id + bytes)
```

Tệp không đi qua Node, nên một file 50 MB không chiếm RAM của server. Khi Cloudinary chưa cấu hình,
API trả `mode: "local"` và nhận tệp qua multer — front end không cần biết sự khác biệt.

## Chuẩn bị cho Render + Vercel

- `app.set('trust proxy', 1)` để rate limit và cookie `Secure` nhìn đúng IP phía sau proxy.
- CORS đọc danh sách origin từ biến môi trường, không hard-code.
- Cookie đổi sang `SameSite=None; Secure` khi production, vì web và API khác domain.
- Pool database giữ trong `globalThis` để tsx reload lúc dev không làm cạn connection.
- `VITE_API_URL` rỗng khi dev (Vite proxy `/api`), trỏ Render khi production.

## Thêm một module mới

Ví dụ thẻ ghi nhớ:

1. `packages/shared` — thêm schema zod, DTO, và logic ôn tập thuần (cùng chỗ với GPA và planner).
2. `apps/api/src/db/schema.ts` — thêm bảng `flashcards` trỏ vào `users`, `subjects`.
3. `apps/api/src/modules/flashcards/` — routes + service, rồi mount trong `routes.ts`.
4. `apps/web/src/features/flashcards/` — hook query + trang.
5. `components/layout/AppShell.tsx` — thêm một dòng vào mảng `TOOLS`; menu Công cụ tự có mục mới.

Không phải sửa phần nào của thư viện, GPA hay kế hoạch học tập.
