import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...args) {
  return twMerge(clsx(args));
}

// 检测 H5 移动端访问（微信浏览器 / URL 参数 / localStorage / sessionStorage / 触屏非桌面）
let _isH5MobileCache = null;
export function isH5Mobile() {
  if (_isH5MobileCache !== null) return _isH5MobileCache;
  if (typeof window === 'undefined') return false;
  if (window.location.search.includes('h5=1')) { _isH5MobileCache = true; return true; }
  try { if (localStorage.getItem('h5_mobile') === '1') { _isH5MobileCache = true; return true; } } catch {}
  try { if (sessionStorage.getItem('h5_mobile') === '1') { _isH5MobileCache = true; return true; } } catch {}
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('micromessenger') || ua.includes('weixin') || ua.includes(' qq/')) { _isH5MobileCache = true; return true; }
  if (!window.electronAPI && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) { _isH5MobileCache = true; return true; }
  _isH5MobileCache = false;
  return false;
}

