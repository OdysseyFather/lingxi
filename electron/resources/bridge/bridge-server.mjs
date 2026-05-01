// 灵犀本地协议路由层 — 用 supermemoryai/llm-bridge 把 Anthropic 协议
// 透明翻译成任意 OpenAI 兼容厂商，再把 OpenAI SSE 流翻译回 Anthropic SSE。
//
// 进程模型：由 Go 后端 (router 包) spawn，监听 BRIDGE_PORT（默认 0=随机）。
// 端点：
//   POST /v1/messages   —— 接 claude-code CLI 的请求（Anthropic 协议）
//   POST /__config      —— Go 后端推 active profile（base_url / model / token）
//   GET  /__health      —— 健康检查（含当前 active profile 摘要）
//   GET  /__status      —— 调试信息

import http from 'node:http'
import {
  toUniversal,
  fromUniversal,
  handleUniversalStreamRequest,
} from 'llm-bridge'

const HOST = process.env.BRIDGE_HOST || '127.0.0.1'
const PORT = parseInt(process.env.BRIDGE_PORT || '0', 10)
const LOG_PREFIX = '[bridge]'

// 单一 active 配置（Go 后端会在 profile 切换时 POST /__config 覆盖）
let active = null // { profileId, name, baseUrl, model, token }
let stats = { requests: 0, errors: 0, lastErr: '', startedAt: new Date().toISOString() }

// 给经过本 bridge 的 OpenAI 兼容小模型追加的强约束（Claude 走 Anthropic 直连不经此路径）。
const SMALL_MODEL_TOOL_DISCIPLINE = `

[CRITICAL — Tool & Skill Discipline]
你正通过 OpenAI 兼容协议运行，工具调用纪律必须严格执行：

1. 调用 Skill 工具拿到返回内容（通常是 SKILL.md 全文）后，必须先完整阅读返回内容，
   再决定下一步动作。SKILL.md 里指定的工作目录、Python 解释器路径、命令行参数、
   日期格式等细节都是经过实测的，禁止自行替换、猜测或简化。
2. 当 SKILL.md 指定 ./venv_xxx/bin/python3 之类的解释器时，必须使用该解释器，
   不要回落到系统 python3 / python。
3. 调用 Bash 工具前先确认参数完整：单次给出可一次成功的完整命令，不要在路径未确认时
   先 ls 一通试探。Bash 不是用来摸索的，是用来执行已经想清楚的命令。
4. 如果一次工具调用失败，先看错误信息再决定下一步；不要把同一类命令换不同写法盲试 5 次以上。
5. SKILL.md 里"何时启用"列出的关键词若与用户请求匹配，应严格按其文档章节顺序执行，
   不要跳过参数细节或区域代码（regionCode）等关键字段。

违反以上纪律会导致任务失败。请按用户最初的请求一次到位。
`

// 把工具纪律约束注入到 OpenAI messages 数组的 system 消息里。
function injectToolDiscipline(openaiBody) {
  if (!openaiBody || !Array.isArray(openaiBody.messages)) return openaiBody
  const sysIdx = openaiBody.messages.findIndex((m) => m.role === 'system')
  if (sysIdx >= 0) {
    const existing = openaiBody.messages[sysIdx]
    const baseText = typeof existing.content === 'string'
      ? existing.content
      : Array.isArray(existing.content)
        ? existing.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('')
        : ''
    openaiBody.messages[sysIdx] = { ...existing, content: baseText + SMALL_MODEL_TOOL_DISCIPLINE }
  } else {
    openaiBody.messages.unshift({ role: 'system', content: SMALL_MODEL_TOOL_DISCIPLINE.trim() })
  }
  return openaiBody
}

function log(...args) {
  console.log(LOG_PREFIX, ...args)
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks)
        if (!buf.length) return resolve({})
        resolve(JSON.parse(buf.toString('utf8')))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJSON(res, code, obj) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

function sendError(res, code, msg, extra = {}) {
  log('error', code, msg, extra)
  sendJSON(res, code, { type: 'error', error: { type: 'bridge_error', message: msg, ...extra } })
}

// Anthropic 工具结果在 Claude Code 请求里通常是：
//   role=user, content=[{ type:'tool_result', tool_use_id:'...' }]
// OpenAI Chat Completions 标准要求工具结果必须是：
//   role=tool, tool_call_id='...', content='...'
// llm-bridge 的通用转换会保留原始 role=user，导致部分 OpenAI 兼容模型把工具结果当普通用户消息，
// 从而破坏 “tool_use -> 执行工具 -> tool_result -> 继续推理” 的 Agent 闭环。
function normalizeToolResultsForOpenAI(universal) {
  if (!universal?.messages || !Array.isArray(universal.messages)) return universal

  const normalized = []
  for (const msg of universal.messages) {
    const toolResults = (msg.content || []).filter((c) => c.type === 'tool_result' && c.tool_result)
    if (msg.role !== 'user' || toolResults.length === 0) {
      normalized.push(msg)
      continue
    }

    const nonToolContent = (msg.content || []).filter((c) => c.type !== 'tool_result')
    if (nonToolContent.length > 0) {
      normalized.push({ ...msg, content: nonToolContent })
    }

    toolResults.forEach((content, idx) => {
      const tr = content.tool_result || {}
      normalized.push({
        ...msg,
        id: `${msg.id || 'tool_result'}_${idx}`,
        role: 'tool',
        content: [content],
        metadata: {
          ...(msg.metadata || {}),
          tool_call_id: tr.tool_call_id || tr.metadata?.tool_use_id || '',
          name: tr.name || '',
          normalized_from_anthropic_tool_result: true,
        },
      })
    })
  }

  universal.messages = normalized
  return universal
}

// ─── 处理器 ───────────────────────────────────────────────────────

async function handleConfig(req, res) {
  let body
  try {
    body = await readJSON(req)
  } catch (e) {
    return sendError(res, 400, 'invalid json: ' + e.message)
  }
  if (!body.base_url || !body.model || !body.token) {
    return sendError(res, 400, 'missing base_url / model / token')
  }
  active = {
    profileId: body.profile_id || 0,
    name: body.name || '',
    baseUrl: body.base_url,
    model: body.model,
    token: body.token,
  }
  log('config updated:', { profileId: active.profileId, name: active.name, model: active.model })
  sendJSON(res, 200, { ok: true })
}

async function handleHealth(_req, res) {
  sendJSON(res, 200, {
    ok: true,
    active: active
      ? { profile_id: active.profileId, name: active.name, model: active.model }
      : null,
    stats,
  })
}

// 把 Anthropic /v1/messages 请求 → OpenAI Chat Completions 上游，再把 OpenAI SSE 流翻成 Anthropic SSE 流回客户端
async function handleMessages(req, res) {
  if (!active) {
    return sendError(res, 503, 'bridge not configured: no active profile yet')
  }

  let inbound
  try {
    inbound = await readJSON(req)
  } catch (e) {
    return sendError(res, 400, 'invalid json: ' + e.message)
  }

  const wantsStream = inbound.stream !== false // 默认为流
  stats.requests += 1

  // ── 1. Anthropic → OpenAI 请求体 ─────────────────────────────
  let openaiBody
  try {
    const universal = normalizeToolResultsForOpenAI(toUniversal('anthropic', inbound))
    openaiBody = fromUniversal('openai', universal)
  } catch (e) {
    stats.errors += 1
    stats.lastErr = 'translate_request: ' + e.message
    return sendError(res, 500, 'translate request failed: ' + e.message)
  }

  // 上游模型名以 active.model 为准（前端可能发的是 anthropic 模型名）
  openaiBody.model = active.model
  openaiBody.stream = true
  // 让 OpenAI 兼容上游在 stream 中也带 usage（DashScope/DeepSeek/GLM 等都支持），
  // 否则 llm-bridge 的 emitter 会回 output_tokens=0
  openaiBody.stream_options = { ...(openaiBody.stream_options || {}), include_usage: true }

  // 注入 OpenAI 小模型工具纪律约束（修复 qwen-plus 等忽略 SKILL.md 的问题）
  injectToolDiscipline(openaiBody)

  // 一些上游对 max_tokens 上限敏感（如阿里 qwen-max 限 8192）
  // 通用 clamp：> 8192 时下调到 8192
  if (typeof openaiBody.max_tokens === 'number' && openaiBody.max_tokens > 8192) {
    openaiBody.max_tokens = 8192
  }

  // ── 2. 调上游 ───────────────────────────────────────────────
  let upstreamResp
  try {
    upstreamResp = await fetch(active.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': active.token.startsWith('Bearer ') ? active.token : `Bearer ${active.token}`,
      },
      body: JSON.stringify(openaiBody),
    })
  } catch (e) {
    stats.errors += 1
    stats.lastErr = 'upstream_fetch: ' + e.message
    return sendError(res, 502, 'upstream fetch failed: ' + e.message)
  }

  if (!upstreamResp.ok) {
    const text = await upstreamResp.text().catch(() => '')
    stats.errors += 1
    stats.lastErr = `upstream ${upstreamResp.status}: ${text.slice(0, 200)}`
    return sendError(res, upstreamResp.status, `upstream returned ${upstreamResp.status}`, { upstream_body: text.slice(0, 1000) })
  }

  // ── 3. SSE 流式翻译 ──────────────────────────────────────────
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  res.flushHeaders?.()

  try {
    const anthropicStream = handleUniversalStreamRequest(
      upstreamResp.body,
      'openai',
      'anthropic'
    )

    // anthropicStream 是 ReadableStream<Uint8Array>，pipe 到 res
    const reader = anthropicStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) res.write(value)
    }
    res.end()
  } catch (e) {
    stats.errors += 1
    stats.lastErr = 'stream_translate: ' + e.message
    log('stream translate error:', e)
    try {
      // 尽力发一个 anthropic 错误事件
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'bridge_error', message: e.message } })}\n\n`)
    } catch {}
    try { res.end() } catch {}
  }

  if (wantsStream === false) {
    // 暂未支持非流；客户端基本都会要 stream
    log('warning: client requested non-stream, served as stream anyway')
  }
}

// ─── HTTP server ────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS（只对本地）
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', '*')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  const url = req.url || '/'
  if (url.startsWith('/__config') && req.method === 'POST') return handleConfig(req, res)
  if (url.startsWith('/__health') && req.method === 'GET') return handleHealth(req, res)
  if (url.startsWith('/__status') && req.method === 'GET') return handleHealth(req, res)
  if (url.startsWith('/v1/messages') && req.method === 'POST') return handleMessages(req, res)

  // Anthropic SDK 偶尔会发 HEAD/GET 到 /v1/messages 或 / 探活，给 200 静默返回
  if ((req.method === 'HEAD' || req.method === 'GET') && (url === '/' || url.startsWith('/v1'))) {
    res.statusCode = 200
    return res.end()
  }

  sendError(res, 404, `not found: ${req.method} ${url}`)
})

server.listen(PORT, HOST, () => {
  const port = server.address().port
  log(`listening on ${HOST}:${port}`)
  // 把 port 打到 stdout 第一行，让 Go 父进程能解析
  console.log(`BRIDGE_READY port=${port}`)
})

// 优雅退出
function shutdown(sig) {
  log('shutting down on', sig)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 2000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('uncaughtException', (e) => {
  log('uncaughtException:', e)
  stats.errors += 1
  stats.lastErr = 'uncaught: ' + e.message
})
