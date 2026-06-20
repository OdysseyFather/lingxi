import 'dart:async';
import 'dart:convert';
import 'dart:ui' show VoidCallback;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

typedef WsEventHandler = void Function(String event, dynamic data, int? sessionId);
typedef WsReconnectCallback = void Function();

/// WebSocket 客户端：pair_token 认证 + 自动重连（指数退避）+ 事件分发
class WsClient {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _reconnectTimer;
  Timer? _pingTimer;

  String _baseUrl = '';
  String _pairToken = '';
  bool _connected = false;
  bool _connecting = false;
  bool _intentionalClose = false;
  bool _hasConnectedBefore = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectDelay = 30; // 最大重连间隔秒数
  final Set<int> _subscribedSessions = {};
  final List<WsEventHandler> _handlers = [];

  /// 重连成功后的回调，用于通知上层补拉增量消息
  WsReconnectCallback? onReconnect;

  /// 连接/断线回调
  VoidCallback? onConnected;
  VoidCallback? onDisconnected;

  bool get connected => _connected;
  bool get connecting => _connecting;

  WsClient();

  void addHandler(WsEventHandler handler) => _handlers.add(handler);
  void removeHandler(WsEventHandler handler) => _handlers.remove(handler);

  Future<void> connect({required String baseUrl, required String pairToken}) async {
    _baseUrl = baseUrl;
    _pairToken = pairToken;
    _intentionalClose = false;
    _reconnectAttempts = 0;
    await _doConnect();
  }

  Future<void> _doConnect() async {
    if (_connecting) return; // 防止并发连接
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    _connecting = true;

    try {
      _cleanup();

      if (_intentionalClose) {
        _connecting = false;
        return;
      }

      final wsUrl = _baseUrl
          .replaceFirst('https://', 'wss://')
          .replaceFirst('http://', 'ws://');

      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString('device_id') ?? '';
      var wsUri = '$wsUrl/api/ws?pair_token=$_pairToken';
      if (deviceId.isNotEmpty) {
        wsUri += '&device_id=$deviceId';
      }

      _channel = WebSocketChannel.connect(Uri.parse(wsUri));

      // 等待 WebSocket 握手完成（10 秒超时）
      await _channel!.ready.timeout(const Duration(seconds: 10));

      if (_intentionalClose) {
        _cleanup();
        _connecting = false;
        return;
      }

      _subscription = _channel!.stream.listen(
        _onMessage,
        onDone: _onDone,
        onError: _onError,
      );

      _connecting = false;
      _connected = true;
      _reconnectAttempts = 0; // 连接成功，重置退避计数
      onConnected?.call();

      // 立即发送初始消息，重置后端 ReadDeadline（后端 40s 超时）
      if (_subscribedSessions.isNotEmpty) {
        for (final sid in _subscribedSessions) {
          _send({'type': 'subscribe', 'sessionId': sid});
        }
      } else {
        _send({'type': 'ping', 'sessionId': 0});
      }

      // 非首次连接（即重连），通知上层补拉增量消息
      if (_hasConnectedBefore) {
        onReconnect?.call();
      }
      _hasConnectedBefore = true;

      // 定时保活 ping（每 15 秒发一条消息确保 NAT 不超时，服务端 pongTimeout=40s）
      _pingTimer = Timer.periodic(const Duration(seconds: 15), (_) {
        if (!_connected || _channel == null) return;
        if (_subscribedSessions.isNotEmpty) {
          _send({'type': 'subscribe', 'sessionId': _subscribedSessions.first});
        } else {
          // 即使没订阅任何 session，也发一条 ping 保持连接
          _send({'type': 'ping', 'sessionId': 0});
        }
      });
    } catch (e) {
      _connecting = false;
      if (_connected) {
        _connected = false;
        onDisconnected?.call();
      } else if (_hasConnectedBefore) {
        // 重连失败，确保通知断线状态
        onDisconnected?.call();
      }
      _scheduleReconnect();
    }
  }

  void subscribe(int sessionId) {
    _subscribedSessions.add(sessionId);
    if (_connected) {
      _send({'type': 'subscribe', 'sessionId': sessionId});
    }
  }

  void unsubscribe(int sessionId) {
    _subscribedSessions.remove(sessionId);
    if (_connected) {
      _send({'type': 'unsubscribe', 'sessionId': sessionId});
    }
  }

  void _send(Map<String, dynamic> data) {
    if (!_connected || _channel == null) return;
    try {
      _channel?.sink.add(jsonEncode(data));
    } catch (_) {}
  }

  void _onMessage(dynamic raw) {
    try {
      final data = jsonDecode(raw as String);
      final event = data['event'] as String? ?? '';
      final payload = data['data'];
      final sessionId = data['sessionId'] as int?;

      dynamic parsedPayload;
      if (payload is String) {
        try {
          parsedPayload = jsonDecode(payload);
        } catch (_) {
          parsedPayload = payload;
        }
      } else {
        parsedPayload = payload;
      }

      for (final handler in _handlers) {
        handler(event, parsedPayload, sessionId);
      }
    } catch (_) {}
  }

  void _onDone() {
    if (_intentionalClose) return;
    final wasConnected = _connected;
    _connected = false;
    _connecting = false;
    if (wasConnected) {
      onDisconnected?.call();
    }
    _scheduleReconnect();
  }

  void _onError(dynamic error) {
    if (_intentionalClose) return;
    final wasConnected = _connected;
    _connected = false;
    _connecting = false;
    if (wasConnected) {
      onDisconnected?.call();
    }
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_intentionalClose) return;
    _reconnectTimer?.cancel();

    // 指数退避：2^attempt 秒，上限 30 秒
    final delay = (_reconnectAttempts < 5)
        ? (1 << _reconnectAttempts).clamp(1, _maxReconnectDelay)
        : _maxReconnectDelay;
    _reconnectAttempts++;

    _reconnectTimer = Timer(Duration(seconds: delay), () {
      if (!_intentionalClose && !_connecting) {
        _doConnect();
      }
    });
  }

  void _cleanup() {
    _subscription?.cancel();
    _subscription = null;
    _pingTimer?.cancel();
    _pingTimer = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void disconnect() {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _cleanup();
    _connected = false;
    _connecting = false;
    _subscribedSessions.clear();
  }

  /// 外部主动触发重连（如网络恢复时）
  void reconnectNow() {
    if (_intentionalClose || _connecting || _connected) return;
    _reconnectTimer?.cancel();
    _reconnectAttempts = 0;
    _doConnect();
  }
}
