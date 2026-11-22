import { Router } from 'express';

/**
 * The banner across the top of every page. Open pages ask for it every
 * 20 seconds, so a new text shows up without anyone reloading. Change the
 * id to show it again to people who closed the previous one; null hides it.
 */
export const ANNOUNCEMENT: { id: string; text: string } | null = {
  id: '2026-11-22-nang-cap-phong-thi-ao',
  text: 'Thông báo bảo trì: Từ 00:00 ngày 22/11 đến hết ngày 25/11, Kaned nâng cấp hệ thống để ra mắt tính năng Phòng thi ảo. Trong thời gian này, website vẫn truy cập bình thường nhưng có thể xuất hiện độ trễ hoặc mất dữ liệu thao tác vừa thực hiện. Quý khách vui lòng hạn chế các thao tác quan trọng. Phòng thi ảo sẽ sẵn sàng sử dụng đầy đủ sau ngày 25/11. Xin chân thành cảm ơn sự thông cảm của quý khách!',
};

export const announcementRouter = Router();

announcementRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(ANNOUNCEMENT);
});
