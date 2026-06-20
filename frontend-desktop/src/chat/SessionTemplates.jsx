import { motion } from 'framer-motion';
import { Lightbulb, Languages, Mail, FileText, GraduationCap, Code2, BarChart3, MessageCircle } from 'lucide-react';
import { cn } from '../ui/cn';

const TEMPLATES = [
  { id: 'brainstorm', icon: Lightbulb, label: '头脑风暴', prompt: '帮我头脑风暴一下：', color: 'text-amber-500 bg-amber-50' },
  { id: 'translate', icon: Languages, label: '翻译', prompt: '请帮我翻译以下内容：', color: 'text-blue-500 bg-blue-50' },
  { id: 'email', icon: Mail, label: '写邮件', prompt: '帮我写一封邮件，主题是：', color: 'text-green-500 bg-green-50' },
  { id: 'summarize', icon: FileText, label: '总结文档', prompt: '请帮我总结以下内容的要点：', color: 'text-purple-500 bg-purple-50' },
  { id: 'learn', icon: GraduationCap, label: '学习辅导', prompt: '请用通俗易懂的方式解释：', color: 'text-rose-500 bg-rose-50' },
  { id: 'code', icon: Code2, label: '代码问题', prompt: '我有一个编程问题：', color: 'text-cyan-500 bg-cyan-50' },
  { id: 'analyze', icon: BarChart3, label: '数据分析', prompt: '帮我分析以下数据：', color: 'text-indigo-500 bg-indigo-50' },
  { id: 'free', icon: MessageCircle, label: '自由对话', prompt: '', color: 'text-gray-500 bg-gray-50' },
];

export default function SessionTemplates({ onSelect }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-lg font-semibold [color:var(--text)]">开始一段新对话</h2>
        <p className="text-sm [color:var(--text-soft)] mt-1">选择一个模板快速开始，或直接输入你想聊的内容</p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl w-full">
        {TEMPLATES.map((t, i) => {
          const Icon = t.icon;
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onSelect?.(t.prompt)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-xl border border-transparent',
                'hover:border-[var(--line)] hover:shadow-sm transition-all cursor-pointer',
                'active:scale-[0.97]'
              )}
            >
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', t.color)}>
                <Icon size={20} />
              </div>
              <span className="text-xs font-medium [color:var(--text)]">{t.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
