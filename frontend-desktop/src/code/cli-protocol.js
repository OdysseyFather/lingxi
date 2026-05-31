/**
 * CLI Protocol Type Definitions for Coding View.
 * Documents all WS event types the frontend handles from the backend.
 * The backend (coding_chat.go) drives all state changes via these events.
 */

/**
 * @typedef {'pending' | 'in_progress' | 'completed' | 'cancelled'} TaskStatus
 */

/**
 * @typedef {Object} TodoItem
 * @property {string} id - Unique task identifier
 * @property {string} content - Task description text
 * @property {TaskStatus} status - Current execution status
 * @property {string} [agent] - Which agent owns this task
 * @property {string} [elapsed] - Formatted elapsed time
 * @property {number} [tokens] - Token usage for this task
 * @property {TodoItem[]} [children] - Sub-tasks (recursive)
 */

/**
 * @typedef {'working' | 'done' | 'error' | 'idle'} SubAgentStatus
 */

/**
 * @typedef {Object} SubAgentEvent
 * @property {string} id - Unique sub-agent identifier
 * @property {string} description - Short description of what this sub-agent is doing
 * @property {SubAgentStatus} status - Current execution status
 * @property {string} [parent_id] - Parent agent/message ID for nesting (null = top-level)
 * @property {number} [message_id] - The assistant message this sub-agent belongs to
 * @property {string} [output] - Final output/summary when done
 * @property {string[]} [tools] - Tools this sub-agent has used
 */

/**
 * @typedef {Object} AskQuestionOption
 * @property {string} id - Option identifier
 * @property {string} label - Display label
 * @property {string} [desc] - Optional description
 * @property {boolean} [recommended] - Whether this is the recommended option
 */

/**
 * @typedef {Object} AskQuestionPayload
 * @property {string} id - Question identifier (used in answer submission)
 * @property {'choice' | 'input'} type - Question type
 * @property {string} question - Question text (also: title)
 * @property {AskQuestionOption[]} options - Available options
 * @property {boolean} allow_custom - Whether free-text input is allowed
 * @property {string} [depends_on] - ID of question this depends on
 */

/**
 * Answer submission format for submitCodingAnswerBatch API:
 * POST /api/coding/chat/answer-batch
 * Body: { sessionId: string, answers: Record<questionId, selectedLabel>, workingDir: string }
 *
 * The answers map keys correspond to AskQuestionPayload.id values.
 * After submission, no new User Message is created in chat.
 * The agent resumes execution, signaled by subsequent text/tool_start events.
 */

/**
 * @typedef {Object} CheckpointMeta
 * @property {number} id - Checkpoint ID in DB
 * @property {number} session_id - Session this checkpoint belongs to
 * @property {number} message_id - The assistant message ID at this checkpoint
 * @property {string} created_at - ISO timestamp
 * @property {number} files_count - Number of files in snapshot
 * @property {number} messages_count - Message count at checkpoint time
 * @property {string} [todo_snapshot] - JSON of TodoItem[] at checkpoint time
 */

/**
 * WS Event Types (event field in WS messages):
 *
 * | Event                 | Payload                            | UI Action                                    |
 * |-----------------------|------------------------------------|----------------------------------------------|
 * | agent_state           | { state: AgentState }              | Update thinking indicator + header status     |
 * | thinking              | string (chunk)                     | Buffer into thinking LiveBlock                |
 * | text                  | string (chunk)                     | Buffer into text LiveBlock                    |
 * | tool_start            | { name, label }                    | Add tool LiveBlock (spinning)                 |
 * | tool_end              | { input, label, ms, status }       | Mark tool done, update details                |
 * | task_update           | { todos: TodoItem[] }              | Merge into codingTasks (optimistic sync)      |
 * | ask_questions_batch   | { questions: AskQuestionPayload[] }| Show non-blocking wizard above composer       |
 * | ask_question          | AskQuestionPayload                 | Append to pending questions batch             |
 * | permission_request    | { tool_name, input, id }           | Show permission card in live blocks           |
 * | file_diff             | { file, diff, is_new, added, removed } | Update liveDiffs panel                   |
 * | subagent_start        | SubAgentEvent                      | Add to subAgents list                         |
 * | subagent_update       | Partial<SubAgentEvent>             | Merge updates into existing sub-agent         |
 * | subagent_done         | { id }                             | Mark sub-agent as done                        |
 * | message_usage         | { usage, messageId }               | Finalize live blocks into stored message      |
 * | done                  | null                               | End streaming, finalize remaining blocks      |
 * | checkpoint_created    | CheckpointMeta                     | Store checkpoint ref on the current message   |
 * | profile_changed       | null                               | Refresh API profiles                          |
 */

/**
 * Agent States (codingAgentState values):
 * - IDLE: No active work
 * - THINKING: LLM is generating
 * - CHECKING: Reading files / searching
 * - EXECUTING: Running commands / tools
 * - WAITING_FOR_USER: Awaiting user input (AskQuestion)
 * - WAITING_FOR_BATCH_ANSWER: Awaiting batch answers
 * - DONE: Task completed
 */

export const AGENT_STATES = {
  IDLE: 'IDLE',
  THINKING: 'THINKING',
  CHECKING: 'CHECKING',
  EXECUTING: 'EXECUTING',
  WAITING_FOR_USER: 'WAITING_FOR_USER',
  WAITING_FOR_BATCH_ANSWER: 'WAITING_FOR_BATCH_ANSWER',
  DONE: 'DONE',
};

export const WS_EVENTS = {
  AGENT_STATE: 'agent_state',
  THINKING: 'thinking',
  TEXT: 'text',
  TOOL_START: 'tool_start',
  TOOL_END: 'tool_end',
  TASK_UPDATE: 'task_update',
  ASK_QUESTIONS_BATCH: 'ask_questions_batch',
  ASK_QUESTION: 'ask_question',
  PERMISSION_REQUEST: 'permission_request',
  FILE_DIFF: 'file_diff',
  SUBAGENT_START: 'subagent_start',
  SUBAGENT_UPDATE: 'subagent_update',
  SUBAGENT_DONE: 'subagent_done',
  MESSAGE_USAGE: 'message_usage',
  DONE: 'done',
  CHECKPOINT_CREATED: 'checkpoint_created',
  PROFILE_CHANGED: 'profile_changed',
};

export const TOOL_CATEGORIES = {
  file_read: { color: 'blue', label: 'File Read' },
  file_write: { color: 'purple', label: 'File Write' },
  terminal: { color: 'green', label: 'Terminal' },
  search: { color: 'orange', label: 'Search' },
  web: { color: 'cyan', label: 'Web' },
  mcp: { color: 'pink', label: 'MCP' },
};

export function categorizeToolName(name) {
  if (!name) return 'file_read';
  const n = name.toLowerCase();
  if (n.includes('write') || n.includes('edit') || n.includes('multiedit')) return 'file_write';
  if (n.includes('bash') || n.includes('shell') || n.includes('exec')) return 'terminal';
  if (n.includes('grep') || n.includes('glob') || n.includes('search') || n.includes('semantic')) return 'search';
  if (n.includes('web') || n.includes('fetch') || n.includes('url')) return 'web';
  if (n.startsWith('mcp__') || n.startsWith('mcp_')) return 'mcp';
  return 'file_read';
}
