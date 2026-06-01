import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldCheck, ChevronDown, ChevronRight, Check, X, AlertTriangle, Eye } from 'lucide-react';
import { cn } from '../ui/cn';
import { getToolRiskLevel, RISK_META } from './permissionConfig';

export function PermissionBlock({ toolName, input, onAllow, onAllowSession, onDeny, resolved }) {
  const [showInput, setShowInput] = useState(false);
  const [decision, setDecision] = useState(resolved || null);
  const riskLevel = getToolRiskLevel(toolName);
  const riskMeta = RISK_META[riskLevel];

  const handleAllow = useCallback(() => {
    setDecision('allowed');
    onAllow?.();
  }, [onAllow]);

  const handleAllowSession = useCallback(() => {
    setDecision('allowed_session');
    onAllowSession?.();
  }, [onAllowSession]);

  const handleDeny = useCallback(() => {
    setDecision('denied');
    onDeny?.();
  }, [onDeny]);

  const inputPreview = typeof input === 'string'
    ? (input.length > 150 ? input.slice(0, 150) + '...' : input)
    : JSON.stringify(input)?.slice(0, 150);

  // Low risk: minimal inline notification
  if (riskLevel === 'low' && !decision) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/50 border border-emerald-200/50 text-[12px]"
      >
        <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
        <span className="text-emerald-700">Auto-approved: <span className="font-mono font-medium">{toolName}</span></span>
        {inputPreview && (
          <span className="text-emerald-600/60 truncate max-w-[200px] font-mono text-[11px]">{inputPreview}</span>
        )}
      </motion.div>
    );
  }

  // Resolved state: compact feedback
  if (decision) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'my-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all',
          decision === 'denied'
            ? 'bg-red-50/50 border-red-200/50'
            : 'bg-[var(--coding-surface-raised)] border-[var(--coding-border)]/50'
        )}
      >
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 15 }}
        >
          {decision === 'denied'
            ? <X size={15} className="text-red-400" />
            : <ShieldCheck size={15} className="text-emerald-500" />
          }
        </motion.div>
        <span className="text-[13px] text-[var(--text-soft)]">
          <span className="font-mono font-semibold text-[var(--text)]">{toolName}</span>
        </span>
        <span className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
          decision === 'allowed' && 'text-emerald-600 bg-emerald-50',
          decision === 'allowed_session' && 'text-emerald-600 bg-emerald-50',
          decision === 'denied' && 'text-red-500 bg-red-50'
        )}>
          {decision === 'allowed' ? 'Allowed' : decision === 'allowed_session' ? 'Session' : 'Denied'}
        </span>
      </motion.div>
    );
  }

  // Medium risk: confirmation bar above chat
  if (riskLevel === 'medium') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="my-3 rounded-xl border-2 border-amber-300/60 bg-amber-50/40 backdrop-blur-sm overflow-hidden shadow-sm"
      >
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Shield size={14} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <span className="text-[13px] font-semibold text-[var(--text)]">
                Allow <span className="font-mono text-amber-700">{toolName}</span>?
              </span>
              <div className="text-[11px] text-amber-600/70 mt-0.5">{riskMeta.description}</div>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full uppercase">
              Awaiting
            </span>
          </div>

          {input && (
            <ExpandableInput
              showInput={showInput}
              onToggle={() => setShowInput(v => !v)}
              inputPreview={inputPreview}
              input={input}
              colorScheme="amber"
            />
          )}

          <div className="flex items-center gap-2 mt-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAllow}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-[12px] font-semibold hover:bg-amber-600 transition-colors shadow-sm"
            >
              <Check size={12} />
              Allow
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAllowSession}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 text-[12px] font-semibold hover:bg-amber-200 transition-colors"
            >
              <Shield size={12} />
              Always allow
            </motion.button>
            <div className="flex-1" />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDeny}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-red-500 text-[12px] font-medium hover:bg-red-50 transition-colors"
            >
              <X size={12} />
              Deny
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  // High risk: full modal-style blocking card with danger emphasis
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 20 }}
      className="my-4 rounded-xl border-2 border-red-300/60 bg-red-50/30 backdrop-blur-sm overflow-hidden shadow-lg"
    >
      <div className="px-5 py-4">
        {/* Danger header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-bold text-[var(--text)]">
              High-risk operation
            </div>
            <div className="text-[12px] text-red-600/80 mt-0.5">
              <span className="font-mono font-semibold">{toolName}</span> — {riskMeta.description}
            </div>
          </div>
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-[10px] font-bold text-red-500 bg-red-100 px-2.5 py-1 rounded-full uppercase tracking-wider"
          >
            Requires Approval
          </motion.span>
        </div>

        {/* Dangerous input preview */}
        {input && (
          <ExpandableInput
            showInput={showInput}
            onToggle={() => setShowInput(v => !v)}
            inputPreview={inputPreview}
            input={input}
            colorScheme="red"
            forceExpand
          />
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-red-200/50">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAllow}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors shadow-sm"
          >
            <Check size={13} />
            Allow {toolName}
          </motion.button>
          <div className="flex-1" />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDeny}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-red-200 text-red-500 text-[13px] font-semibold hover:bg-red-50 transition-colors"
          >
            <X size={13} />
            Deny
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function ExpandableInput({ showInput, onToggle, inputPreview, input, colorScheme = 'amber', forceExpand }) {
  const bgMap = { amber: 'bg-amber-50', red: 'bg-red-50/50' };
  const borderMap = { amber: 'border-amber-200/50', red: 'border-red-200/50' };
  const textMap = { amber: 'text-amber-800/70', red: 'text-red-800/70' };

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
      >
        {showInput ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Eye size={11} />
        <span>{showInput ? 'Hide details' : 'View details'}</span>
      </button>
      <AnimatePresence>
        {(showInput || forceExpand) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn(
              'mt-1.5 px-3 py-2.5 rounded-lg border text-[12px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto scrollable',
              bgMap[colorScheme], borderMap[colorScheme], textMap[colorScheme]
            )}>
              {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!showInput && !forceExpand && inputPreview && (
        <div className={cn(
          'mt-1.5 px-3 py-2 rounded-lg text-[11px] font-mono truncate',
          bgMap[colorScheme], textMap[colorScheme]
        )}>
          {inputPreview}
        </div>
      )}
    </div>
  );
}
