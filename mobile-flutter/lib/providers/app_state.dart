import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_client.dart';
import '../services/ws_client.dart';
import '../services/connection_manager.dart';
import '../services/push_service.dart';
import '../models/session.dart';
import '../models/message.dart';
import '../models/agent.dart';

class AppState extends ChangeNotifier {
  final ApiClient apiClient = ApiClient();
  late final WsClient wsClient;
  late final ConnectionManager connectionManager;

  // 配对状态
  bool _paired = false;
  bool get paired => _paired;

  // 连接状态
  bool _connecting = false;
  bool get connecting => _connecting;

  // WS 连接状态（用于显示断线红条）
  bool _wsConnected = false;
  bool get wsConnected => _wsConnected;
  Timer? _wsDisconnectDebounce;

  // 50ms 流式刷新节流
  Timer? _streamThrottle;
  bool _streamDirty = false;

  // 分页
  bool _hasMoreMessages = true;
  bool get hasMoreMessages => _hasMoreMessages;
  bool _loadingOlder = false;
  bool get loadingOlder => _loadingOlder;

  // 会话
  List<Session> _sessions = [];
  List<Session> get sessions => _sessions;
  Session? _activeSession;
  Session? get activeSession => _activeSession;

  // 消息
  List<Message> _messages = [];
  List<Message> get messages => _messages;

  // 流式状态（基于块）
  bool _streaming = false;
  bool get streaming => _streaming;
  List<LiveBlock> _liveBlocks = [];
  List<LiveBlock> get liveBlocks => _liveBlocks;

  /// 便捷属性：从 liveBlocks 提取文本/思考/工具
  String get streamingText {
    final buf = StringBuffer();
    for (final b in _liveBlocks) {
      if (b.type == 'text') buf.write(b.text);
    }
    return buf.toString();
  }

  String get thinkingText {
    final buf = StringBuffer();
    for (final b in _liveBlocks) {
      if (b.type == 'thinking') buf.write(b.text);
    }
    return buf.toString();
  }

  bool get isThinking => _liveBlocks.any((b) => b.type == 'thinking' && !b.done);
  bool get hasToolRunning => _liveBlocks.any((b) => b.type == 'tool' && !b.done);

  // 推荐后续问题
  List<String> _suggestedReplies = [];
  List<String> get suggestedReplies => _suggestedReplies;
  void clearSuggestions() { _suggestedReplies = []; notifyListeners(); }

  // 智能体
  List<Agent> _agents = [];
  List<Agent> get agents => _agents;
  Agent? _selectedAgent;
  Agent? get selectedAgent => _selectedAgent;

  // 模型接入点
  List<Map<String, dynamic>> _apiProfiles = [];
  List<Map<String, dynamic>> get apiProfiles => _apiProfiles;
  Map<String, dynamic>? get activeProfile =>
      _apiProfiles.where((p) => p['is_active'] == true || p['is_active'] == 1).firstOrNull;

  AppState() {
    wsClient = WsClient();
    connectionManager = ConnectionManager(apiClient: apiClient, wsClient: wsClient);
    wsClient.addHandler(_handleWsEvent);

    // WS 连接/断线监听（断线提示防抖 4s，避免重连过程中顶部红条闪烁）
    wsClient.onConnected = () {
      _wsDisconnectDebounce?.cancel();
      if (!_wsConnected) {
        _wsConnected = true;
        notifyListeners();
      }
    };
    wsClient.onDisconnected = () {
      _wsDisconnectDebounce?.cancel();
      _wsDisconnectDebounce = Timer(const Duration(seconds: 4), () {
        if (!wsClient.connected && !wsClient.connecting) {
          _wsConnected = false;
          notifyListeners();
        }
      });
    };

    // WS 重连后补拉当前会话最新消息（流式进行中不重载，避免打断 liveBlocks）
    wsClient.onReconnect = () {
      _wsDisconnectDebounce?.cancel();
      _wsConnected = true;
      notifyListeners();
      if (_activeSession != null && !_streaming) {
        loadMessages(_activeSession!.id);
      }
    };

    // 推送通知点击回调：跳转到对应会话
    PushService().onNotificationTap = _onPushNotificationTap;
  }

  void _onPushNotificationTap(int sessionId) {
    final session = _sessions.cast<Session?>().firstWhere(
      (s) => s?.id == sessionId,
      orElse: () => null,
    );
    if (session != null) {
      setActiveSession(session);
    } else {
      // 会话不在列表中，先刷新再尝试跳转
      loadSessions().then((_) {
        final s = _sessions.cast<Session?>().firstWhere(
          (s) => s?.id == sessionId,
          orElse: () => null,
        );
        if (s != null) setActiveSession(s);
      });
    }
  }

  Future<void> init() async {
    _connecting = true;
    notifyListeners();

    _paired = await connectionManager.restoreFromStorage();

    _connecting = false;
    notifyListeners();

    if (_paired) {
      await loadAgents();
      await loadApiProfiles();
      await loadSessions();

      try {
        final prefs = await SharedPreferences.getInstance();
        final deviceId = prefs.getString('device_id') ?? '';
        if (deviceId.isNotEmpty) {
          PushService().registerToken(apiClient, deviceId);
        }
      } catch (_) {}
    }
  }

  /// 配对成功后调用
  Future<void> onPaired({
    required String pairToken,
    required String lanIP,
    required String lanPort,
    String? wanTunnelToken,
    String? wanSignalingUrl,
  }) async {
    _connecting = true;
    notifyListeners();

    _paired = await connectionManager.savePairingAndConnect(
      pairToken: pairToken,
      lanIP: lanIP,
      lanPort: lanPort,
      wanTunnelToken: wanTunnelToken,
      wanSignalingUrl: wanSignalingUrl,
    );

    _connecting = false;
    notifyListeners();

    if (_paired) {
      await loadAgents();
      await loadApiProfiles();
      await loadSessions();

      try {
        final prefs = await SharedPreferences.getInstance();
        final deviceId = prefs.getString('device_id') ?? '';
        if (deviceId.isNotEmpty) {
          PushService().registerToken(apiClient, deviceId);
        }
      } catch (_) {}
    }
  }

  /// 断开配对
  Future<void> unpair() async {
    await connectionManager.disconnect();
    _paired = false;
    _sessions = [];
    _messages = [];
    _activeSession = null;
    _agents = [];
    _selectedAgent = null;
    _liveBlocks = [];
    _streaming = false;
    notifyListeners();
  }

  // ── 智能体 ──────────────────────────────────────────────────

  Future<void> loadAgents() async {
    try {
      final data = await apiClient.listAgents();
      _agents = data.map((j) => Agent.fromJson(j)).toList();
      notifyListeners();
    } catch (_) {}
  }

  void selectAgent(Agent? agent) {
    _selectedAgent = agent;
    notifyListeners();
    // 如果当前有活跃会话，同步更新后端会话绑定的智能体
    if (_activeSession != null && agent != null) {
      apiClient.setSessionAgent(_activeSession!.id, agent.id).catchError((_) {});
    }
  }

  // ── 模型接入点 ──────────────────────────────────────────────────

  Future<void> loadApiProfiles() async {
    try {
      final data = await apiClient.listApiProfiles();
      _apiProfiles = data.map((j) => Map<String, dynamic>.from(j)).toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> activateProfile(int id) async {
    try {
      await apiClient.activateApiProfile(id);
      await loadApiProfiles();
    } catch (_) {}
  }

  // ── 会话 ────────────────────────────────────────────────────

  Future<void> loadSessions() async {
    try {
      final data = await apiClient.listSessions();
      _sessions = data.map((j) => Session.fromJson(j)).toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> setActiveSession(Session? session) async {
    if (_activeSession != null) {
      wsClient.unsubscribe(_activeSession!.id);
    }

    _activeSession = session;
    _messages = [];
    _liveBlocks = [];
    _streaming = false;
    notifyListeners();

    if (session != null) {
      wsClient.subscribe(session.id);
      await loadMessages(session.id);
    }
  }

  Future<void> createNewSession() async {
    try {
      final data = await apiClient.createSession({
        'title': '新对话',
        'agent_id': _selectedAgent?.id ?? 0,
      });
      final session = Session.fromJson(data);
      _sessions.insert(0, session);
      await setActiveSession(session);
    } catch (_) {}
  }

  Future<void> deleteSessionById(int id) async {
    try {
      await apiClient.deleteSession(id);
      _sessions.removeWhere((s) => s.id == id);
      if (_activeSession?.id == id) {
        _activeSession = null;
        _messages = [];
        _liveBlocks = [];
        _streaming = false;
      }
      notifyListeners();
    } catch (_) {}
  }

  // ── 消息 ────────────────────────────────────────────────────

  /// 合并后端返回的消息列表与本地 optimistic 消息
  ///
  /// 修复 bug:done 事件后 1.5s 加载消息时,后端可能尚未持久化最新 assistant 消息,
  /// 导致界面上消息瞬间消失再恢复。策略：
  /// 1. 优先用后端数据
  /// 2. 如果本地最后一条 assistant 消息的 ID 是本地时间戳（>= 2020-01-01 ms），
  ///    且后端最新消息的尾部内容不包含本地消息的内容,则保留本地这条
  List<Message> _mergeMessagesWithLocal(List<Message> fetched) {
    if (_messages.isEmpty) return fetched;

    // 找到本地最后一条 assistant 消息
    Message? localLast;
    for (int i = _messages.length - 1; i >= 0; i--) {
      if (_messages[i].role == 'assistant') {
        localLast = _messages[i];
        break;
      }
    }
    if (localLast == null) return fetched;

    // 本地 optimistic 消息特征：ID 是 millisecondsSinceEpoch（很大的数）
    // 服务器消息 ID 通常是自增整数（较小）
    final isOptimistic = localLast.id > 1577808000000; // 2020-01-01 ms 阈值
    if (!isOptimistic) return fetched;

    // 检查后端是否已经返回了这条消息（内容前缀匹配）
    final localPrefix = localLast.content.length > 50
        ? localLast.content.substring(0, 50)
        : localLast.content;

    for (final m in fetched) {
      if (m.role == 'assistant' && m.content.startsWith(localPrefix)) {
        // 后端已持久化,使用后端版本
        return fetched;
      }
    }

    // 后端还没返回这条消息,保留本地版本附加到 fetched 末尾
    return [...fetched, localLast];
  }

  Future<void> loadMessages(int sessionId) async {
    try {
      // 默认加载最新 50 条
      final result = await apiClient.listMessagesPaged(sessionId, limit: 50);
      final fetched = (result['messages'] as List).map((j) => Message.fromJson(j)).toList();

      // 合并策略：如果本地有 optimistic assistant 消息（id 为时间戳，远大于服务器 id），
      // 且后端返回的消息中没有匹配的最新 assistant 内容,则保留本地版本,避免消息瞬间消失。
      _messages = _mergeMessagesWithLocal(fetched);
      _hasMoreMessages = result['has_more'] == true;
      notifyListeners();
    } catch (_) {
      // fallback: 无分页接口时走旧逻辑
      try {
        final data = await apiClient.listMessages(sessionId);
        final fetched = data.map((j) => Message.fromJson(j)).toList();
        _messages = _mergeMessagesWithLocal(fetched);
        _hasMoreMessages = false;
        notifyListeners();
      } catch (_) {}
    }
  }

  /// 加载更早的消息（上滑分页）
  Future<void> loadOlderMessages() async {
    if (_activeSession == null || !_hasMoreMessages || _loadingOlder) return;
    if (_messages.isEmpty) return;

    _loadingOlder = true;
    notifyListeners();

    try {
      final beforeId = _messages.first.id;
      final result = await apiClient.listMessagesPaged(
        _activeSession!.id,
        beforeId: beforeId,
        limit: 30,
      );
      final older = (result['messages'] as List).map((j) => Message.fromJson(j)).toList();
      _hasMoreMessages = result['has_more'] == true;
      _messages = [...older, ..._messages];
    } catch (_) {
      _hasMoreMessages = false;
    }

    _loadingOlder = false;
    notifyListeners();
  }

  /// 发送消息
  Future<void> sendMessage(String text, {List<String>? images}) async {
    _suggestedReplies = [];

    if (_activeSession == null) {
      await createNewSession();
    }
    if (_activeSession == null) return;

    final sessionId = _activeSession!.id;

    final userMsg = Message(
      id: DateTime.now().millisecondsSinceEpoch,
      sessionId: sessionId,
      role: 'user',
      content: text,
      createdAt: DateTime.now().toIso8601String(),
    );
    _messages.add(userMsg);
    _streaming = true;
    _liveBlocks = [];
    notifyListeners();

    try {
      final body = <String, dynamic>{
        'message': text,
        'sessionId': sessionId.toString(),
        'useKB': false,
      };
      if (images != null && images.isNotEmpty) {
        body['images'] = images;
      }
      await apiClient.chat(body);
    } catch (e) {
      _streaming = false;
      notifyListeners();
      // API 失败时兜底刷新
      if (_activeSession?.id == sessionId) {
        await loadMessages(sessionId);
      }
      return;
    }

    // chat() 成功返回后等待 WS done 事件完成流式。
    // 延迟兜底：如果 30 秒后 streaming 仍在（WS 未收到 done），强制结束
    Future.delayed(const Duration(seconds: 30), () {
      if (_streaming && _activeSession?.id == sessionId) {
        _finalizeLiveBlocks();
        _streaming = false;
        _liveBlocks = [];
        notifyListeners();
        loadMessages(sessionId);
      }
    });
  }

  /// 提交 ask_question 的回答（以普通消息形式发送）
  Future<void> submitQuestionAnswer(String questionId, String answer) async {
    // 标记该 ask_question block 为已回答
    for (final b in _liveBlocks) {
      if (b.type == 'ask_question' && b.questionId == questionId) {
        b.answered = true;
        break;
      }
    }
    notifyListeners();

    await sendMessage(answer);
  }

  /// 中止对话
  Future<void> abortChat() async {
    if (_activeSession == null) return;
    try {
      await apiClient.abortChat(_activeSession!.id);
    } catch (_) {}
    // 立即合并当前流式内容为消息
    _finalizeLiveBlocks();
    _streaming = false;
    notifyListeners();
  }

  /// 消息反馈
  Future<void> setMessageFeedback(int messageId, String feedback) async {
    try {
      await apiClient.post('/api/messages/$messageId/feedback', {'feedback': feedback});
      final idx = _messages.indexWhere((m) => m.id == messageId);
      if (idx >= 0) {
        final old = _messages[idx];
        _messages[idx] = Message(
          id: old.id,
          sessionId: old.sessionId,
          role: old.role,
          content: old.content,
          createdAt: old.createdAt,
          pinned: old.pinned,
          feedback: old.feedback == feedback ? null : feedback,
          blocks: old.blocks,
        );
        notifyListeners();
      }
    } catch (_) {}
  }

  /// 编辑消息并重发
  Future<void> editAndResend(int messageId, String newContent) async {
    if (_activeSession == null) return;
    try {
      await apiClient.updateMessage(messageId, newContent);
      // 重新加载消息（后端已删除后续消息）
      await loadMessages(_activeSession!.id);
      // 自动重发编辑后的消息
      _streaming = true;
      _liveBlocks = [];
      notifyListeners();

      await apiClient.chat({
        'message': newContent,
        'sessionId': _activeSession!.id.toString(),
        'useKB': false,
      });
    } catch (e) {
      _streaming = false;
      notifyListeners();
    }
  }

  /// 固定/取消固定消息
  Future<void> togglePin(int messageId) async {
    try {
      await apiClient.toggleMessagePin(messageId);
      final idx = _messages.indexWhere((m) => m.id == messageId);
      if (idx >= 0) {
        final old = _messages[idx];
        _messages[idx] = Message(
          id: old.id,
          sessionId: old.sessionId,
          role: old.role,
          content: old.content,
          createdAt: old.createdAt,
          pinned: !old.pinned,
          feedback: old.feedback,
          blocks: old.blocks,
        );
        notifyListeners();
      }
    } catch (_) {}
  }

  /// 流式事件节流通知：标记脏位，50ms 后统一刷新，减少 widget rebuild
  void _throttledNotify() {
    _streamDirty = true;
    _streamThrottle ??= Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (_streamDirty) {
        _streamDirty = false;
        notifyListeners();
      } else {
        _streamThrottle?.cancel();
        _streamThrottle = null;
      }
    });
  }

  // ── WS 事件处理（块级） ──────────────────────────────────────

  void _handleWsEvent(String event, dynamic data, int? sessionId) {
    // 非当前会话的事件直接跳过——进入会话时 setActiveSession 会 loadMessages 拉最新
    if (sessionId != null && sessionId != _activeSession?.id) return;

    Map<String, dynamic>? payload;
    if (data is Map) {
      payload = Map<String, dynamic>.from(data);
    } else if (data is String) {
      try { payload = jsonDecode(data); } catch (_) {}
    }

    switch (event) {
      case 'stream_start':
        _streaming = true;
        _liveBlocks = [];
        notifyListeners();
        break;

      case 'agent_state':
        final state = payload?['state']?.toString() ?? '';
        if (state == 'THINKING' && !_streaming) {
          _streaming = true;
          _liveBlocks = [];
          notifyListeners();
        }
        break;

      case 'content_block_start':
        final type = payload?['type']?.toString() ?? '';
        if (type == 'thinking') {
          _liveBlocks.add(LiveBlock(type: 'thinking'));
          notifyListeners();
        }
        break;

      case 'thinking_delta':
      case 'thinking':
        final text = payload?['text']?.toString() ?? data?.toString() ?? '';
        if (text.isNotEmpty) {
          final last = _liveBlocks.isNotEmpty ? _liveBlocks.last : null;
          if (last != null && last.type == 'thinking' && !last.done) {
            last.text += text;
          } else {
            _liveBlocks.add(LiveBlock(type: 'thinking', text: text));
          }
          _throttledNotify();
        }
        break;

      case 'thinking_done':
        for (int i = _liveBlocks.length - 1; i >= 0; i--) {
          if (_liveBlocks[i].type == 'thinking' && !_liveBlocks[i].done) {
            _liveBlocks[i].done = true;
            break;
          }
        }
        notifyListeners();
        break;

      case 'stream_delta':
      case 'text':
        final text = payload?['text']?.toString() ?? data?.toString() ?? '';
        if (text.isNotEmpty) {
          final last = _liveBlocks.isNotEmpty ? _liveBlocks.last : null;
          if (last != null && last.type == 'text') {
            last.text += text;
          } else {
            _liveBlocks.add(LiveBlock(type: 'text', text: text));
          }
          _throttledNotify();
        }
        break;

      case 'tool_start':
        _liveBlocks.add(LiveBlock(
          type: 'tool',
          toolName: payload?['name']?.toString() ?? '',
          toolLabel: payload?['label']?.toString(),
          startedAt: DateTime.now().millisecondsSinceEpoch,
        ));
        notifyListeners();
        break;

      case 'tool_end':
        if (payload?['hidden'] == true) break;
        for (int i = _liveBlocks.length - 1; i >= 0; i--) {
          if (_liveBlocks[i].type == 'tool' && !_liveBlocks[i].done) {
            _liveBlocks[i].done = true;
            _liveBlocks[i].ms = payload?['ms'] as int?;
            _liveBlocks[i].status = payload?['status']?.toString();
            if (payload?['input'] != null) {
              if (payload!['input'] is String) {
                try {
                  final decoded = jsonDecode(payload['input']);
                  if (decoded is Map) {
                    _liveBlocks[i].input = Map<String, dynamic>.from(decoded);
                  }
                } catch (_) {
                  _liveBlocks[i].input = {'raw': payload['input']};
                }
              } else if (payload['input'] is Map) {
                _liveBlocks[i].input = Map<String, dynamic>.from(payload['input']);
              }
            }
            break;
          }
        }
        notifyListeners();
        break;

      case 'done':
        _streamThrottle?.cancel();
        _streamThrottle = null;
        // 生成推荐问题（基于最后一条 AI 回复文本）
        final lastText = _liveBlocks.where((b) => b.type == 'text').map((b) => b.text).join();
        _suggestedReplies = _generateQuickReplies(lastText);
        _finalizeLiveBlocks();
        _streaming = false;
        _liveBlocks = [];
        notifyListeners();
        // 延迟重载：给后端 2s 持久化时间，使用合并策略避免竞态导致消息消失
        if (_activeSession != null) {
          final sid = _activeSession!.id;
          Future.delayed(const Duration(milliseconds: 2000), () {
            if (_activeSession?.id == sid && !_streaming) {
              loadMessages(sid);
            }
          });
        }
        break;

      case 'ask_question': {
        final question = payload?['question']?.toString() ?? '';
        final rawOptions = payload?['options'];
        List<Map<String, dynamic>> options = [];
        if (rawOptions is List) {
          options = rawOptions.map((o) => Map<String, dynamic>.from(o as Map)).toList();
        }
        _liveBlocks.add(LiveBlock(
          type: 'ask_question',
          question: question,
          options: options,
          allowCustom: payload?['allow_custom'] != false,
          questionId: payload?['id']?.toString(),
        ));
        notifyListeners();
        break;
      }

      case 'error':
        _streamThrottle?.cancel();
        _streamThrottle = null;
        _finalizeLiveBlocks();
        _streaming = false;
        _liveBlocks = [];
        notifyListeners();
        break;
    }
  }

  /// 将当前 liveBlocks 合并为一条 assistant 消息
  void _finalizeLiveBlocks() {
    if (_liveBlocks.isEmpty) return;

    final textBuf = StringBuffer();
    final blocks = <MessageBlock>[];
    for (final b in _liveBlocks) {
      blocks.add(b.toMessageBlock());
      if (b.type == 'text') textBuf.write(b.text);
    }

    final content = textBuf.toString();
    if (content.isNotEmpty || blocks.any((b) => b.type == 'tool')) {
      _messages.add(Message(
        id: DateTime.now().millisecondsSinceEpoch,
        sessionId: _activeSession?.id ?? 0,
        role: 'assistant',
        content: content,
        createdAt: DateTime.now().toIso8601String(),
        blocks: blocks,
      ));
    }
  }

  /// 基于最后回复文本生成推荐后续问题
  List<String> _generateQuickReplies(String text) {
    if (text.length < 50) return [];
    final replies = <String>[];
    if (text.contains('代码') || text.contains('function') || text.contains('class')) {
      replies.add('帮我优化这段代码');
    }
    if (text.contains('步骤') || text.contains('方法') || text.contains('方式')) {
      replies.add('能展开说说吗');
    }
    if (text.length > 200) {
      replies.add('帮我总结要点');
    }
    if (replies.isEmpty) {
      replies.add('继续');
      replies.add('还有其他建议吗');
    }
    return replies.take(3).toList();
  }

  @override
  void dispose() {
    _streamThrottle?.cancel();
    _wsDisconnectDebounce?.cancel();
    connectionManager.dispose();
    super.dispose();
  }
}
