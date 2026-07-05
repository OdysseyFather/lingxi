import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css' // 兼容旧版 SkillsPage / KnowledgePage / IMConnectorPage 的样式
import { AppShell } from './ui/AppShell'
import { ErrorBoundary } from './ui/ErrorBoundary'

// 注：旧 App.jsx 仍保留在仓库中以备回退；新版主壳由 AppShell 渲染。
createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppShell />
  </ErrorBoundary>
)
