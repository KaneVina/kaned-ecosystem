import { CircleAlert, EyeOff, ShieldCheck } from 'lucide-react';
import type { LinkProvider } from '@kaned/shared';
import { cn } from '@/lib/cn';

export interface InternalValue {
  internal: boolean;
  allowDownload: boolean;
  allowShare: boolean;
}

/**
 * "Lưu hành nội bộ" settings for the upload form and the admin editor.
 * YouTube and Canva links are always hidden in this mode; other links and
 * files can allow or forbid downloading; sharing can be turned off.
 */
export function InternalFields({
  value,
  onChange,
  source,
  provider,
}: {
  value: InternalValue;
  onChange: (next: InternalValue) => void;
  source: 'file' | 'link' | 'github';
  provider?: LinkProvider | null;
}) {
  const alwaysHidden = source === 'link' && (provider?.id === 'youtube' || provider?.id === 'canva');
  const embeddable = Boolean(provider?.embedUrl || provider?.needsResolve);
  const set = (patch: Partial<InternalValue>) => onChange({ ...value, ...patch });

  return (
    <div className={cn('int-box', value.internal && 'is-on')}>
      <label className="switch-row int-main">
        <span>
          <b>
            <ShieldCheck className="ic ic-sm" />
            Lưu hành nội bộ
          </b>
          <small>
            Chỉ thành viên Kaned đã đăng nhập mới xem được, tài liệu mang dấu “Nội bộ”. Bạn chọn được có cho tải về hay chia sẻ hay không.
          </small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={value.internal}
          onChange={(e) => onChange(e.target.checked ? { internal: true, allowDownload: false, allowShare: false } : { internal: false, allowDownload: true, allowShare: true })}
        />
      </label>

      {value.internal && (
        <div className="int-opts">
          {alwaysHidden ? (
            <p className="int-note">
              <EyeOff className="ic ic-sm" />
              <span>
                Link {provider?.id === 'youtube' ? 'YouTube' : 'Canva'} được <b>ẩn hoàn toàn</b>: người xem chỉ xem trong Kaned
                {provider?.id === 'youtube' ? ' bằng trình phát riêng, không bấm được sang YouTube' : ', không mở được sang Canva'}, và không thấy hay sao chép được link gốc.
              </span>
            </p>
          ) : source === 'github' ? (
            <p className="int-note">
              <CircleAlert className="ic ic-sm" />
              <span>Liên kết GitHub vẫn hiện, vì người xem cần nó để tải tệp từ GitHub.</span>
            </p>
          ) : (
            <label className="switch-row">
              <span>
                <b>{source === 'link' ? 'Cho phép mở liên kết gốc' : 'Cho phép tải về'}</b>
                <small>
                  {source === 'link'
                    ? embeddable
                      ? 'Khi tắt, liên kết gốc được ẩn: người xem chỉ xem bên trong Kaned.'
                      : 'Liên kết này không hiện được bên trong Kaned, nên khi tắt, người khác sẽ không mở được tài liệu.'
                    : 'Khi tắt, người xem chỉ đọc trong Kaned: không có nút tải, không thấy đường dẫn tệp.'}
                </small>
              </span>
              <input type="checkbox" className="switch" checked={value.allowDownload} onChange={(e) => set({ allowDownload: e.target.checked })} />
            </label>
          )}
          {source === 'link' && !alwaysHidden && !embeddable && !value.allowDownload && (
            <p className="int-note is-warn">
              <CircleAlert className="ic ic-sm" />
              <span>Chỉ bạn và quản trị viên mở được liên kết này. Bật “Cho phép mở liên kết gốc” nếu muốn người khác xem.</span>
            </p>
          )}
          <label className="switch-row">
            <span>
              <b>Cho phép chia sẻ</b>
              <small>Hiện nút Chia sẻ để sao chép đường dẫn trang tài liệu. Dù bật, chỉ thành viên đã đăng nhập mới mở được.</small>
            </span>
            <input type="checkbox" className="switch" checked={value.allowShare} onChange={(e) => set({ allowShare: e.target.checked })} />
          </label>
        </div>
      )}
    </div>
  );
}
