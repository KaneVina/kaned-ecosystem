import { CircleAlert, CircleCheck, CircleDot, Clock, Lock, type LucideIcon } from 'lucide-react';
import type { SubjectStatus } from '@kaned/shared';

export const STATUS: Record<SubjectStatus, { label: string; tone: string; icon: LucideIcon; hint: string }> = {
  passed: { label: 'Đã qua', tone: 'green', icon: CircleCheck, hint: 'Đã hoàn thành môn này.' },
  available: { label: 'Học được', tone: 'violet', icon: CircleDot, hint: 'Đủ điều kiện, đăng ký được kỳ tới.' },
  in_progress: { label: 'Đang học', tone: 'amber', icon: Clock, hint: 'Đang học, chưa có điểm tổng kết.' },
  failed: { label: 'Chưa qua', tone: 'red', icon: CircleAlert, hint: 'Điểm dưới mức đạt, cần học lại.' },
  blocked: { label: 'Bị chặn', tone: 'gray', icon: Lock, hint: 'Chưa đủ điều kiện tiên quyết.' },
};

export const STATUS_ORDER: SubjectStatus[] = ['available', 'blocked', 'failed', 'in_progress', 'passed'];
