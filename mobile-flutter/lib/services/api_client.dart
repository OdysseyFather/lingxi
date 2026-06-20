import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  String _baseUrl = '';
  String _pairToken = '';

  String get baseUrl => _baseUrl;
  bool get isConfigured => _baseUrl.isNotEmpty && _pairToken.isNotEmpty;

  void configure({required String baseUrl, required String pairToken}) {
    _baseUrl = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    _pairToken = pairToken;
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_pairToken.isNotEmpty) 'X-Pair-Token': _pairToken,
  };

  Future<dynamic> get(String path) async {
    final resp = await http.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
    );
    return _handleResponse(resp);
  }

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    final resp = await http.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleResponse(resp);
  }

  Future<dynamic> put(String path, Map<String, dynamic> body) async {
    final resp = await http.put(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _handleResponse(resp);
  }

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final resp = await http.patch(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _handleResponse(resp);
  }

  Future<dynamic> delete(String path) async {
    final resp = await http.delete(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
    );
    return _handleResponse(resp);
  }

  dynamic _handleResponse(http.Response resp) {
    if (resp.statusCode == 401) {
      throw ApiException('认证失败，请重新配对', resp.statusCode);
    }
    if (resp.statusCode >= 400) {
      String msg = '请求失败 (${resp.statusCode})';
      try {
        final body = jsonDecode(resp.body);
        if (body is Map && body['error'] != null) {
          msg = body['error'];
        }
      } catch (_) {}
      throw ApiException(msg, resp.statusCode);
    }
    if (resp.body.isEmpty) return null;
    return jsonDecode(resp.body);
  }

  // ── 会话 API ──────────────────────────────────────────────────

  Future<List<dynamic>> listSessions({String? agentId}) async {
    String path = '/api/sessions';
    if (agentId != null) path += '?agent_id=$agentId';
    return List<dynamic>.from(await get(path) ?? []);
  }

  Future<dynamic> createSession(Map<String, dynamic> data) =>
      post('/api/sessions', data);

  Future<dynamic> updateSession(int id, Map<String, dynamic> data) =>
      patch('/api/sessions/$id', data);

  Future<void> deleteSession(int id) => delete('/api/sessions/$id');

  Future<List<dynamic>> listMessages(int sessionId) async =>
      List<dynamic>.from(await get('/api/sessions/$sessionId/messages') ?? []);

  /// 分页查询消息：返回 {messages: List, has_more: bool}
  Future<Map<String, dynamic>> listMessagesPaged(int sessionId, {int? beforeId, int limit = 50}) async {
    String path = '/api/sessions/$sessionId/messages?limit=$limit';
    if (beforeId != null) path += '&before_id=$beforeId';
    final result = await get(path);
    if (result is Map) {
      return {
        'messages': List<dynamic>.from(result['messages'] ?? []),
        'has_more': result['has_more'] == true,
      };
    }
    // 兼容旧版后端返回纯数组
    return {
      'messages': List<dynamic>.from(result ?? []),
      'has_more': false,
    };
  }

  // ── 对话 API ──────────────────────────────────────────────────

  Future<dynamic> chat(Map<String, dynamic> data) =>
      post('/api/chat', data);

  Future<void> abortChat(int sessionId) =>
      post('/api/chat/abort', {'sessionId': sessionId.toString()});

  // ── 智能体 API ────────────────────────────────────────────────

  Future<List<dynamic>> listAgents() async =>
      List<dynamic>.from(await get('/api/agents') ?? []);

  Future<dynamic> getAgent(int id) => get('/api/agents/$id');

  // ── 消息操作 ────────────────────────────────────────────────

  Future<dynamic> setMessageFeedback(int id, String feedback) =>
      post('/api/messages/$id/feedback', {'feedback': feedback});

  Future<dynamic> toggleMessagePin(int id) =>
      post('/api/messages/$id/pin');

  Future<dynamic> updateMessage(int id, String content) =>
      put('/api/messages/$id', {'content': content});

  Future<List<dynamic>> searchMessages(String query) async =>
      List<dynamic>.from(await get('/api/messages/search?q=${Uri.encodeComponent(query)}') ?? []);

  // ── 配对验证 ──────────────────────────────────────────────────

  Future<dynamic> pairVerify() => post('/api/pair/verify');

  // ── 模型接入点 ──────────────────────────────────────────────────

  Future<List<dynamic>> listApiProfiles() async {
    final data = await get('/api/api-profiles');
    return data is List ? data : [];
  }

  Future<void> activateApiProfile(int id) async {
    await post('/api/api-profiles/$id/activate');
  }

  // ── 会话智能体绑定 ─────────────────────────────────────────────

  Future<void> setSessionAgent(int sessionId, int agentId) async {
    await post('/api/sessions/$sessionId/agent', {'agent_id': agentId});
  }

  // ── 语音识别 ──────────────────────────────────────────────────

  /// 上传音频文件进行语音识别（Whisper API）
  Future<String> transcribeAudio(List<int> audioBytes, {String filename = 'audio.wav'}) async {
    final uri = Uri.parse('$_baseUrl/api/transcribe');
    final request = http.MultipartRequest('POST', uri);
    request.headers['X-Pair-Token'] = _pairToken;
    request.files.add(http.MultipartFile.fromBytes('file', audioBytes, filename: filename));
    final streamedResp = await request.send();
    final resp = await http.Response.fromStream(streamedResp);
    if (resp.statusCode >= 400) {
      throw ApiException('语音识别失败 (${resp.statusCode})', resp.statusCode);
    }
    final body = jsonDecode(resp.body);
    return body['text']?.toString() ?? '';
  }

  // ── 用量统计 ──────────────────────────────────────────────────

  Future<Map<String, dynamic>> getUsage({String? period}) async {
    String path = '/api/usage';
    if (period != null) path += '?period=$period';
    final data = await get(path);
    return data is Map ? Map<String, dynamic>.from(data) : {};
  }

  // ── 记忆 ──────────────────────────────────────────────────

  Future<List<dynamic>> listMemories({int? agentId}) async {
    String path = '/api/memories';
    if (agentId != null) path += '?agent_id=$agentId';
    return List<dynamic>.from(await get(path) ?? []);
  }

  Future<dynamic> createMemory(Map<String, dynamic> data) =>
      post('/api/memories', data);

  Future<void> deleteMemory(int id) => delete('/api/memories/$id');

  // ── 知识库 ──────────────────────────────────────────────────

  Future<List<dynamic>> listKnowledge() async =>
      List<dynamic>.from(await get('/api/knowledge') ?? []);

  Future<List<dynamic>> searchKnowledge(String query) async =>
      List<dynamic>.from(await get('/api/knowledge/search?q=${Uri.encodeComponent(query)}') ?? []);

  // ── 技能 ──────────────────────────────────────────────────

  Future<List<dynamic>> listSkills() async =>
      List<dynamic>.from(await get('/api/skills') ?? []);

  // ── 健康检查 ──────────────────────────────────────────────────

  Future<bool> healthCheck() async {
    try {
      final data = await get('/api/health');
      return data != null && data['status'] == 'ok';
    } catch (_) {
      return false;
    }
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);

  @override
  String toString() => 'ApiException($statusCode): $message';
}
