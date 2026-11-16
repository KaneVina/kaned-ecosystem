# Deploy lên Render + Vercel

Kiến trúc khi lên production:

```
Vercel (web, static)  ──HTTPS + cookie──►  Render (API, Node)  ──►  Postgres (Render / Neon)
                                                    │
                                                    └──►  Cloudinary (file)
```

Front end là file tĩnh nên Vercel phục vụ rất nhanh; API là một process Node trên Render. Vì hai bên khác
origin, cookie refresh phải là `SameSite=None; Secure` — code đã tự chuyển khi `NODE_ENV=production`.

---

## 1. Database

Chọn một trong hai:

- **Render Postgres** — `render.yaml` đã khai báo sẵn `kaned-db`, Render tự nối `DATABASE_URL`.
- **Neon** (https://neon.tech) — tạo project, copy connection string có `?sslmode=require`.
- **Supabase** (https://supabase.com) — *Project Settings → Database → Connection string → URI*.
  Dùng direct connection (5432) hay pooler (6543) đều được; với pooler app tự tắt prepared
  statement vì PgBouncer ở chế độ transaction không giữ được chúng.

TLS được bật tự động cho mọi host không phải máy local. Nếu cần ép, đặt `DATABASE_SSL=require` hoặc `disable`.

## 2. API trên Render

**Cách nhanh:** push repo lên GitHub, rồi Render → *New* → *Blueprint* → chọn repo. File `render.yaml`
khai báo đủ build command, start command, health check và biến môi trường.

**Cách thủ công:** New → *Web Service*, rồi điền:

| Trường | Giá trị |
| --- | --- |
| Root directory | *(để trống — build từ gốc monorepo)* |
| Build command | `npm install && npm run build --workspace @kaned/shared && npm run build --workspace @kaned/api` |
| Start command | `node apps/api/dist/index.js` |
| Health check path | `/health` |

Biến môi trường cần đặt:

```
NODE_ENV=production
DATABASE_URL=<connection string>
JWT_ACCESS_SECRET=<48 bytes hex>
JWT_REFRESH_SECRET=<48 bytes hex>
CORS_ORIGINS=https://<tên-app>.vercel.app
WEB_URL=https://<tên-app>.vercel.app
API_PUBLIC_URL=https://kaned-api.onrender.com
# Đăng nhập bằng tài khoản bên thứ ba — điền cặp nào thì nhà cung cấp đó bật:
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# MICROSOFT_CLIENT_ID / _SECRET, GITHUB_CLIENT_ID / _SECRET, FACEBOOK_CLIENT_ID / _SECRET
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Sinh secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`PORT` do Render tự đặt, không cần khai báo.

### Tạo bảng trên database production

Lần đầu, chạy migration từ máy bạn với `DATABASE_URL` trỏ vào database production:

```bash
# PowerShell
$env:DATABASE_URL="postgresql://..."
npm run db:migrate --workspace @kaned/api
npm run db:seed --workspace @kaned/api   # chỉ khi muốn có dữ liệu mẫu
```

Về sau, khi schema đổi: `npm run db:generate` để sinh SQL, commit file trong `apps/api/drizzle/`,
rồi chạy lại `db:migrate`.

## 3. Web trên Vercel

Vercel → *Add New Project* → chọn repo. Đặt **Root Directory** là `apps/web`; `apps/web/vercel.json`
đã có build command cho monorepo và rewrite để React Router xử lý mọi đường dẫn.

Biến môi trường:

```
VITE_API_URL=https://kaned-api.onrender.com
```

> `VITE_API_URL` được nhúng vào bundle lúc build, nên sau khi đổi phải deploy lại.

## 4. Nối hai bên

1. Deploy API trước, lấy URL Render.
2. Deploy web với `VITE_API_URL` trỏ vào URL đó.
3. Quay lại Render, đặt `CORS_ORIGINS` bằng URL Vercel (thêm cả domain preview nếu cần, cách nhau bằng dấu phẩy).
4. Với mỗi nhà cung cấp đăng nhập đã bật: thêm callback URL production
   `https://kaned-api.onrender.com/api/auth/oauth/<provider>/callback` vào cấu hình ứng dụng bên đó
   (cách làm cho từng hãng: README → *Đăng nhập bằng tài khoản bên thứ ba*).

## 5. Cloudinary

Dashboard → *Settings* → *Upload* → thêm một upload preset nếu muốn, rồi lấy `cloud_name`, `api_key`,
`api_secret` ở trang *API Keys*. Chữ ký được tạo ở server nên api_secret không bao giờ rời khỏi Render.

---

## Kiểm tra sau khi deploy

```bash
curl https://kaned-api.onrender.com/health
# {"status":"ok","env":"production",...}
```

Rồi trên web: đăng nhập, tải trang thư viện, lọc một bộ lọc, mở công cụ GPA và lưu điểm. Nếu đăng nhập
được nhưng tải lại trang thì mất session, nguyên nhân gần như luôn là `CORS_ORIGINS` chưa khớp origin
của Vercel — cookie refresh bị trình duyệt chặn.

## Lưu ý về gói free

- Render free service ngủ sau 15 phút không request; lần gọi đầu sau đó mất ~30 giây để thức.
- Render Postgres free hết hạn sau 90 ngày. Neon free không hết hạn nên phù hợp hơn nếu để lâu.
