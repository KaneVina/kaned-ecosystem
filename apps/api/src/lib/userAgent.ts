/**
 * Browser, OS and device from a User-Agent string — enough for an admin to
 * read "Cốc Cốc · Windows · Máy tính", without a parsing library.
 */
export interface Device {
  browser: string | null;
  os: string | null;
  device: 'desktop' | 'mobile' | 'tablet' | null;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/coc_coc_browser\//i, 'Cốc Cốc'],
  [/edg(e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser\//i, 'Samsung Internet'],
  [/zalo/i, 'Zalo'],
  [/fban|fbav|fb_iab/i, 'Facebook'],
  [/firefox\/|fxios\//i, 'Firefox'],
  [/crios\//i, 'Chrome'],
  [/chrome\/|chromium\//i, 'Chrome'],
  [/safari\//i, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/windows nt/i, 'Windows'],
  [/iphone|ipad|ipod/i, 'iOS'],
  [/android/i, 'Android'],
  [/cros/i, 'ChromeOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/linux/i, 'Linux'],
];

export function parseUserAgent(ua: string | undefined | null): Device {
  if (!ua) return { browser: null, os: null, device: null };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  const tablet = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
  const mobile = !tablet && /mobi|iphone|ipod|android/i.test(ua);
  return { browser, os, device: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop' };
}
