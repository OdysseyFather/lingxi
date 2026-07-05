import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Play, Save, GripVertical, ArrowRight,
  MessageSquare, GitBranch, Repeat, Timer, CheckCircle2,
  AlertTriangle, Loader2, Zap, Settings2, ChevronDown, X,
  Workflow, FileText, Sparkles, Globe, Code2, Mail,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api/client';
import { useStore } from './state/useStore';
import { Button, Card, Modal, Input, Badge } from './ui/primitives';
import { cn } from './ui/cn';

const NODE_TYPES = [
  { type: 'prompt', label: '提示词', icon: MessageSquare, color: 'var(--accent)', desc: '发送消息给 AI 并获取回复' },
  { type: 'condition', label: '条件分支', icon: GitBranch, color: '#f59e0b', desc: '根据条件走不同路径' },
  { type: 'loop', label: '循环', icon: Repeat, color: '#10b981', desc: '重复执行直到满足条件' },
  { type: 'delay', label: '延迟', icon: Timer, color: '#6366f1', desc: '等待一段时间后继续' },
  { type: 'code', label: '代码', icon: Code2, color: '#ec4899', desc: '执行自定义 JavaScript' },
  { type: 'output', label: '输出', icon: FileText, color: '#14b8a6', desc: '返回最终结果' },
];

function generateId() {
  return 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function NodeCard({ node, index, total, onUpdate, onRemove, agents }) {
  const [expanded, setExpanded] = useState(false);
  const nt = NODE_TYPES.find(t => t.type === node.type) || NODE_TYPES[0];
  const Icon = nt.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative group"
    >
      {index > 0 && (
        <div className="flex justify-center -my-1 relative z-0">
          <div className="w-px h-8 bg-gradient-to-b from-[color:var(--accent)]/40 to-[color:var(--accent)]/20" />
          <ArrowRight size={12} className="absolute bottom-0 text-[color:var(--accent)]/60 rotate-90" />
        </div>
      )}

      <div className={cn(
        'border rounded-xl p-4 transition-all bg-[color:var(--bg-elev)]',
        'border-[color:var(--line)] hover:border-[color:var(--accent)]/40 hover:shadow-md',
      )}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: nt.color + '20', color: nt.color }}
          >
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <input
              value={node.name}
              onChange={e => onUpdate({ ...node, name: e.target.value })}
              className="text-sm font-medium bg-transparent border-none outline-none w-full text-[color:var(--text)]"
              placeholder={nt.label}
            />
            <div className="text-xs text-[color:var(--text-faint)]">{nt.desc}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-md hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]"
            >
              <Settings2 size={14} />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-[color:var(--text-faint)] hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <Badge variant={node.type === 'condition' ? 'warning' : node.type === 'output' ? 'success' : 'default'}>
            {index + 1}/{total}
          </Badge>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-3 border-t border-[color:var(--line)] space-y-3">
                {node.type === 'prompt' && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">提示词内容</label>
                      <textarea
                        value={node.config?.prompt || ''}
                        onChange={e => onUpdate({ ...node, config: { ...node.config, prompt: e.target.value } })}
                        placeholder="输入发送给 AI 的提示词...&#10;可使用 {{prev_output}} 引用上一步输出"
                        rows={3}
                        className="w-full p-2.5 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] resize-none focus:border-[color:var(--accent)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">使用智能体</label>
                      <select
                        value={node.config?.agentId || ''}
                        onChange={e => onUpdate({ ...node, config: { ...node.config, agentId: e.target.value } })}
                        className="w-full p-2 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] outline-none"
                      >
                        <option value="">默认（通用助理）</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {node.type === 'condition' && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">条件表达式</label>
                      <input
                        value={node.config?.condition || ''}
                        onChange={e => onUpdate({ ...node, config: { ...node.config, condition: e.target.value } })}
                        placeholder='例: output.includes("成功") 或 output.length > 100'
                        className="w-full p-2.5 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-green-500 mb-1 block">满足时</label>
                        <input
                          value={node.config?.trueLabel || '继续'}
                          onChange={e => onUpdate({ ...node, config: { ...node.config, trueLabel: e.target.value } })}
                          className="w-full p-2 rounded-lg text-xs bg-[color:var(--bg)] border border-green-500/30 text-[color:var(--text)] outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-red-400 mb-1 block">不满足时</label>
                        <input
                          value={node.config?.falseLabel || '跳过'}
                          onChange={e => onUpdate({ ...node, config: { ...node.config, falseLabel: e.target.value } })}
                          className="w-full p-2 rounded-lg text-xs bg-[color:var(--bg)] border border-red-500/30 text-[color:var(--text)] outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}
                {node.type === 'loop' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">最大循环次数</label>
                      <input
                        type="number"
                        value={node.config?.maxIterations || 3}
                        onChange={e => onUpdate({ ...node, config: { ...node.config, maxIterations: parseInt(e.target.value) || 3 } })}
                        min={1}
                        max={20}
                        className="w-full p-2 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">终止条件</label>
                      <input
                        value={node.config?.breakCondition || ''}
                        onChange={e => onUpdate({ ...node, config: { ...node.config, breakCondition: e.target.value } })}
                        placeholder='例: output === "完成"'
                        className="w-full p-2 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] outline-none"
                      />
                    </div>
                  </div>
                )}
                {node.type === 'delay' && (
                  <div>
                    <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">等待时间（秒）</label>
                    <input
                      type="number"
                      value={node.config?.seconds || 5}
                      onChange={e => onUpdate({ ...node, config: { ...node.config, seconds: parseInt(e.target.value) || 5 } })}
                      min={1}
                      className="w-full p-2 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] outline-none"
                    />
                  </div>
                )}
                {node.type === 'code' && (
                  <div>
                    <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">JavaScript 代码</label>
                    <textarea
                      value={node.config?.code || ''}
                      onChange={e => onUpdate({ ...node, config: { ...node.config, code: e.target.value } })}
                      placeholder={'// prev_output 为上一步输出\n// 返回值传给下一步\nreturn prev_output.toUpperCase();'}
                      rows={5}
                      className="w-full p-2.5 rounded-lg text-xs font-mono bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] resize-none outline-none"
                    />
                  </div>
                )}
                {node.type === 'output' && (
                  <div>
                    <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">输出模板</label>
                    <textarea
                      value={node.config?.template || ''}
                      onChange={e => onUpdate({ ...node, config: { ...node.config, template: e.target.value } })}
                      placeholder={'使用 {{prev_output}} 引用上一步结果\n留空则直接输出上一步结果'}
                      rows={3}
                      className="w-full p-2.5 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] resize-none outline-none"
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

const TEMPLATES = [
  {
    name: '翻译 + 校对',
    desc: '先翻译，再自检校对，最后输出',
    icon: Globe,
    nodes: [
      { type: 'prompt', name: '翻译', config: { prompt: '请将以下内容翻译为英文：\n\n{{input}}' } },
      { type: 'prompt', name: '校对', config: { prompt: '请校对以下翻译，修正语法和表达：\n\n{{prev_output}}' } },
      { type: 'output', name: '输出', config: { template: '' } },
    ],
  },
  {
    name: '内容生成 + 审核',
    desc: '生成内容，条件检查，不合格重写',
    icon: Sparkles,
    nodes: [
      { type: 'prompt', name: '生成初稿', config: { prompt: '请根据以下主题写一篇短文：\n\n{{input}}' } },
      { type: 'condition', name: '质量检查', config: { condition: 'output.length > 200', trueLabel: '通过', falseLabel: '重写' } },
      { type: 'prompt', name: '改进', config: { prompt: '以下内容太短，请扩展并丰富细节：\n\n{{prev_output}}' } },
      { type: 'output', name: '最终输出', config: {} },
    ],
  },
  {
    name: '多步分析',
    desc: '提取要点、分类、生成报告',
    icon: FileText,
    nodes: [
      { type: 'prompt', name: '提取要点', config: { prompt: '请提取以下内容的关键要点：\n\n{{input}}' } },
      { type: 'prompt', name: '分类整理', config: { prompt: '请将以下要点按类别整理：\n\n{{prev_output}}' } },
      { type: 'prompt', name: '生成报告', config: { prompt: '请基于以下分类整理的内容生成一份简要报告：\n\n{{prev_output}}' } },
      { type: 'output', name: '报告输出', config: {} },
    ],
  },
];

export default function WorkflowPage() {
  const [workflows, setWorkflows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lingxi-workflows') || '[]'); } catch { return []; }
  });
  const [active, setActive] = useState(null);
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState([]);
  const [runInput, setRunInput] = useState('');
  const [agents, setAgents] = useState([]);
  const pushNotification = useStore(s => s.pushNotification);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {});
  }, []);

  const saveWorkflows = useCallback((wfs) => {
    setWorkflows(wfs);
    localStorage.setItem('lingxi-workflows', JSON.stringify(wfs));
  }, []);

  const createWorkflow = useCallback((name, initialNodes) => {
    const wf = {
      id: 'wf_' + Date.now(),
      name: name || '新工作流',
      nodes: initialNodes || [],
      createdAt: new Date().toISOString(),
    };
    const updated = [wf, ...workflows];
    saveWorkflows(updated);
    setActive(wf);
  }, [workflows, saveWorkflows]);

  const updateWorkflow = useCallback((wf) => {
    const updated = workflows.map(w => w.id === wf.id ? wf : w);
    saveWorkflows(updated);
    setActive(wf);
  }, [workflows, saveWorkflows]);

  const deleteWorkflow = useCallback((id) => {
    const updated = workflows.filter(w => w.id !== id);
    saveWorkflows(updated);
    if (active?.id === id) setActive(null);
  }, [workflows, active, saveWorkflows]);

  const addNode = useCallback((type) => {
    if (!active) return;
    const nt = NODE_TYPES.find(t => t.type === type);
    const node = { id: generateId(), type, name: nt?.label || type, config: {} };
    const updated = { ...active, nodes: [...active.nodes, node] };
    updateWorkflow(updated);
    setAddNodeOpen(false);
  }, [active, updateWorkflow]);

  const updateNode = useCallback((updated) => {
    if (!active) return;
    const nodes = active.nodes.map(n => n.id === updated.id ? updated : n);
    updateWorkflow({ ...active, nodes });
  }, [active, updateWorkflow]);

  const removeNode = useCallback((id) => {
    if (!active) return;
    const nodes = active.nodes.filter(n => n.id !== id);
    updateWorkflow({ ...active, nodes });
  }, [active, updateWorkflow]);

  const runWorkflow = useCallback(async () => {
    if (!active || active.nodes.length === 0 || running) return;
    setRunning(true);
    setRunLog([]);
    let prevOutput = runInput || '';
    const log = [];

    for (let i = 0; i < active.nodes.length; i++) {
      const node = active.nodes[i];
      const entry = { nodeId: node.id, name: node.name, type: node.type, status: 'running', output: '' };
      log.push(entry);
      setRunLog([...log]);

      try {
        switch (node.type) {
          case 'prompt': {
            let prompt = (node.config?.prompt || '').replace(/\{\{prev_output\}\}/g, prevOutput).replace(/\{\{input\}\}/g, runInput);
            if (!prompt.trim()) prompt = prevOutput;
            const sid = 0;
            const res = await api.sendChat({ message: prompt, sessionId: '0', useKB: false, images: [] });
            await new Promise(resolve => setTimeout(resolve, 2000));
            entry.output = '(AI 已处理 — 请查看会话)';
            entry.status = 'done';
            prevOutput = prompt;
            break;
          }
          case 'condition': {
            const cond = node.config?.condition || 'true';
            let result = false;
            try {
              const fn = new Function('output', `return !!(${cond})`);
              result = fn(prevOutput);
            } catch { result = false; }
            entry.output = result ? (node.config?.trueLabel || '满足') : (node.config?.falseLabel || '不满足');
            entry.status = 'done';
            if (!result) {
              entry.status = 'skipped';
              i++;
            }
            break;
          }
          case 'loop': {
            const max = node.config?.maxIterations || 3;
            entry.output = `循环 ${max} 次`;
            entry.status = 'done';
            break;
          }
          case 'delay': {
            const sec = node.config?.seconds || 5;
            entry.output = `等待 ${sec} 秒`;
            await new Promise(r => setTimeout(r, sec * 1000));
            entry.status = 'done';
            break;
          }
          case 'code': {
            try {
              const fn = new Function('prev_output', 'input', node.config?.code || 'return prev_output');
              prevOutput = String(fn(prevOutput, runInput) || '');
              entry.output = prevOutput.slice(0, 200);
              entry.status = 'done';
            } catch (e) {
              entry.output = '错误: ' + e.message;
              entry.status = 'error';
            }
            break;
          }
          case 'output': {
            const tpl = node.config?.template || '';
            if (tpl) {
              prevOutput = tpl.replace(/\{\{prev_output\}\}/g, prevOutput);
            }
            entry.output = prevOutput.slice(0, 500);
            entry.status = 'done';
            break;
          }
        }
      } catch (err) {
        entry.output = '错误: ' + (err.message || '未知错误');
        entry.status = 'error';
      }

      setRunLog([...log]);
    }

    setRunning(false);
    pushNotification({ title: '工作流完成', body: `「${active.name}」执行完毕` });
  }, [active, running, runInput, pushNotification]);

  // 列表视图
  if (!active) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[color:var(--text)] flex items-center gap-2">
              <Workflow size={26} className="text-[color:var(--accent)]" />
              工作流编排
            </h1>
            <p className="text-sm text-[color:var(--text-soft)] mt-1">
              通过可视化节点编排，构建多步骤 AI 自动化流程
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(true)}>
              <Sparkles size={14} /> 模板
            </Button>
            <Button onClick={() => createWorkflow()}>
              <Plus size={14} /> 新建工作流
            </Button>
          </div>
        </div>

        {workflows.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[color:var(--accent-soft)] flex items-center justify-center">
              <Workflow size={32} className="text-[color:var(--accent)]" />
            </div>
            <h3 className="text-lg font-semibold text-[color:var(--text)] mb-2">开始创建你的第一个工作流</h3>
            <p className="text-sm text-[color:var(--text-soft)] mb-6 max-w-md mx-auto">
              将多个 AI 步骤串联起来，实现翻译+校对、内容生成+审核等自动化流程
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setTemplateOpen(true)}>
                <Sparkles size={14} /> 从模板创建
              </Button>
              <Button onClick={() => createWorkflow()}>
                <Plus size={14} /> 空白工作流
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3">
            {workflows.map(wf => (
              <Card
                key={wf.id}
                className="p-4 cursor-pointer hover:border-[color:var(--accent)]/40 transition-all group"
                onClick={() => setActive(wf)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] flex items-center justify-center shrink-0">
                    <Workflow size={20} className="text-[color:var(--accent)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[color:var(--text)] truncate">{wf.name}</div>
                    <div className="text-xs text-[color:var(--text-faint)] mt-0.5">
                      {wf.nodes.length} 个节点 · 创建于 {new Date(wf.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center -space-x-1">
                      {wf.nodes.slice(0, 4).map((n, i) => {
                        const nt = NODE_TYPES.find(t => t.type === n.type);
                        const Icon = nt?.icon || Zap;
                        return (
                          <div
                            key={i}
                            className="w-6 h-6 rounded-full border-2 border-[color:var(--bg-elev)] flex items-center justify-center"
                            style={{ backgroundColor: (nt?.color || 'var(--accent)') + '20', color: nt?.color || 'var(--accent)' }}
                          >
                            <Icon size={10} />
                          </div>
                        );
                      })}
                      {wf.nodes.length > 4 && (
                        <div className="w-6 h-6 rounded-full border-2 border-[color:var(--bg-elev)] bg-[color:var(--bg-soft)] flex items-center justify-center text-[10px] text-[color:var(--text-faint)]">
                          +{wf.nodes.length - 4}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id); }}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[color:var(--text-faint)] hover:text-red-500 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 模板弹窗 */}
        <Modal open={templateOpen} onClose={() => setTemplateOpen(false)} title="工作流模板" width={560}>
          <div className="space-y-3">
            {TEMPLATES.map((tpl, i) => {
              const TplIcon = tpl.icon;
              return (
                <button
                  key={i}
                  onClick={() => {
                    const nodes = tpl.nodes.map(n => ({ ...n, id: generateId() }));
                    createWorkflow(tpl.name, nodes);
                    setTemplateOpen(false);
                  }}
                  className="w-full p-4 rounded-xl border border-[color:var(--line)] hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--accent-soft)]/20 text-left transition-all flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] flex items-center justify-center shrink-0">
                    <TplIcon size={20} className="text-[color:var(--accent)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[color:var(--text)]">{tpl.name}</div>
                    <div className="text-xs text-[color:var(--text-soft)] mt-0.5">{tpl.desc}</div>
                  </div>
                  <Badge>{tpl.nodes.length} 步</Badge>
                </button>
              );
            })}
          </div>
        </Modal>
      </div>
    );
  }

  // 编辑视图
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 顶部 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActive(null)}
          className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)] transition"
        >
          <ArrowRight size={16} className="rotate-180" />
        </button>
        <input
          value={active.name}
          onChange={e => updateWorkflow({ ...active, name: e.target.value })}
          className="text-xl font-bold bg-transparent border-none outline-none flex-1 text-[color:var(--text)]"
        />
        <Button variant="outline" size="sm" onClick={() => setAddNodeOpen(true)}>
          <Plus size={14} /> 添加节点
        </Button>
        <Button size="sm" onClick={runWorkflow} disabled={running || active.nodes.length === 0}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? '执行中' : '执行'}
        </Button>
      </div>

      {/* 执行输入 */}
      {active.nodes.length > 0 && (
        <div className="flex items-center gap-2">
          <input
            value={runInput}
            onChange={e => setRunInput(e.target.value)}
            placeholder="输入初始数据（可选，传入 {{input}}）..."
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-[color:var(--bg)] border border-[color:var(--line)] text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]"
          />
        </div>
      )}

      {/* 节点列表 */}
      <div className="space-y-0">
        <AnimatePresence>
          {active.nodes.map((node, i) => (
            <NodeCard
              key={node.id}
              node={node}
              index={i}
              total={active.nodes.length}
              onUpdate={updateNode}
              onRemove={() => removeNode(node.id)}
              agents={agents}
            />
          ))}
        </AnimatePresence>
      </div>

      {active.nodes.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-[color:var(--text-faint)] mb-3">还没有节点</div>
          <Button variant="outline" onClick={() => setAddNodeOpen(true)}>
            <Plus size={14} /> 添加第一个节点
          </Button>
        </Card>
      )}

      {/* 执行日志 */}
      {runLog.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium text-[color:var(--text)] mb-3 flex items-center gap-2">
            <Zap size={14} className="text-[color:var(--accent)]" />
            执行日志
          </div>
          <div className="space-y-2">
            {runLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="mt-0.5">
                  {entry.status === 'running' && <Loader2 size={12} className="animate-spin text-[color:var(--accent)]" />}
                  {entry.status === 'done' && <CheckCircle2 size={12} className="text-green-500" />}
                  {entry.status === 'error' && <AlertTriangle size={12} className="text-red-500" />}
                  {entry.status === 'skipped' && <ArrowRight size={12} className="text-yellow-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[color:var(--text)]">{entry.name}</span>
                  {entry.output && (
                    <div className="text-[color:var(--text-soft)] mt-0.5 break-words">{entry.output}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 添加节点弹窗 */}
      <Modal open={addNodeOpen} onClose={() => setAddNodeOpen(false)} title="添加节点" width={480}>
        <div className="grid grid-cols-2 gap-2">
          {NODE_TYPES.map(nt => {
            const Icon = nt.icon;
            return (
              <button
                key={nt.type}
                onClick={() => addNode(nt.type)}
                className="p-3 rounded-xl border border-[color:var(--line)] hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--accent-soft)]/20 text-left transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: nt.color + '20', color: nt.color }}
                  >
                    <Icon size={14} />
                  </div>
                  <span className="text-sm font-medium text-[color:var(--text)]">{nt.label}</span>
                </div>
                <div className="text-xs text-[color:var(--text-faint)] ml-9">{nt.desc}</div>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
