import { useStore } from '../state/useStore';
import { Card } from '../ui/primitives';
import { cn } from '../ui/cn';
import { Sun, Moon, Sparkles, Zap, Leaf, Star, Waves, Sunset, TreePine, Heart, Mountain, Flower2, Coffee, Snowflake, Cherry, Rainbow, Droplets } from 'lucide-react';

const THEMES = [
  { id: 'light',    name: '浅色',       icon: Sun,       preview: 'linear-gradient(135deg,#ffffff,#eef0f6)',               desc: '清新明亮' },
  { id: 'dark',     name: '深色',       icon: Moon,      preview: 'linear-gradient(135deg,#181c28,#0b0d12)',               desc: '护眼舒适' },
  { id: 'midnight', name: '午夜紫',     icon: Sparkles,  preview: 'linear-gradient(135deg,#1a1140,#0b0d12)',               desc: '深邃优雅' },
  { id: 'cyber',    name: '赛博朋克',   icon: Zap,       preview: 'linear-gradient(135deg,#050510,#00e5ff)',               desc: '霓虹蓝绿' },
  { id: 'aurora',   name: '极光',       icon: Leaf,      preview: 'linear-gradient(135deg,#060d16 30%,#4ade80,#22d3ee)',   desc: '自然绿意' },
  { id: 'cosmos',   name: '星空',       icon: Star,      preview: 'linear-gradient(135deg,#04040c 30%,#c084fc,#f0abfc)',   desc: '梦幻紫粉' },
  { id: 'ocean',    name: '深海',       icon: Waves,     preview: 'linear-gradient(135deg,#071520,#38bdf8)',               desc: '蔚蓝深邃' },
  { id: 'sunset',   name: '日落',       icon: Sunset,    preview: 'linear-gradient(135deg,#1a0e0a 30%,#fb923c,#ea580c)',   desc: '暖橙晚霞' },
  { id: 'forest',   name: '森林',       icon: TreePine,  preview: 'linear-gradient(135deg,#0a140c 30%,#22c55e,#16a34a)',   desc: '翠绿静谧' },
  { id: 'rose',     name: '玫瑰',       icon: Heart,     preview: 'linear-gradient(135deg,#fdf2f5,#f43f5e)',               desc: '粉红甜蜜' },
  { id: 'sand',     name: '沙漠',       icon: Mountain,  preview: 'linear-gradient(135deg,#faf6f0,#c49840)',               desc: '暖棕素雅' },
  { id: 'lavender', name: '薰衣草',     icon: Flower2,   preview: 'linear-gradient(135deg,#f8f4fc,#8b5cf6)',               desc: '淡紫温柔' },
  { id: 'mocha',    name: '摩卡',       icon: Coffee,    preview: 'linear-gradient(135deg,#1a1210 30%,#d9aa64,#b8860b)',   desc: '暖棕深邃' },
  { id: 'nord',     name: '北极',       icon: Snowflake, preview: 'linear-gradient(135deg,#2e3440,#88c0d0)',               desc: '冷蓝静谧' },
  { id: 'sakura',   name: '樱花',       icon: Cherry,    preview: 'linear-gradient(135deg,#fef8fa,#ec82a4)',               desc: '粉白浪漫' },
  { id: 'neon',     name: '霓虹',       icon: Rainbow,   preview: 'linear-gradient(135deg,#000000 20%,#ff0080,#7928ca,#00d4ff)', desc: '炫彩夺目' },
  { id: 'mint',     name: '薄荷',       icon: Droplets,  preview: 'linear-gradient(135deg,#f4fbf8,#10b981)',               desc: '清凉舒爽' },
];

export function AppearancePage() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <div className="max-w-3xl mx-auto py-6 px-6">
      <h1 className="text-xl font-semibold mb-4">外观</h1>
      <Card>
        <div className="font-medium mb-3">主题</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {THEMES.map((t) => {
            const I = t.icon;
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'surface p-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                  active ? 'ring-2 ring-[color:var(--accent)] border-[color:var(--accent)] shadow-glow' : 'hover:border-[color:var(--accent)]'
                )}
              >
                <div className="h-20 rounded-md mb-2 relative overflow-hidden" style={{ background: t.preview }}>
                  {active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <span className="text-white text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">当前</span>
                    </div>
                  )}
                </div>
                <div className="text-sm font-medium flex items-center gap-2"><I size={14} /> {t.name}</div>
                <div className="text-xs text-[color:var(--text-faint)] mt-0.5">{t.desc}</div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
