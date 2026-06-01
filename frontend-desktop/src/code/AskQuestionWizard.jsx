import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, ChevronLeft, ChevronRight, Circle, Send, ListChecks,
  Loader2, MessageSquare, Sparkles,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { ThemedButton } from './themed-containers';

/**
 * Non-blocking AskQuestion wizard with inline overlay design.
 * Renders above the composer with glassmorphism backdrop.
 * Agent process stays active during questioning.
 */
export function AskQuestionWizard() {
  const questions = useStore((s) => s.codingPendingQuestions);
  const currentIdx = useStore((s) => s.codingCurrentQuestionIdx);
  const answers = useStore((s) => s.codingAnswers);
  const submitted = useStore((s) => s.codingQuestionsSubmitted);
  const setCodingAnswer = useStore((s) => s.setCodingAnswer);
  const codingNextQuestion = useStore((s) => s.codingNextQuestion);
  const codingPrevQuestion = useStore((s) => s.codingPrevQuestion);
  const submitBatch = useStore((s) => s.submitCodingAnswerBatch);

  const [showSummary, setShowSummary] = useState(false);

  const parsedQuestions = useMemo(() => {
    return questions.map((q) => {
      if (typeof q === 'string') {
        try { return JSON.parse(q); } catch { return q; }
      }
      return q;
    });
  }, [questions]);

  const total = parsedQuestions.length;

  const allAnswered = total > 0 && parsedQuestions.every((q, i) => {
    const qId = q.id || `q_${i}`;
    return answers[qId] && answers[qId].trim();
  });

  const currentQ = total > 0 ? parsedQuestions[currentIdx] : null;

  const questionId = currentQ ? (currentQ.id || `q_${currentIdx}`) : '';
  const currentAnswer = answers[questionId] || '';
  const isLastQuestion = currentIdx === total - 1;

  const handleNext = useCallback(() => {
    if (isLastQuestion) {
      setShowSummary(true);
    } else {
      codingNextQuestion();
    }
  }, [isLastQuestion, codingNextQuestion]);

  const handleSubmit = useCallback(() => {
    submitBatch();
    setShowSummary(false);
  }, [submitBatch]);

  // Keyboard shortcuts — must be called unconditionally (Rules of Hooks)
  useEffect(() => {
    if (total === 0 && !submitted) return;
    const handler = (e) => {
      if (submitted) return;
      if (e.key === 'ArrowRight' && currentAnswer) handleNext();
      if (e.key === 'ArrowLeft' && currentIdx > 0) codingPrevQuestion();
      if (e.key === 'Enter' && showSummary && allAnswered) handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [total, submitted, currentAnswer, handleNext, currentIdx, codingPrevQuestion, showSummary, allAnswered, handleSubmit]);

  if (total === 0 && !submitted) return null;

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="px-5 py-3 flex items-center gap-3 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15 }}
        >
          <CheckCircle2 size={18} className="text-emerald-500" />
        </motion.div>
        <span className="text-[13px] text-emerald-600 font-medium">All answers submitted</span>
        <span className="text-[12px] text-[var(--text-faint)]">Agent continuing...</span>
        <Loader2 size={14} className="text-[var(--accent)] animate-spin ml-auto" />
      </motion.div>
    );
  }

  if (showSummary && total > 0) {
    return (
      <SummaryView
        questions={parsedQuestions}
        answers={answers}
        onBack={() => setShowSummary(false)}
        onSubmit={handleSubmit}
        allAnswered={allAnswered}
      />
    );
  }

  if (!currentQ) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
      className="px-4 py-4 relative max-w-2xl mx-auto"
    >
      {/* Decorative top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />

      {/* Header with progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
          <MessageSquare size={14} className="text-[var(--accent)]" />
        </div>
        <div className="flex-1">
          <span className="text-[13px] font-semibold text-[var(--text)]">
            Question {currentIdx + 1} of {total}
          </span>
          <div className="flex gap-1 mt-1.5">
            {parsedQuestions.map((_, i) => {
              const qId = (parsedQuestions[i]?.id) || `q_${i}`;
              const answered = !!answers[qId];
              return (
                <motion.div
                  key={i}
                  animate={{
                    scale: i === currentIdx ? 1 : 0.85,
                    opacity: i === currentIdx ? 1 : 0.7,
                  }}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === currentIdx ? 'bg-[var(--accent)] w-6' :
                    answered ? 'bg-emerald-400 w-3' : 'bg-[var(--coding-border)] w-3'
                  )}
                />
              );
            })}
          </div>
        </div>
        {/* Elapsed progress */}
        <div className="text-[11px] text-[var(--text-faint)] font-mono">
          {Object.keys(answers).filter(k => answers[k]).length}/{total} answered
        </div>
      </div>

      {/* Question content with animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <QuestionCard
            question={currentQ}
            questionId={questionId}
            answer={currentAnswer}
            onAnswer={(val) => setCodingAnswer(questionId, val)}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--coding-border)]/30">
        <ThemedButton
          variant="ghost"
          disabled={currentIdx === 0}
          onClick={codingPrevQuestion}
          className="text-[12px]"
        >
          <ChevronLeft size={13} className="mr-0.5" />
          Previous
        </ThemedButton>
        <div className="flex-1" />
        <ThemedButton
          variant="primary"
          disabled={!currentAnswer}
          onClick={handleNext}
          className="text-[12px]"
        >
          {isLastQuestion ? (
            <>Review & Submit <Send size={11} className="ml-1.5" /></>
          ) : (
            <>Next <ChevronRight size={12} className="ml-0.5" /></>
          )}
        </ThemedButton>
      </div>
    </motion.div>
  );
}

function QuestionCard({ question, questionId, answer, onAnswer }) {
  const [customText, setCustomText] = useState('');
  const inputRef = useRef(null);

  const rawTitle = question.title || question.question || question.prompt || '';
  const title = typeof rawTitle === 'string' ? rawTitle : JSON.stringify(rawTitle);
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const allowCustom = question.allow_custom !== false;

  // Normalize options to always be {id, label, desc?, recommended?}
  const options = useMemo(() => rawOptions.map((opt, i) => {
    if (typeof opt === 'string') {
      return { id: `opt_${i}`, label: opt };
    }
    return {
      id: opt.id || `opt_${i}`,
      label: opt.label || opt.text || opt.value || opt.id || `Option ${i + 1}`,
      desc: opt.desc || opt.description || '',
      recommended: !!opt.recommended,
    };
  }), [rawOptions]);

  useEffect(() => {
    if (options.length === 0 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [questionId, options.length]);

  const handleSelect = (optId) => {
    const opt = options.find(o => o.id === optId);
    onAnswer(opt?.label || optId);
    setCustomText('');
  };

  const handleCustom = (val) => {
    setCustomText(val);
    onAnswer(val);
  };

  return (
    <div className="max-w-xl">
      <h3 className="text-[14px] font-bold text-[var(--text)] mb-3 leading-snug">{title}</h3>

      {options.length > 0 && (
        <div className="space-y-1.5">
          {options.map((opt) => {
            const isSelected = answer === opt.label && !customText;
            return (
              <motion.button
                key={opt.id}
                whileHover={{ scale: 1.005, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 rounded-xl border-2 transition-all duration-200 text-[13px]',
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm'
                    : 'border-[var(--coding-border)] hover:border-[var(--text-faint)]/50 bg-[var(--coding-surface-raised)]'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0">
                    {isSelected
                      ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}>
                          <CheckCircle2 size={16} className="text-[var(--accent)]" />
                        </motion.div>
                      : <Circle size={16} className="text-[var(--text-faint)]" />
                    }
                  </span>
                  <span className="font-medium text-[var(--text)]">{opt.label}</span>
                  {opt.recommended && (
                    <span className="text-[10px] text-[var(--accent)] font-semibold flex items-center gap-0.5">
                      <Sparkles size={9} /> recommended
                    </span>
                  )}
                </div>
                {opt.desc && (
                  <div className="text-[11px] text-[var(--text-faint)] mt-0.5 ml-[30px]">{opt.desc}</div>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {allowCustom && (
        <div className="mt-3">
          <input
            ref={inputRef}
            type="text"
            value={customText}
            onChange={(e) => handleCustom(e.target.value)}
            placeholder={options.length > 0 ? 'Or type a custom response...' : 'Type your answer...'}
            className={cn(
              'w-full px-4 py-2.5 rounded-xl border border-[var(--coding-border)] text-[13px] text-[var(--text)] placeholder-[var(--text-faint)]',
              'outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all duration-200',
              'bg-[var(--coding-surface-raised)]'
            )}
          />
        </div>
      )}
    </div>
  );
}

function SummaryView({ questions, answers, onBack, onSubmit, allAnswered }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-4 max-w-2xl mx-auto"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <ListChecks size={14} className="text-emerald-500" />
        </div>
        <span className="text-[14px] font-bold text-[var(--text)]">Review your answers</span>
      </div>

      <div className="space-y-2 mb-4 max-h-[200px] overflow-auto scrollable">
        {questions.map((q, i) => {
          const qId = q.id || `q_${i}`;
          const rawQTitle = q.title || q.question || q.prompt || `Question ${i + 1}`;
          const qTitle = typeof rawQTitle === 'string' ? rawQTitle : JSON.stringify(rawQTitle);
          const ans = answers[qId] || '';
          return (
            <motion.div
              key={qId}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-[var(--coding-border)]/60 bg-[var(--coding-surface-raised)] p-3"
            >
              <div className="text-[11px] text-[var(--text-faint)] mb-1 font-medium">Q{i + 1}: {qTitle}</div>
              <div className="text-[13px] text-[var(--text)] font-medium flex items-center gap-2">
                {ans ? (
                  <><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /><span>{ans}</span></>
                ) : (
                  <span className="text-[var(--text-faint)] italic">Not answered</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-[var(--coding-border)]/30">
        <ThemedButton variant="ghost" onClick={onBack} className="text-[12px]">
          <ChevronLeft size={13} className="mr-0.5" />
          Back to edit
        </ThemedButton>
        <div className="flex-1" />
        <ThemedButton variant="primary" disabled={!allAnswered} onClick={onSubmit} className="text-[12px]">
          <Send size={11} className="mr-1.5" />
          Confirm & Submit
        </ThemedButton>
      </div>
    </motion.div>
  );
}
