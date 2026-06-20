import 'dart:convert';

class Message {
  final int id;
  final int sessionId;
  final String role;
  final String content;
  final String createdAt;
  final bool pinned;
  final String? feedback;
  /// 结构化块（从后端 blocks JSON 解析，或从流式 liveBlocks 合并）
  final List<MessageBlock>? blocks;

  Message({
    required this.id,
    required this.sessionId,
    required this.role,
    required this.content,
    required this.createdAt,
    this.pinned = false,
    this.feedback,
    this.blocks,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    final role = json['role'] ?? 'user';
    final content = json['content'] ?? '';
    List<MessageBlock>? blocks;

    // 优先从 blocks 字段解析（未来后端可能直接返回）
    if (json['blocks'] != null) {
      try {
        final rawBlocks = json['blocks'] is String
            ? jsonDecode(json['blocks'])
            : json['blocks'];
        if (rawBlocks is List) {
          blocks = rawBlocks.map((b) => MessageBlock.fromJson(b as Map<String, dynamic>)).toList();
        }
      } catch (_) {}
    }

    // 后端 assistant 消息的 content 实际上是 JSON 数组字符串（blocks 序列化）
    // 格式: [{"type":"thinking","text":"..."}, {"type":"text","text":"..."}, ...]
    if (blocks == null && role == 'assistant' && content is String && (content as String).trimLeft().startsWith('[')) {
      try {
        final parsed = jsonDecode(content);
        if (parsed is List && parsed.isNotEmpty) {
          blocks = parsed
              .where((b) => b is Map)
              .map((b) => MessageBlock.fromJson(Map<String, dynamic>.from(b)))
              .toList();
        }
      } catch (_) {
        // JSON 解析失败，fallback 为纯文本
      }
    }

    return Message(
      id: json['id'] ?? 0,
      sessionId: json['session_id'] ?? 0,
      role: role,
      content: content,
      createdAt: json['created_at'] ?? '',
      pinned: json['pinned'] == 1 || json['pinned'] == true,
      feedback: json['feedback'],
      blocks: blocks,
    );
  }
}

/// 消息内容块（text / thinking / tool）
class MessageBlock {
  final String type;
  String text;
  bool done;

  // tool 专属字段
  final String? toolName;
  final String? toolLabel;
  final int? ms;
  final String? status;
  final Map<String, dynamic>? input;

  MessageBlock({
    required this.type,
    this.text = '',
    this.done = true,
    this.toolName,
    this.toolLabel,
    this.ms,
    this.status,
    this.input,
  });

  factory MessageBlock.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? input;
    if (json['input'] != null) {
      if (json['input'] is String) {
        try {
          final decoded = jsonDecode(json['input']);
          if (decoded is Map) {
            input = Map<String, dynamic>.from(decoded);
          }
        } catch (_) {
          input = {'raw': json['input']};
        }
      } else if (json['input'] is Map) {
        input = Map<String, dynamic>.from(json['input']);
      }
    }

    return MessageBlock(
      type: json['type'] ?? 'text',
      text: json['text']?.toString() ?? '',
      done: json['done'] ?? true,
      toolName: json['name'],
      toolLabel: json['label'],
      ms: json['ms'],
      status: json['status'],
      input: input,
    );
  }

  Map<String, dynamic> toJson() => {
    'type': type,
    'text': text,
    if (toolName != null) 'name': toolName,
    if (toolLabel != null) 'label': toolLabel,
    if (ms != null) 'ms': ms,
    if (status != null) 'status': status,
    if (input != null) 'input': input,
    'done': done,
  };
}

/// 流式消息块（来自 WS 的实时数据，可变）
class LiveBlock {
  final String type;
  String text;
  bool done;

  // tool 专属
  String? toolName;
  String? toolLabel;
  int? ms;
  String? status;
  Map<String, dynamic>? input;
  int? startedAt;

  // ask_question 专属
  String? question;
  List<Map<String, dynamic>>? options;
  bool allowCustom;
  String? questionId;
  bool answered;

  LiveBlock({
    required this.type,
    this.text = '',
    this.done = false,
    this.toolName,
    this.toolLabel,
    this.ms,
    this.status,
    this.input,
    this.startedAt,
    this.question,
    this.options,
    this.allowCustom = true,
    this.questionId,
    this.answered = false,
  });

  MessageBlock toMessageBlock() => MessageBlock(
    type: type,
    text: text,
    done: done,
    toolName: toolName,
    toolLabel: toolLabel,
    ms: ms,
    status: status,
    input: input,
  );
}
