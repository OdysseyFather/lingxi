import { useState, useEffect, useCallback, useRef } from 'react';
import { Smartphone, Wifi, WifiOff, Check, X, Clock, Loader2, Shield, Eye } from 'lucide-react';

const STATUS_MAP = {
  pairing: { label: '配对中', color: 'text-amber-600', bg: 'bg-amber-50' },
  connected: { label: '已连接', color: 'text-green-600', bg: 'bg-green-50' },
  disconnected: { label: '已断开', color: 'text-red-600', bg: 'bg-red-50' },
};

export function MobileRemoteView() {
  const [status, setStatus] = useState('pairing');
  const [pairingInput, setPairingInput] = useState('');
  const [error, setError] = useState('');
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [agentProgress, setAgentProgress] = useState(null);
  const [recentMessages, setRecentMessages] = useState([]);
  const wsRef = useRef(null);
  const inputRefs = useRef([]);

  const handlePairingSubmit = useCallback(() => {
    if (pairingInput.length !== 6) {
      setError('请输入 6 位配对码');
      return;
    }
    setError('');
    setStatus('connected');
  }, [pairingInput]);

  const handleApproval = useCallback((id, approved) => {
    setPendingApprovals(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleInputChange = (index, value) => {
    if (value.length > 1) value = value.charAt(value.length - 1);
    const upper = value.toUpperCase();
    const newInput = pairingInput.split('');
    newInput[index] = upper;
    setPairingInput(newInput.join(''));
    if (upper && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pairingInput[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  if (status === 'pairing') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6 shadow-lg">
          <Smartphone size={28} className="text-amber-700" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">灵犀 · 远程接入</h1>
        <p className="text-sm text-gray-500 mb-8 text-center">输入桌面端显示的配对码</p>

        <div className="flex items-center gap-2 mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              ref={el => inputRefs.current[i] = el}
              type="text"
              inputMode="text"
              maxLength={1}
              value={pairingInput[i] || ''}
              onChange={e => handleInputChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className="w-11 h-14 text-center text-xl font-bold font-mono rounded-xl border-2 border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none bg-white transition"
            />
          ))}
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <button
          onClick={handlePairingSubmit}
          disabled={pairingInput.length < 6}
          className="w-full max-w-[280px] py-3 rounded-xl bg-amber-600 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-700 transition shadow-md"
        >
          连接
        </button>

        <p className="mt-6 text-xs text-gray-400 text-center leading-relaxed">
          配对码一次性有效，5 分钟后过期
          <br />连接后可远程审批和查看进度
        </p>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <WifiOff size={28} className="text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">连接已断开</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">
          请在桌面端重新生成配对码
        </p>
        <button
          onClick={() => { setStatus('pairing'); setPairingInput(''); }}
          className="px-6 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 transition"
        >
          重新配对
        </button>
      </div>
    );
  }

  // Connected view
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
          <Wifi size={14} className="text-green-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">灵犀 Coding</p>
          <p className="text-xs text-green-600">已连接 · 只读模式</p>
        </div>
        <button
          onClick={() => setStatus('disconnected')}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition"
        >
          断开
        </button>
      </header>

      {/* Agent Progress */}
      {agentProgress && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={13} className="text-amber-600 animate-spin" />
            <span className="text-xs font-medium text-gray-700">{agentProgress.label}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-500"
              style={{ width: `${agentProgress.percent}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {agentProgress.current}/{agentProgress.total} 步骤
          </p>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="mx-4 mt-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <Shield size={12} />
            <span>待审批 ({pendingApprovals.length})</span>
          </div>
          {pendingApprovals.map(item => (
            <div key={item.id} className="p-3 rounded-xl bg-white border border-amber-100 shadow-sm">
              <p className="text-xs font-medium text-gray-800 mb-1">{item.tool}</p>
              <p className="text-[10px] text-gray-500 mb-3 line-clamp-2">{item.description}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApproval(item.id, true)}
                  className="flex-1 py-2 rounded-lg bg-green-500 text-white text-xs font-medium flex items-center justify-center gap-1"
                >
                  <Check size={12} />
                  允许
                </button>
                <button
                  onClick={() => handleApproval(item.id, false)}
                  className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium flex items-center justify-center gap-1"
                >
                  <X size={12} />
                  拒绝
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Messages */}
      <div className="flex-1 px-4 mt-3 space-y-2 pb-20">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
          <Eye size={12} />
          <span>实时进度</span>
        </div>
        {recentMessages.length === 0 && (
          <div className="text-center py-12">
            <Clock size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">等待 Agent 活动...</p>
          </div>
        )}
        {recentMessages.map((msg, i) => (
          <div key={i} className="p-3 rounded-xl bg-white border border-gray-100">
            <p className="text-xs text-gray-700">{msg.text}</p>
            <p className="text-[10px] text-gray-400 mt-1">{msg.time}</p>
          </div>
        ))}
      </div>

      {/* Bottom safe area */}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </div>
  );
}
