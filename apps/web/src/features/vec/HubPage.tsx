import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, GraduationCap, History, MonitorPlay, Presentation, Radio } from 'lucide-react';
import { PageHead } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { useVecMe } from './api';
import './vec.css';

export default function HubPage() {
  const me = useVecMe();
  const active = me.data?.attempt;
  const hosting = me.data?.hosting ?? [];
  return (
    <>
      <PageHead title="Phòng thi ảo" description="Tổ chức và tham gia kỳ thi trắc nghiệm trực tuyến có giám sát, chấm điểm tự động ngay trên Kaned." />
      <div className="container vec-body">
        {active && (
          <Link to={`/app/vec/room/${active.id}`} className="vec-resume">
            <Radio className="ic" />
            <span><b>Bạn đang có bài thi chưa hoàn tất</b><small>{active.title} – bấm để quay lại phòng thi</small></span>
            <ArrowRight className="ic" />
          </Link>
        )}
        <div className="vec-hub">
          <Link to="/app/vec/student" className="vec-role vec-role-student">
            <span className="vec-role-ic"><GraduationCap className="ic ic-lg" /></span>
            <h2>Tôi là sinh viên</h2>
            <p>Nhập mã phòng 7 chữ số từ giảng viên, xác nhận thông tin rồi vào phòng chờ.</p>
            <span className="vec-role-go">Vào phòng thi <ArrowRight className="ic" /></span>
          </Link>
          <Link to="/app/vec/lecturer" className="vec-role vec-role-lecturer">
            <span className="vec-role-ic"><Presentation className="ic ic-lg" /></span>
            <h2>Tôi là giảng viên</h2>
            <p>Tạo phiên thi từ bộ đề có sẵn hoặc file .md, theo dõi thí sinh, mở khóa, chấm và xuất điểm.</p>
            <span className="vec-role-go">Quản lý phiên thi <ArrowRight className="ic" /></span>
          </Link>
        </div>

        <h3 className="vec-h3">Hình thức thi</h3>
        <div className="vec-kinds">
          <div className="vec-kind">
            <ClipboardCheck className="ic" />
            <div><b>FE – Trắc nghiệm</b><p>Câu hỏi một hoặc nhiều đáp án, đảo câu và đáp án, chấm điểm tại máy chủ.</p></div>
            <Badge tone="green">Sẵn sàng</Badge>
          </div>
          <div className="vec-kind is-soon">
            <MonitorPlay className="ic" />
            <div><b>PE – Thực hành</b><p>Đề thực hành, nộp tệp bài làm, chấm thủ công.</p></div>
            <Badge tone="gray">Sắp có</Badge>
          </div>
        </div>

        {hosting.length > 0 && (
          <>
            <h3 className="vec-h3">Phiên bạn đang tổ chức</h3>
            <ul className="vec-minilist">
              {hosting.slice(0, 4).map((h) => (
                <li key={h.id}><Link to={`/app/vec/lecturer/${h.id}`}><b>{h.title}</b><Badge tone={h.status === 'LIVE' ? 'green' : h.status === 'PAUSED' ? 'amber' : 'violet'}>{STATUS[h.status] ?? h.status}</Badge></Link></li>
              ))}
            </ul>
          </>
        )}
        <p className="vec-foot"><Link to="/app/vec/history"><History className="ic ic-sm" /> Lịch sử thi</Link></p>
      </div>
    </>
  );
}

export const STATUS: Record<string, string> = { SCHEDULED: 'Sắp diễn ra', LOBBY: 'Đang mở phòng chờ', LIVE: 'Đang thi', PAUSED: 'Tạm dừng', ENDED: 'Đã kết thúc', CANCELLED: 'Đã hủy' };
