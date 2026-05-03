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
import { EventEmitter } from 'node:events'
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

[ABSOLUTE RULE — 语言]
你的所有回复必须使用中文（简体中文）。代码和命令可保留原文，其余必须中文。

[ABSOLUTE RULE — 你是 Agent，不是聊天机器人]
你是一个拥有完整工具集的 AI Agent，不是普通的聊天机器人。
你可以调用工具来执行真实的操作——读文件、执行命令、搜索网络、查询日志等。

**核心区别：普通聊天机器人只能生成文本回复，而你可以调用 function/tool 来实际完成任务。**

当用户的请求涉及以下场景时，你必须调用工具，绝对禁止仅用文本回复：
- 查询日志、查数据、查订单 → 必须调用 Bash/Read 工具执行查询
- 查看文件内容 → 必须调用 Read 工具
- 执行系统操作 → 必须调用 Bash 工具
- 搜索信息 → 必须调用 WebSearch/Grep 工具
- 涉及已安装的技能（Skills） → 必须先 Read 对应的 SKILL.md，然后按文档执行

**绝对禁止的行为：**
- ❌ 用户问"帮我查一下日志"，你回复"我无法访问您的系统" → 这是错误的，你有 Bash 工具
- ❌ 用户描述了一个技术问题，你只给"可能的原因分析" → 你应该先用工具查实际数据
- ❌ 你说"需要专业技术人员通过内部系统查询" → 你就是那个有工具的执行者
- ❌ 你列出"排查建议"但自己不去执行 → 你应该直接调用工具执行排查

**正确的行为：**
- ✅ 先用 Read 工具读取相关 SKILL.md 了解如何操作
- ✅ 然后用 Bash 工具执行 SKILL.md 中描述的命令
- ✅ 最后用中文总结执行结果给用户

[CRITICAL — Skill（技能）使用流程]
你的技能文件存放在 skills 目录下。当用户的请求可能涉及某个技能时：

第一步：用 Read 工具读取技能的 SKILL.md 文件，了解该技能的能力和使用方法。
第二步：严格按照 SKILL.md 中的指令执行（包括指定的解释器、工作目录、参数格式等）。
第三步：用 Bash 工具执行 SKILL.md 指定的命令。
第四步：分析结果并用中文回复用户。

关键：SKILL.md 里指定的工作目录、Python 解释器路径、命令行参数、日期格式等细节
都是经过实测的，禁止自行替换、猜测或简化。

[CRITICAL — Tool Calling 纪律]
1. 必须使用 function_call / tool_calls 格式调用工具，不要在文本中伪造 JSON。
2. 调用 Bash 工具时给出完整命令，一次成功，不要盲目试探。
3. 工具调用失败时先看错误信息再决定下一步，不要同一命令盲试超过 3 次。
4. 当 SKILL.md 指定 ./venv_xxx/bin/python3 时，必须用该解释器，不要回落到系统 python。

[CRITICAL — 禁止使用提问类工具]
**绝对禁止调用 AskUserQuestion、AskFollowupQuestion 等工具来向用户提问。** 用户无法看到这些工具的输出。

当你需要向用户收集信息或让用户做选择时，必须在你的**文本回复**中使用以下 JSON 代码块格式（前端会自动渲染为交互式表单）：

选择题格式（写在你的回复文本中，用 \`\`\`json 代码块包裹）：
{"type":"choice","id":"xxx","title":"问题","multi":false,"options":[{"id":"a","label":"选项A","desc":"说明"},{"id":"b","label":"选项B","desc":"说明"}]}

填写信息格式（同样写在回复文本中）：
{"type":"input","id":"xxx","title":"请提供信息","fields":[{"id":"f1","label":"字段名","placeholder":"提示","required":true}]}

记住：这些 JSON 必须写在你的文本回复里（用 \`\`\`json 包裹），不要用工具调用！
`

// 把工具纪律约束注入到 OpenAI messages 数组的 system 消息里。
function injectToolDiscipline(openaiBody) {
  if (!openaiBody || !Array.isArray(openaiBody.messages)) return openaiBody

  // 动态列出本次请求中可用的工具名，让模型明确知道自己能调什么
  let toolList = ''
  if (openaiBody.tools && openaiBody.tools.length > 0) {
    const names = openaiBody.tools
      .map(t => t.function?.name || t.name)
      .filter(Boolean)
    if (names.length > 0) {
      toolList = `\n\n[当前可用工具列表]\n你在本次对话中可以调用以下 ${names.length} 个工具：\n${names.map(n => `- ${n}`).join('\n')}\n\n当用户的请求需要查信息、读文件、执行操作时，你必须从上面的列表中选择工具调用，不要说"我无法访问"。`
    }
  }

  const discipline = SMALL_MODEL_TOOL_DISCIPLINE + toolList

  const sysIdx = openaiBody.messages.findIndex((m) => m.role === 'system')
  if (sysIdx >= 0) {
    const existing = openaiBody.messages[sysIdx]
    const baseText = typeof existing.content === 'string'
      ? existing.content
      : Array.isArray(existing.content)
        ? existing.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('')
        : ''
    openaiBody.messages[sysIdx] = { ...existing, content: baseText + discipline }
  } else {
    openaiBody.messages.unshift({ role: 'system', content: discipline.trim() })
  }

  // 在最后一条 user 消息后追加 tool-use 提醒（仅首轮，避免多轮累积）
  // 许多 OpenAI 兼容模型对 user 消息中的指令更敏感
  if (openaiBody.tools?.length > 0) {
    const msgs = openaiBody.messages
    const toolMsgCount = msgs.filter(m => m.role === 'tool').length
    const assistantToolCallCount = msgs.filter(m => m.role === 'assistant' && m.tool_calls?.length > 0).length
    // 只在模型尚未调用过工具时注入提醒（已在 agent 循环中的不再注入）
    if (toolMsgCount === 0 && assistantToolCallCount === 0) {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          const content = typeof msgs[i].content === 'string' ? msgs[i].content : ''
          if (content && !content.includes('[提醒：你必须用 function call')) {
            msgs[i] = {
              ...msgs[i],
              content: content + '\n\n[提醒：你必须用 function call 调用工具来完成此任务，不要仅用文本回复。先读取相关 SKILL.md 了解操作方法，然后执行。所有回复用中文。]'
            }
          }
          break
        }
      }
    }
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

// 从 OpenAI SSE 流中分离 reasoning_content / reasoning 字段。
// 返回一个过滤后的 ReadableStream（reasoning 已移除）和一个 EventEmitter（发出 reasoning 事件）。
// 这样 llm-bridge 只处理 text/tool 内容，reasoning 由 bridge 直接生成 Anthropic thinking 事件。
function splitReasoningFromStream(upstreamBody) {
  const emitter = new EventEmitter()
  let hasReasoning = false
  let buffer = ''

  const filtered = new ReadableStream({
    async start(controller) {
      const reader = upstreamBody.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) {
            // 处理缓冲区中剩余的数据
            if (buffer.trim()) {
              processBuffer(buffer, controller, emitter, () => hasReasoning)
            }
            if (hasReasoning) emitter.emit('reasoning_end')
            controller.close()
            break
          }

          buffer += decoder.decode(value, { stream: true })

          // 按完整的 SSE 事件分割处理
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留最后一个不完整的行

          let currentEventLines = []
          for (const line of lines) {
            currentEventLines.push(line)
            if (line === '') {
              // 空行表示一个完整的 SSE 事件结束
              const eventText = currentEventLines.join('\n') + '\n'
              const dataLine = currentEventLines.find(l => l.startsWith('data: '))
              currentEventLines = []

              if (!dataLine) {
                // 非 data 行原样转发
                controller.enqueue(new TextEncoder().encode(eventText))
                continue
              }

              const jsonStr = dataLine.slice(6)
              if (jsonStr === '[DONE]') {
                if (hasReasoning) emitter.emit('reasoning_end')
                controller.enqueue(new TextEncoder().encode(eventText))
                continue
              }

              try {
                const parsed = JSON.parse(jsonStr)
                const delta = parsed?.choices?.[0]?.delta
                if (!delta) {
                  controller.enqueue(new TextEncoder().encode(eventText))
                  continue
                }

                const reasoning = delta.reasoning_content || delta.reasoning || ''
                if (reasoning) {
                  hasReasoning = true
                  emitter.emit('reasoning', reasoning)

                  // 如果这个 chunk 同时有 content，保留 content 部分
                  if (delta.content) {
                    const cleaned = { ...parsed }
                    cleaned.choices = parsed.choices.map(c => ({
                      ...c,
                      delta: { ...c.delta, reasoning_content: undefined, reasoning: undefined }
                    }))
                    const newLine = `data: ${JSON.stringify(cleaned)}\n\n`
                    controller.enqueue(new TextEncoder().encode(newLine))
                  }
                  // 纯 reasoning chunk 不转发给 llm-bridge
                } else {
                  // 非 reasoning chunk 原样转发
                  if (hasReasoning && delta.content && !delta.reasoning_content && !delta.reasoning) {
                    // reasoning 阶段结束，content 阶段开始
                    emitter.emit('reasoning_end')
                    hasReasoning = false
                  }
                  controller.enqueue(new TextEncoder().encode(eventText))
                }
              } catch {
                // JSON 解析失败原样转发
                controller.enqueue(new TextEncoder().encode(eventText))
              }
            }
          }
        }
      } catch (e) {
        if (hasReasoning) emitter.emit('reasoning_end')
        controller.error(e)
      }
    },
  })

  return { filteredStream: filtered, reasoningEmitter: emitter }
}

function processBuffer(buf, controller, emitter, hasReasoningFn) {
  const encoder = new TextEncoder()
  if (buf.startsWith('data: ')) {
    controller.enqueue(encoder.encode(buf + '\n\n'))
  }
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

  // 确保 tool_choice 至少为 "auto"（部分 OpenAI 兼容提供商需要显式设置）
  if (openaiBody.tools?.length > 0 && !openaiBody.tool_choice) {
    openaiBody.tool_choice = 'auto'
  }

  // 诊断日志：工具定义数量 & 消息角色分布
  const toolCount = openaiBody.tools?.length || 0
  const roleDist = (openaiBody.messages || []).reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {})
  log(`[diag] model=${openaiBody.model} tools=${toolCount} msgs=${JSON.stringify(roleDist)} tool_choice=${JSON.stringify(openaiBody.tool_choice)}`)
  if (toolCount > 0) {
    log(`[diag] tool_names: ${openaiBody.tools.map(t => t.function?.name || t.name).join(', ')}`)
  }

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

  // ── 3. SSE 流式翻译（含 reasoning token 透传）────────────────
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  res.flushHeaders?.()

  try {
    // 拦截上游 SSE 流：提取 reasoning_content / reasoning 字段，
    // 生成 Anthropic thinking 事件，剩余内容交给 llm-bridge 翻译。
    const { filteredStream, reasoningEmitter } = splitReasoningFromStream(upstreamResp.body)

    let thinkingBlockStarted = false
    let thinkingBlockIdx = 0

    // 并行：reasoning 事件直接写入 res
    reasoningEmitter.on('reasoning', (text) => {
      if (!thinkingBlockStarted) {
        thinkingBlockStarted = true
        const startEvt = {
          type: 'content_block_start',
          index: thinkingBlockIdx,
          content_block: { type: 'thinking', thinking: '' },
        }
        res.write(`event: content_block_start\ndata: ${JSON.stringify(startEvt)}\n\n`)
      }
      const deltaEvt = {
        type: 'content_block_delta',
        index: thinkingBlockIdx,
        delta: { type: 'thinking_delta', thinking: text },
      }
      res.write(`event: content_block_delta\ndata: ${JSON.stringify(deltaEvt)}\n\n`)
    })
    reasoningEmitter.on('reasoning_end', () => {
      if (thinkingBlockStarted) {
        const stopEvt = {
          type: 'content_block_stop',
          index: thinkingBlockIdx,
        }
        res.write(`event: content_block_stop\ndata: ${JSON.stringify(stopEvt)}\n\n`)
        thinkingBlockIdx++
      }
    })

    // llm-bridge 翻译剩余的 text/tool 内容
    const anthropicStream = handleUniversalStreamRequest(
      filteredStream,
      'openai',
      'anthropic'
    )

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
