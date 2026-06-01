#!/usr/bin/env node
/**
 * SDK Runner — 桥接 Go 后端与 @anthropic-ai/claude-agent-sdk。
 *
 * 协议（v2 双向通信）：
 *   stdin  → 第一行: JSON 配置
 *            后续行: Go 后端发来的 permission_response
 *   stdout ← 每行一条 JSON 事件（Go 后端逐行解析）
 *   stderr ← 调试日志（不影响协议）
 *
 * 权限模式：
 *   config.permissionMode = "bypass" → dangerouslySkipPermissions
 *   config.permissionMode = "interactive" → canUseTool 回调
 */

import { startup } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

import { appendFileSync } from "fs";
const DEBUG_LOG = process.env.HOME + "/Library/Application Support/lingxi-agent/sdk-runner-debug.log";

function log(...args) {
  const msg = "[sdk-runner] " + args.join(" ") + "\n";
  process.stderr.write(msg);
  try { appendFileSync(DEBUG_LOG, new Date().toISOString() + " " + msg); } catch {}
}

// ─── stdin 双向通信 ──────────────────────────────────────────

const pendingResponses = new Map();
let configResolve = null;
let configReceived = false;
let stdinRL = null;

function setupStdinRL() {
  stdinRL = createInterface({
    input: process.stdin,
    terminal: false,
  });

  stdinRL.on("line", (line) => {
    line = line.trim();
    if (!line) return;

    try {
      const parsed = JSON.parse(line);

      if (!configReceived) {
        configReceived = true;
        if (configResolve) {
          configResolve(parsed);
          configResolve = null;
        }
        return;
      }

      if (parsed.type === "permission_response" && parsed.id) {
        const pending = pendingResponses.get(parsed.id);
        if (pending) {
          pendingResponses.delete(parsed.id);
          pending.resolve(parsed);
        } else {
          log("no pending request for id:", parsed.id);
        }
      }
    } catch (e) {
      log("bad stdin JSON:", e.message);
    }
  });

  stdinRL.on("close", () => {
    log("stdin closed");
    for (const [, p] of pendingResponses) {
      p.reject(new Error("stdin closed"));
    }
    pendingResponses.clear();
    if (!configReceived && configResolve) {
      configResolve(null);
    }
  });
}

function waitForConfig() {
  return new Promise((resolve) => {
    if (configReceived) {
      resolve(null);
      return;
    }
    configResolve = resolve;
  });
}

let reqCounter = 0;
function nextReqId() {
  return `perm_${++reqCounter}_${Date.now()}`;
}

async function requestPermission(toolName, input) {
  const id = nextReqId();
  const isAskUser = toolName === "AskUserQuestion";

  emit({
    type: "permission_request",
    id,
    toolName,
    input: typeof input === "object" ? input : {},
    isAskUser,
  });

  log("permission_request emitted:", id, toolName);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingResponses.delete(id);
      log("permission request timed out:", id);
      reject(new Error("Permission request timed out"));
    }, 5 * 60 * 1000);

    pendingResponses.set(id, {
      resolve: (resp) => {
        clearTimeout(timeout);
        resolve(resp);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

// ─── 主逻辑 ──────────────────────────────────────────────────

async function main() {
  setupStdinRL();
  const config = await waitForConfig();

  if (!config) {
    log("no config received, exiting");
    process.exit(1);
  }

  log("config received:", JSON.stringify({
    hasPrompt: !!config.prompt,
    sessionId: config.sessionId || null,
    workingDir: config.workingDir || null,
    hasSystemPrompt: !!config.systemPrompt,
    thinking: config.thinking,
    hasImages: (config.imagePaths || []).length > 0,
    permissionMode: config.permissionMode || "bypass",
  }));

  let prompt = config.prompt || "";
  if (config.imagePaths && config.imagePaths.length > 0) {
    const imgSection = config.imagePaths.join("\n");
    prompt =
      "[图片附件]\n用户发送了以下图片，请使用 Read 工具依次读取后再回答：\n" +
      imgSection +
      "\n\n" +
      (prompt ? "[用户问题]\n" + prompt : "");
  }

  const isInteractive = config.permissionMode === "interactive";

  const options = {
    allowedTools: [
      "Bash", "Read", "Write", "Edit", "MultiEdit",
      "Glob", "Grep", "LS", "WebFetch", "WebSearch",
      "Agent", "AskUserQuestion",
    ],
    includePartialMessages: true,
    forwardSubagentText: true,
    settingSources: [],
  };

  // Always use 'default' permissionMode + canUseTool callback.
  // AskUserQuestion always blocks to collect user answers via the permission
  // channel. Other tools: auto-allow in bypass mode, or route through the
  // permission channel in interactive mode.
  options.permissionMode = "default";
  options.canUseTool = async (toolName, input) => {
    if (toolName === "AskUserQuestion") {
      log("AskUserQuestion intercepted, blocking until user answers");
      try {
        const resp = await requestPermission(toolName, input);
        log("AskUserQuestion response:", resp.behavior);
        if (resp.behavior === "allow") {
          return {
            behavior: "allow",
            updatedInput: resp.updatedInput || undefined,
          };
        }
        return {
          behavior: "deny",
          message: resp.message || "User dismissed the question",
        };
      } catch (e) {
        log("AskUserQuestion error:", e.message);
        return { behavior: "deny", message: "AskUserQuestion timed out: " + e.message };
      }
    }
    if (isInteractive) {
      log("canUseTool called:", toolName);
      try {
        const resp = await requestPermission(toolName, input);
        log("permission response:", resp.behavior, "for", toolName);
        if (resp.behavior === "allow") {
          return {
            behavior: "allow",
            updatedInput: resp.updatedInput || undefined,
          };
        } else {
          return {
            behavior: "deny",
            message: resp.message || "User denied this action",
          };
        }
      } catch (e) {
        log("permission request error:", e.message);
        return { behavior: "deny", message: "Permission request failed: " + e.message };
      }
    }
    return { behavior: "allow" };
  };
  log(isInteractive ? "interactive permission mode" : "bypass mode (AskUserQuestion still blocks)");

  if (config.systemPrompt) {
    options.systemPrompt = config.systemPrompt;
  }

  if (config.workingDir) {
    options.cwd = config.workingDir;
  }

  if (config.sessionId) {
    options.resume = config.sessionId;
  }

  if (config.env && typeof config.env === "object") {
    options.env = { ...process.env, ...config.env };
  }

  if (config.thinking === false) {
    options.thinking = { type: "disabled" };
  }

  if (config.agents) {
    options.agents = config.agents;
  }

  log("calling startup(options)...");
  let warmQuery;
  try {
    warmQuery = await startup({ options });
    log("startup done, warmQuery ready");
  } catch (err) {
    log("startup error:", err.message, err.stack);
    const errorLine = JSON.stringify({ type: "sdk_error", error: "SDK startup failed: " + err.message }) + "\n";
    await new Promise((resolve) => process.stdout.write(errorLine, resolve));
    if (stdinRL) stdinRL.close();
    return;
  }

  let resultSeen = false;
  try {
    const q = warmQuery.query(prompt);

    for await (const message of q) {
      if (message.type === "result") resultSeen = true;
      // Log subagent-related events for debugging
      if (message.type === "system" && (message.subtype || "").startsWith("task_")) {
        log("TASK EVENT:", message.subtype, "id:", message.task_id || "?", "status:", message.status || "?", "is_error:", !!message.is_error, "result:", (message.result || "").slice(0, 200));
      }
      processMessage(message);
    }

    emit({ type: "sdk_done" });
  } catch (err) {
    log("query error:", err.message, err.stack);
    if (resultSeen) {
      emit({ type: "sdk_done" });
    } else {
      const errorLine = JSON.stringify({ type: "sdk_error", error: err.message }) + "\n";
      await new Promise((resolve) => process.stdout.write(errorLine, resolve));
    }
  } finally {
    if (warmQuery && typeof warmQuery.close === "function") {
      try { warmQuery.close(); } catch {}
    }
    if (stdinRL) stdinRL.close();
  }
}

function processMessage(msg) {
  switch (msg.type) {
    case "system":
      handleSystem(msg);
      break;

    case "stream_event":
      emit({
        type: "stream_event",
        event: msg.event,
        parent_tool_use_id: msg.parent_tool_use_id || null,
      });
      break;

    case "assistant":
      if (msg.message && msg.message.usage) {
        const u = msg.message.usage;
        emit({
          type: "usage_update",
          model: msg.message.model || "",
          input_tokens: u.input_tokens || 0,
          output_tokens: u.output_tokens || 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
          cache_read_input_tokens: u.cache_read_input_tokens || 0,
        });
      }
      break;

    case "result":
      handleResult(msg);
      break;

    default:
      break;
  }
}

function handleSystem(msg) {
  switch (msg.subtype) {
    case "init":
      emit({
        type: "system",
        subtype: "init",
        session_id: msg.session_id || "",
        tools: (msg.tools || []).map((t) =>
          typeof t === "string" ? t : t.name || ""
        ),
      });
      break;

    case "task_started":
      emit({
        type: "task_event",
        subtype: "task_started",
        task_id: msg.task_id || "",
        tool_use_id: msg.tool_use_id || "",
        description: msg.description || "",
        subagent_type: msg.subagent_type || "",
      });
      break;

    case "task_progress":
      emit({
        type: "task_event",
        subtype: "task_progress",
        task_id: msg.task_id || "",
        tool_use_id: msg.tool_use_id || "",
        description: msg.description || "",
        usage: msg.usage || null,
        last_tool_name: msg.last_tool_name || "",
        summary: msg.summary || "",
      });
      break;

    case "task_updated":
      emit({
        type: "task_event",
        subtype: "task_updated",
        task_id: msg.task_id || "",
        patch: msg.patch || {},
      });
      log("task_updated:", msg.task_id, "patch:", JSON.stringify(msg.patch || {}).slice(0, 200));
      break;

    case "task_notification":
      emit({
        type: "task_event",
        subtype: "task_notification",
        task_id: msg.task_id || "",
        tool_use_id: msg.tool_use_id || "",
        status: msg.status || "",
        summary: msg.summary || "",
        usage: msg.usage || null,
        is_error: !!msg.is_error,
        error: msg.error || msg.result || "",
      });
      log("task_notification:", msg.task_id, "status:", msg.status, "is_error:", !!msg.is_error, "summary:", (msg.summary || "").slice(0, 100));
      break;

    default:
      break;
  }
}

function handleResult(msg) {
  emit({
    type: "result",
    subtype: msg.subtype || "",
    cost_usd: msg.total_cost_usd || 0,
    duration_ms: msg.duration_ms || 0,
    session_id: msg.session_id || "",
    is_error: !!msg.is_error,
    result: msg.result || "",
    num_turns: msg.num_turns || 0,
    usage: msg.usage
      ? {
          input_tokens: msg.usage.input_tokens || 0,
          output_tokens: msg.usage.output_tokens || 0,
          cache_creation_input_tokens: msg.usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: msg.usage.cache_read_input_tokens || 0,
        }
      : null,
  });
}

main().catch((err) => {
  log("fatal:", err.message, err.stack);
  process.exit(1);
});
