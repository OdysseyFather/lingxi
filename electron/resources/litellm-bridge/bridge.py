#!/usr/bin/env python3
"""
灵犀 LiteLLM Bridge
接受 Anthropic /v1/messages 请求，经 LiteLLM 转发到任意 OpenAI 兼容供应商，
并把流式响应实时转回 Anthropic SSE 格式返回给 Claude Code。

进程模型：由 Go 后端 router.EnsureRunning() spawn。
接口：
  POST /v1/messages   接收 Claude Code 的 Anthropic 请求
  POST /__config      Go 后端推送激活档案（仅写内存）
  GET  /__health      健康检查
  GET  /__status      同健康检查
"""

import json
import os
import sys
import uuid
import socket
import traceback
import socketserver
from http.server import HTTPServer, BaseHTTPRequestHandler

# ─── 导入 LiteLLM ────────────────────────────────────────────────
try:
    import litellm

    litellm.suppress_debug_info = True
    litellm.set_verbose = False

    import logging
    logging.getLogger("LiteLLM").setLevel(logging.WARNING)
    logging.getLogger("LiteLLM Router").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
except ImportError:
    print(
        "[litellm-bridge] ERROR: litellm not installed.\n"
        "  Run: pip install litellm   (or see electron/resources/litellm-bridge/requirements.txt)",
        file=sys.stderr,
    )
    sys.exit(1)

HOST = os.environ.get("BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("BRIDGE_PORT", "0"))
LOG_PREFIX = "[litellm-bridge]"

# 给经过本 bridge 的 OpenAI 兼容小模型（qwen-plus / deepseek-chat / glm-4 等）追加的强约束。
# Claude 等强模型走 Anthropic 直连不会经过这里，不受影响。
# 目的：阻止小模型在调用 Skill 后忽略 SKILL.md 内容、自行猜测路径/解释器、陷入 Bash 探路循环。
SMALL_MODEL_TOOL_DISCIPLINE = """

[CRITICAL — Tool & Skill Discipline]
你正通过 OpenAI 兼容协议运行，工具调用纪律必须严格执行：

1. 调用 Skill 工具拿到返回内容（通常是 SKILL.md 全文）后，**必须先完整阅读返回内容**，
   再决定下一步动作。SKILL.md 里指定的工作目录、Python 解释器路径、命令行参数、
   日期格式等细节都是经过实测的，**禁止自行替换、猜测或简化**。
2. 当 SKILL.md 指定 `./venv_xxx/bin/python3` 之类的解释器时，必须使用该解释器，
   不要回落到系统 `python3` / `python`。
3. 调用 Bash 工具前先确认参数完整：单次给出可一次成功的完整命令，**不要**在路径未确认时
   先 `ls` 一通试探。Bash 不是用来摸索的，是用来执行已经想清楚的命令。
4. 如果一次工具调用失败，先看错误信息再决定下一步；不要把同一类命令换不同写法盲试 5 次以上。
5. SKILL.md 里写"何时启用"列出的关键词若与用户请求匹配，应严格按其文档章节顺序执行，
   不要跳过参数细节或区域代码（regionCode）等关键字段。

违反以上纪律会导致任务失败。请按用户最初的请求一次到位。
"""

# 激活档案（仅内存，不落盘）
active = None  # { profileId, name, baseUrl, model, token }
stats = {"requests": 0, "errors": 0, "last_err": ""}


def log(*args):
    print(LOG_PREFIX, *args, flush=True)


# ─── SSE 工具 ─────────────────────────────────────────────────────

def sse_event(event_type: str, data: dict) -> bytes:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


# ─── URL 规范化 ───────────────────────────────────────────────────

def normalize_api_base(url: str) -> str:
    """
    去掉 /chat/completions 后缀，让 LiteLLM 自行追加。
    DeepSeek / DashScope / 大多数供应商都在 UI 里配了完整路径。
    """
    url = url.strip()
    for suffix in ("/chat/completions", "/chat/completion"):
        bare = url.rstrip("/")
        if bare.endswith(suffix):
            url = bare[: -len(suffix)]
            break
    return url.rstrip("/")


# ─── Anthropic → OpenAI 消息转换 ─────────────────────────────────

def _content_to_text(content) -> str:
    """从 Anthropic content（字符串或 block 列表）提取纯文本。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return str(content) if content is not None else ""


def anthropic_to_openai_messages(anthropic_messages: list, system=None) -> list:
    """
    将 Anthropic messages 转换成 OpenAI Chat Completions messages。
    关键处理：
      1. tool_result (role=user, content=[{type:tool_result}]) → role=tool 消息
      2. tool_use (role=assistant, content=[{type:tool_use}])  → tool_calls
    """
    messages = []

    # system prompt
    if system:
        system_text = _content_to_text(system)
        if system_text:
            # 追加 OpenAI 小模型工具纪律约束
            messages.append({"role": "system", "content": system_text + SMALL_MODEL_TOOL_DISCIPLINE})
        else:
            messages.append({"role": "system", "content": SMALL_MODEL_TOOL_DISCIPLINE.strip()})
    else:
        # 即使上游没下发 system，也注入纪律约束
        messages.append({"role": "system", "content": SMALL_MODEL_TOOL_DISCIPLINE.strip()})

    for msg in anthropic_messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        # 纯字符串内容
        if isinstance(content, str):
            messages.append({"role": role, "content": content})
            continue

        if not isinstance(content, list):
            messages.append({"role": role, "content": str(content)})
            continue

        tool_results = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_result"]
        tool_uses    = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]
        text_blocks  = [b for b in content if isinstance(b, dict) and b.get("type") == "text"]

        # user 消息含 tool_result → 拆成 role=tool 消息（关键：维持 Agent 工具链）
        if role == "user" and tool_results:
            # 先输出非工具内容
            plain_text = "".join(b.get("text", "") for b in text_blocks)
            if plain_text:
                messages.append({"role": "user", "content": plain_text})

            for tr in tool_results:
                raw_result = tr.get("content", "")
                if isinstance(raw_result, list):
                    raw_result = "".join(
                        b.get("text", "") for b in raw_result
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
                elif raw_result is None:
                    raw_result = ""
                messages.append({
                    "role": "tool",
                    "tool_call_id": tr.get("tool_use_id", ""),
                    "content": str(raw_result),
                })
            continue

        # assistant 消息含 tool_use → tool_calls
        if role == "assistant" and tool_uses:
            plain_text = "".join(b.get("text", "") for b in text_blocks)
            tool_calls = [
                {
                    "id": tu.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                    "type": "function",
                    "function": {
                        "name": tu.get("name", ""),
                        "arguments": json.dumps(tu.get("input", {})),
                    },
                }
                for tu in tool_uses
            ]
            messages.append({
                "role": "assistant",
                "content": plain_text or None,
                "tool_calls": tool_calls,
            })
            continue

        # 普通文本
        text = "".join(b.get("text", "") for b in text_blocks)
        if text:
            messages.append({"role": role, "content": text})
        elif content:
            messages.append({"role": role, "content": json.dumps(content)})

    return messages


def anthropic_to_openai_tools(tools: list) -> list | None:
    """将 Anthropic tools 转换成 OpenAI function 格式。"""
    if not tools:
        return None
    return [
        {
            "type": "function",
            "function": {
                "name": t.get("name", ""),
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        }
        for t in tools
    ]


# ─── LiteLLM 流 → Anthropic SSE ──────────────────────────────────

def stream_to_anthropic_sse(response_iter, model: str, message_id: str):
    """
    消费 LiteLLM 流式响应（OpenAI 格式），实时 yield Anthropic SSE bytes。
    支持文本块和工具调用块，正确维护 block index。
    """
    yield sse_event("message_start", {
        "type": "message_start",
        "message": {
            "id": message_id,
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": model,
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        },
    })
    yield sse_event("ping", {"type": "ping"})

    next_block_idx = 0          # 下一个 Anthropic block 的 index
    text_block_idx = None       # 文本 block 使用的 index（None=尚未开始）
    thinking_block_idx = None   # 思考链 block 使用的 index
    # oai_tool_call_index -> {"block_idx": int, "id": str, "name": str}
    tool_blocks: dict = {}
    input_tokens = 0
    output_tokens = 0
    stop_reason = "end_turn"

    try:
        for chunk in response_iter:
            # 收集 usage（某些供应商在末尾单独发）
            if hasattr(chunk, "usage") and chunk.usage:
                u = chunk.usage
                pt = getattr(u, "prompt_tokens", None)
                ct = getattr(u, "completion_tokens", None)
                if pt is not None:
                    input_tokens = pt
                if ct is not None:
                    output_tokens = ct

            if not (hasattr(chunk, "choices") and chunk.choices):
                continue

            choice = chunk.choices[0]
            delta = getattr(choice, "delta", None)
            finish = getattr(choice, "finish_reason", None)

            if delta:
                # ── 思考链 delta（OpenAI 兼容供应商透传 reasoning_content / reasoning）──
                # 优先尝试属性，再尝试 dict 形式（部分供应商把 reasoning 放在 model_extra 里）
                reasoning_text = (
                    getattr(delta, "reasoning_content", None)
                    or getattr(delta, "reasoning", None)
                )
                if not reasoning_text:
                    # 尝试从原始 dict 取（litellm 有时通过 model_extra 暴露）
                    try:
                        raw = delta.model_dump() if hasattr(delta, "model_dump") else None
                    except Exception:
                        raw = None
                    if isinstance(raw, dict):
                        reasoning_text = raw.get("reasoning_content") or raw.get("reasoning")
                if reasoning_text:
                    if thinking_block_idx is None:
                        thinking_block_idx = next_block_idx
                        next_block_idx += 1
                        yield sse_event("content_block_start", {
                            "type": "content_block_start",
                            "index": thinking_block_idx,
                            "content_block": {"type": "thinking", "thinking": ""},
                        })
                    yield sse_event("content_block_delta", {
                        "type": "content_block_delta",
                        "index": thinking_block_idx,
                        "delta": {"type": "thinking_delta", "thinking": reasoning_text},
                    })

                # ── 文本 delta ──
                text = getattr(delta, "content", None)
                if text:
                    # 思考链结束（开始进入正式文本输出）→ 关闭 thinking block
                    if thinking_block_idx is not None:
                        yield sse_event("content_block_stop", {
                            "type": "content_block_stop",
                            "index": thinking_block_idx,
                        })
                        thinking_block_idx = None
                    if text_block_idx is None:
                        text_block_idx = next_block_idx
                        next_block_idx += 1
                        yield sse_event("content_block_start", {
                            "type": "content_block_start",
                            "index": text_block_idx,
                            "content_block": {"type": "text", "text": ""},
                        })
                    yield sse_event("content_block_delta", {
                        "type": "content_block_delta",
                        "index": text_block_idx,
                        "delta": {"type": "text_delta", "text": text},
                    })

                # ── 工具调用 delta ──
                tool_calls_delta = getattr(delta, "tool_calls", None)
                if tool_calls_delta:
                    for tc in tool_calls_delta:
                        oai_idx = getattr(tc, "index", 0)

                        # 新工具：开始一个 tool_use block
                        if oai_idx not in tool_blocks:
                            block_idx = next_block_idx
                            next_block_idx += 1
                            tool_id = getattr(tc, "id", None) or f"toolu_{uuid.uuid4().hex[:8]}"
                            tool_name = ""
                            if hasattr(tc, "function") and tc.function:
                                tool_name = getattr(tc.function, "name", None) or ""
                            tool_blocks[oai_idx] = {
                                "block_idx": block_idx,
                                "id": tool_id,
                                "name": tool_name,
                            }
                            yield sse_event("content_block_start", {
                                "type": "content_block_start",
                                "index": block_idx,
                                "content_block": {
                                    "type": "tool_use",
                                    "id": tool_id,
                                    "name": tool_name,
                                    "input": {},
                                },
                            })

                        tb = tool_blocks[oai_idx]

                        if hasattr(tc, "function") and tc.function:
                            # 补全 name（某些供应商 name 在后续 chunk 才到）
                            late_name = getattr(tc.function, "name", None)
                            if late_name and not tb["name"]:
                                tb["name"] = late_name

                            args_delta = getattr(tc.function, "arguments", None) or ""
                            if args_delta:
                                yield sse_event("content_block_delta", {
                                    "type": "content_block_delta",
                                    "index": tb["block_idx"],
                                    "delta": {
                                        "type": "input_json_delta",
                                        "partial_json": args_delta,
                                    },
                                })

            if finish:
                if finish == "tool_calls":
                    stop_reason = "tool_use"
                elif finish == "length":
                    stop_reason = "max_tokens"
                elif finish in ("stop", "eos", "end"):
                    stop_reason = "end_turn"

    except Exception as exc:
        log("stream error:", type(exc).__name__, str(exc))
        traceback.print_exc(file=sys.stderr)

    # ── 关闭所有 block ──────────────────────────────────────────
    if thinking_block_idx is not None:
        yield sse_event("content_block_stop", {
            "type": "content_block_stop",
            "index": thinking_block_idx,
        })
    if text_block_idx is not None:
        yield sse_event("content_block_stop", {
            "type": "content_block_stop",
            "index": text_block_idx,
        })


    for tb in sorted(tool_blocks.values(), key=lambda x: x["block_idx"]):
        yield sse_event("content_block_stop", {
            "type": "content_block_stop",
            "index": tb["block_idx"],
        })

    yield sse_event("message_delta", {
        "type": "message_delta",
        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
        "usage": {"output_tokens": output_tokens},
    })
    yield sse_event("message_stop", {"type": "message_stop"})


# ─── HTTP 处理器 ───────────────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # 禁用默认访问日志

    # ── CORS 头 ──
    def _cors(self):
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/__health", "/__status"):
            self._send_json(200, {
                "ok": True,
                "active": {
                    "profile_id": active["profileId"],
                    "name": active["name"],
                    "model": active["model"],
                } if active else None,
                "stats": stats,
            })
            return
        if path == "/" or path.startswith("/v1"):
            self.send_response(200)
            self.end_headers()
            return
        self._send_error(404, f"not found: GET {path}")

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            body = json.loads(raw) if raw else {}
        except Exception as exc:
            return self._send_error(400, f"invalid json: {exc}")

        path = self.path.split("?")[0]
        if path.startswith("/__config"):
            return self._handle_config(body)
        if path.startswith("/v1/messages"):
            return self._handle_messages(body)
        self._send_error(404, f"not found: POST {path}")

    # ── 工具方法 ──

    def _send_json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: int, msg: str, extra: dict | None = None):
        log("error", code, msg)
        obj: dict = {"type": "error", "error": {"type": "bridge_error", "message": msg}}
        if extra:
            obj["error"].update(extra)
        self._send_json(code, obj)

    # ── 接口处理 ──

    def _handle_config(self, body: dict):
        global active
        if not body.get("base_url") or not body.get("model") or not body.get("token"):
            return self._send_error(400, "missing base_url / model / token")
        active = {
            "profileId": body.get("profile_id", 0),
            "name": body.get("name", ""),
            "baseUrl": body["base_url"],
            "model": body["model"],
            "token": body["token"],
        }
        log(f"config updated: profileId={active['profileId']} model={active['model']}")
        self._send_json(200, {"ok": True})

    def _handle_messages(self, inbound: dict):
        global stats
        if not active:
            return self._send_error(503, "bridge not configured: no active profile yet")

        stats["requests"] += 1
        message_id = f"msg_{uuid.uuid4().hex[:16]}"

        # ── 请求体转换 ──────────────────────────────────────────
        try:
            messages = anthropic_to_openai_messages(
                inbound.get("messages", []),
                inbound.get("system"),
            )
            tools = anthropic_to_openai_tools(inbound.get("tools"))
        except Exception as exc:
            stats["errors"] += 1
            stats["last_err"] = str(exc)
            return self._send_error(500, f"message conversion failed: {exc}")

        max_tokens = int(inbound.get("max_tokens") or 4096)
        if max_tokens > 8192:
            max_tokens = 8192

        api_base = normalize_api_base(active["baseUrl"])
        # LiteLLM OpenAI-compatible 路由：model 前缀 openai/
        model_str = f"openai/{active['model']}"

        call_kwargs: dict = {
            "model": model_str,
            "messages": messages,
            "api_base": api_base,
            "api_key": active["token"],
            "stream": True,
            "max_tokens": max_tokens,
            "stream_options": {"include_usage": True},
        }
        if tools:
            call_kwargs["tools"] = tools
        temperature = inbound.get("temperature")
        if temperature is not None:
            call_kwargs["temperature"] = float(temperature)

        # ── 发送 SSE 头 ─────────────────────────────────────────
        # 每个 /v1/messages 是一次完整交换，SSE 结束后主动关闭连接，
        # 避免 keep-alive 导致客户端 read() 无限阻塞。
        self.close_connection = True
        self.send_response(200)
        self.send_header("content-type", "text/event-stream; charset=utf-8")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "close")
        self._cors()
        self.end_headers()

        # ── 流式输出 ─────────────────────────────────────────────
        try:
            response = litellm.completion(**call_kwargs)
            for chunk_bytes in stream_to_anthropic_sse(response, active["model"], message_id):
                self.wfile.write(chunk_bytes)
                self.wfile.flush()
        except Exception as exc:
            stats["errors"] += 1
            stats["last_err"] = str(exc)
            log("completion error:", type(exc).__name__, str(exc))
            traceback.print_exc(file=sys.stderr)
            err_json = json.dumps({
                "type": "error",
                "error": {"type": "bridge_error", "message": str(exc)},
            })
            try:
                self.wfile.write(f"event: error\ndata: {err_json}\n\n".encode("utf-8"))
                self.wfile.flush()
            except Exception:
                pass


# ─── ThreadingHTTPServer（每请求一线程，支持并发探活）─────────────

class _ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True


# ─── 入口 ─────────────────────────────────────────────────────────

def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def main():
    port = PORT if PORT != 0 else _pick_free_port()
    server = _ThreadingHTTPServer((HOST, port), BridgeHandler)
    log(f"listening on {HOST}:{port}")
    # Go 父进程通过 stdout 检测此行确认 bridge 已就绪
    sys.stdout.write(f"BRIDGE_READY port={port}\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("shutting down (SIGINT)")
        server.shutdown()


if __name__ == "__main__":
    main()


