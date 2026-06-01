import { useState, useEffect, useCallback } from 'react';
import { Smartphone, QrCode, Copy, Check, Wifi, WifiOff, Shield, RefreshCw } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';

function generatePairingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function RemoteAccessPanel() {
  const [pairingCode, setPairingCode] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);

  const handleGenerate = useCallback(() => {
    const code = generatePairingCode();
    setPairingCode(code);
    setExpiresIn(300);
    setIsActive(true);
  }, []);

  useEffect(() => {
    if (!isActive || expiresIn <= 0) return;
    const timer = setInterval(() => {
      setExpiresIn(v => {
        if (v <= 1) {
          setIsActive(false);
          setPairingCode('');
          clearInterval(timer);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive, expiresIn]);

  const handleCopy = useCallback(() => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [pairingCode]);

  const handleDisconnect = useCallback(() => {
    setConnectedDevice(null);
    setIsActive(false);
    setPairingCode('');
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone size={16} className="text-[var(--accent)]" />
        <span className="text-[13px] font-medium text-[var(--text)]">远程接入</span>
        {connectedDevice && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-green-600">
            <Wifi size={10} />
            已连接
          </span>
        )}
      </div>

      {/* 已连接状态 */}
      {connectedDevice && (
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Smartphone size={14} className="text-green-600" />
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--text)]">{connectedDevice.name}</p>
              <p className="text-[10px] text-[var(--text-faint)]">已连接 {connectedDevice.since}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Shield size={11} className="text-green-600" />
            <span className="text-green-700">可审批权限请求 · 查看实时进度</span>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-[11px] text-red-500 hover:text-red-600 transition"
          >
            断开连接
          </button>
        </div>
      )}

      {/* 未连接 - 生成配对码 */}
      {!connectedDevice && (
        <div className="rounded-xl border border-[var(--coding-border)] p-4 space-y-3 text-center">
          {!isActive ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto">
                <QrCode size={22} className="text-[var(--accent)]" />
              </div>
              <p className="text-[12px] text-[var(--text-soft)]">
                生成配对码，在手机浏览器输入后即可远程查看和审批
              </p>
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition"
              >
                <RefreshCw size={13} />
                生成配对码
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-[var(--text-faint)]">在手机浏览器中输入配对码</p>
              <div className="flex items-center justify-center gap-1">
                {pairingCode.split('').map((char, i) => (
                  <span
                    key={i}
                    className="w-9 h-11 flex items-center justify-center text-[18px] font-bold font-mono text-[var(--text)] bg-[var(--coding-surface-raised)] rounded-lg border border-[var(--coding-border)]"
                  >
                    {char}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-center gap-3 text-[11px]">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[var(--accent)] hover:underline"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? '已复制' : '复制'}
                </button>
                <span className="text-[var(--text-faint)]">
                  {formatTime(expiresIn)} 后过期
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-faint)] leading-relaxed">
                访问 <span className="font-mono text-[var(--accent)]">http://本机IP:3001/h5</span> 并输入上方配对码
              </p>
            </>
          )}
        </div>
      )}

      {/* 安全说明 */}
      <div className="text-[10px] text-[var(--text-faint)] space-y-1 px-1">
        <p>· 配对码一次性有效，5 分钟后自动过期</p>
        <p>· 远程设备只能查看进度和审批，不能修改代码</p>
        <p>· 连接断开后需重新配对</p>
      </div>
    </div>
  );
}
