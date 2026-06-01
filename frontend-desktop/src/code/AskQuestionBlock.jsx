import { useState, useCallback, useMemo } from 'react';
import { CheckCircle2, Circle, Send } from 'lucide-react';
import { cn } from '../ui/cn';

export function AskQuestionBlock({ question, options: rawOptions, allowCustom, onSubmit, submitted }) {
  const [selected, setSelected] = useState(null);
  const [customText, setCustomText] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(submitted || false);

  // Normalize options to always be {id, label, description?, recommended?}
  const options = useMemo(() => (rawOptions || []).map((opt, i) => {
    if (typeof opt === 'string') {
      return { id: `opt_${i}`, label: opt, value: opt };
    }
    return {
      id: opt.id || `opt_${i}`,
      label: opt.label || opt.text || opt.value || `Option ${i + 1}`,
      value: opt.value || opt.label || opt.text || `Option ${i + 1}`,
      description: opt.description || opt.desc || '',
      recommended: !!opt.recommended,
    };
  }), [rawOptions]);

  const handleSubmit = useCallback(() => {
    if (isSubmitted) return;
    const answer = selected || customText.trim();
    if (!answer) return;
    setIsSubmitted(true);
    onSubmit?.(answer);
  }, [selected, customText, isSubmitted, onSubmit]);

  return (
    <div className="my-4 rounded-xl border border-[var(--coding-border)]/60 bg-[var(--coding-surface-raised)] overflow-hidden max-w-xl">
      <div className="px-5 py-4">
        <h3 className="text-[15px] font-bold text-[var(--text)] mb-4">{typeof question === 'string' ? question : JSON.stringify(question)}</h3>

        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.id}
                onClick={() => !isSubmitted && setSelected(opt.value)}
                disabled={isSubmitted}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl border-2 transition-all',
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--coding-border)] hover:border-[var(--text-faint)]/50 bg-[var(--coding-surface-raised)]',
                  isSubmitted && 'opacity-70 cursor-default'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    {isSelected ? (
                      <CheckCircle2 size={18} className="text-[var(--accent)]" />
                    ) : (
                      <Circle size={18} className="text-[var(--text-faint)]" />
                    )}
                  </span>
                  <div>
                    <div className="text-[14px] font-medium text-[var(--text)]">
                      {opt.label}
                      {opt.recommended && <span className="ml-2 text-[11px] text-[var(--accent)] font-normal">(推荐)</span>}
                    </div>
                    {opt.description && (
                      <div className="text-[12px] text-[var(--text-faint)] mt-0.5">{opt.description}</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {allowCustom !== false && (
          <div className="mt-4">
            <div className="text-[12px] text-[#999] mb-1.5">Or type a custom response:</div>
            <input
              type="text"
              value={customText}
              onChange={(e) => { setCustomText(e.target.value); setSelected(null); }}
              placeholder="Type your answer..."
              disabled={isSubmitted}
              className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[14px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition disabled:opacity-70"
            />
          </div>
        )}
      </div>

      {!isSubmitted && (
        <div className="px-5 pb-4">
          <button
            onClick={handleSubmit}
            disabled={!selected && !customText.trim()}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium transition',
              (selected || customText.trim())
                ? 'bg-[#c4a882] text-white hover:bg-[#b09670]'
                : 'bg-[#f0ebe6] text-[#ccc] cursor-default'
            )}
          >
            <Send size={13} />
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
