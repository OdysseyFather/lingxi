import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Send, ListChecks, Loader2 } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { ThemedButton } from './themed-containers';

/**
 * Non-blocking AskQuestion wizard.
 * Renders as a sticky panel above the composer (not in chat flow).
 * Agent process stays active during questioning.
 * Answers are submitted via submitCodingAnswerBatch API.
 * After submission: no new User Message is created, component becomes read-only summary.
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
  const containerRef = useRef(null);

  const parsedQuestions = useMemo(() => {
    return questions.map((q) => {
      if (typeof q === 'string') {
        try { return JSON.parse(q); } catch { return q; }
      }
      return q;
    });
  }, [questions]);

  const total = parsedQuestions.length;
  if (total === 0) return null;

  const allAnswered = parsedQuestions.every((q) => {
    const qId = q.id || `q_${parsedQuestions.indexOf(q)}`;
    return answers[qId] && answers[qId].trim();
  });

  const currentQ = parsedQuestions[currentIdx];
  if (!currentQ) return null;

  const questionId = currentQ.id || `q_${currentIdx}`;
  const currentAnswer = answers[questionId] || '';
  const isLastQuestion = currentIdx === total - 1;

  const handleNext = () => {
    if (isLastQuestion) {
      setShowSummary(true);
    } else {
      codingNextQuestion();
    }
  };

  const handleSubmit = () => {
    submitBatch();
    setShowSummary(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (submitted) return;
      if (e.key === 'ArrowRight' && currentAnswer) handleNext();
      if (e.key === 'ArrowLeft' && currentIdx > 0) codingPrevQuestion();
      if (e.key === 'Enter' && showSummary && allAnswered) handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="px-5 py-3 flex items-center gap-3"
      >
        <CheckCircle2 size={16} className="text-green-500" />
        <span className="text-[13px] text-green-600 font-medium">All answers submitted, agent continuing...</span>
        <Loader2 size={14} className="text-[var(--accent)] animate-spin ml-auto" />
      </motion.div>
    );
  }

  if (showSummary) {
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

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ ease: [0.16, 1, 0.3, 1] }}
      className="px-4 py-3"
    >
      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={14} className="text-[var(--accent)]" />
        <span className="text-[12px] font-medium text-[var(--text-soft)]">
          Question {currentIdx + 1} / {total}
        </span>
        <div className="flex gap-1 ml-2">
          {parsedQuestions.map((_, i) => {
            const qId = (parsedQuestions[i]?.id) || `q_${i}`;
            const answered = !!answers[qId];
            return (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  i === currentIdx ? 'bg-[var(--accent)] scale-125' :
                  answered ? 'bg-green-400' : 'bg-[var(--coding-border)]'
                )}
              />
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="flex-1 h-1 bg-[var(--coding-border)] rounded-full overflow-hidden ml-2">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question content */}
      <QuestionCard
        question={currentQ}
        questionId={questionId}
        answer={currentAnswer}
        onAnswer={(val) => setCodingAnswer(questionId, val)}
      />

      {/* Navigation */}
      <div className="flex items-center gap-2 mt-3">
        <ThemedButton
          variant="ghost"
          disabled={currentIdx === 0}
          onClick={codingPrevQuestion}
        >
          <ChevronLeft size={14} className="mr-1" />
          Previous
        </ThemedButton>
        <div className="flex-1" />
        <ThemedButton
          variant="primary"
          disabled={!currentAnswer}
          onClick={handleNext}
        >
          {isLastQuestion ? (
            <>Review & Submit<Send size={12} className="ml-1.5" /></>
          ) : (
            <>Next<ChevronRight size={13} className="ml-1" /></>
          )}
        </ThemedButton>
      </div>
    </motion.div>
  );
}

function QuestionCard({ question, questionId, answer, onAnswer }) {
  const [customText, setCustomText] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const optionsRef = useRef([]);

  const title = question.title || question.question || '';
  const options = question.options || [];
  const allowCustom = question.allow_custom !== false;

  const handleSelect = (optId) => {
    const opt = options.find(o => o.id === optId);
    onAnswer(opt?.label || optId);
    setCustomText('');
  };

  const handleCustom = (val) => {
    setCustomText(val);
    onAnswer(val);
  };

  // Keyboard: ArrowUp/Down to navigate options, Enter to select
  useEffect(() => {
    const handler = (e) => {
      if (options.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx(i => Math.min(i + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < options.length) {
        e.preventDefault();
        handleSelect(options[focusedIdx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div>
      <h3 className="text-[14px] font-bold text-[var(--text)] mb-3">{title}</h3>

      {options.length > 0 && (
        <div className="space-y-1.5">
          {options.map((opt, idx) => {
            const optLabel = opt.label || opt.id;
            const isSelected = answer === optLabel && !customText;
            const isFocused = idx === focusedIdx;
            return (
              <button
                key={opt.id}
                ref={el => optionsRef.current[idx] = el}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 rounded-xl border-2 transition-all text-[13px]',
                  isSelected
                    ? 'border-[var(--coding-border-active)] bg-[var(--accent-soft)]'
                    : isFocused
                    ? 'border-[var(--text-faint)] bg-[var(--coding-surface)]'
                    : 'border-[var(--coding-border)] hover:border-[var(--text-faint)] bg-[var(--coding-surface-raised)]'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0">
                    {isSelected ? <CheckCircle2 size={16} className="text-[var(--accent)]" /> : <Circle size={16} className="text-[var(--text-faint)]" />}
                  </span>
                  <span className="font-medium text-[var(--text)]">{optLabel}</span>
                  {opt.recommended && <span className="text-[10px] text-[var(--accent)] font-medium">(recommended)</span>}
                </div>
                {(opt.desc || opt.description) && (
                  <div className="text-[11px] text-[var(--text-faint)] mt-0.5 ml-[30px]">{opt.desc || opt.description}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {allowCustom && (
        <div className="mt-3">
          <input
            type="text"
            value={customText}
            onChange={(e) => handleCustom(e.target.value)}
            placeholder={options.length > 0 ? 'Or type custom response...' : 'Your answer...'}
            className="w-full px-4 py-2.5 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] text-[13px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition"
          />
        </div>
      )}
    </div>
  );
}

function SummaryView({ questions, answers, onBack, onSubmit, allAnswered }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={14} className="text-[var(--accent)]" />
        <span className="text-[13px] font-bold text-[var(--text-soft)]">Review your answers</span>
      </div>

      <div className="space-y-2 mb-3 max-h-[200px] overflow-auto">
        {questions.map((q, i) => {
          const qId = q.id || `q_${i}`;
          const qTitle = q.title || q.question || `Question ${i + 1}`;
          const ans = answers[qId] || '';
          return (
            <div key={qId} className="rounded-lg border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] p-3">
              <div className="text-[11px] text-[var(--text-faint)] mb-1">Q{i + 1}: {qTitle}</div>
              <div className="text-[13px] text-[var(--text)] font-medium flex items-center gap-2">
                {ans ? (
                  <><CheckCircle2 size={13} className="text-green-500 shrink-0" /><span>{ans}</span></>
                ) : (
                  <span className="text-[var(--text-faint)] italic">Not answered</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <ThemedButton variant="ghost" onClick={onBack}>
          <ChevronLeft size={13} className="mr-1" />
          Back
        </ThemedButton>
        <div className="flex-1" />
        <ThemedButton variant="primary" disabled={!allAnswered} onClick={onSubmit}>
          <Send size={12} className="mr-1.5" />
          Confirm & Submit All
        </ThemedButton>
      </div>
    </div>
  );
}
