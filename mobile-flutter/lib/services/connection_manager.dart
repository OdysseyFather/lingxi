import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'ws_client.dart';

enum ConnectionMode { lan, wan, none }

/// 连接管理器：自动检测 LAN 直连 / WAN 隧道，维护心跳
class ConnectionManager {
  final ApiClient apiClient;
  final WsClient wsClient;

  String _lanUrl = '';
  String _wanUrl = '';
  String _pairToken = '';
  String _activeUrl = '';
  ConnectionMode _mode = ConnectionMode.none;
  Timer? _heartbeatTimer;
  Timer? _connectivityDebounce;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  bool _connected = false;
  bool _probing = false; // 防止并发 probe

  ConnectionMode get mode => _mode;
  bool get connected => _connected;
  String get activeUrl => _mode == ConnectionMode.lan ? _lanUrl : _wanUrl;
  String get pairToken => _pairToken;

  ConnectionManager({required this.apiClient, required this.wsClient});

  /// 从持久化中恢复配对信息
  Future<bool> restoreFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    _pairToken = prefs.getString('pair_token') ?? '';
    _lanUrl = prefs.getString('lan_url') ?? '';
    _wanUrl = prefs.getString('wan_url') ?? '';

    if (_pairToken.isEmpty) return false;

    return await _tryConnect();
  }

  /// 配对成功后保存并连接
  Future<bool> savePairingAndConnect({
    required String pairToken,
    required String lanIP,
    required String lanPort,
    String? wanTunnelToken,
    String? wanSignalingUrl,
  }) async {
    _pairToken = pairToken;
    _lanUrl = 'http://$lanIP:$lanPort';
    if (wanTunnelToken != null && wanTunnelToken.isNotEmpty && wanSignalingUrl != null) {
      final httpBase = wanSignalingUrl
          .replaceFirst('wss://', 'https://')
          .replaceFirst('ws://', 'http://')
          .replaceFirst('/ws', '');
      _wanUrl = '$httpBase/tunnel/$wanTunnelToken';
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pair_token', _pairToken);
    await prefs.setString('lan_url', _lanUrl);
    await prefs.setString('wan_url', _wanUrl);

    return await _tryConnect();
  }

  Future<bool> _tryConnect() async {
    if (_probing) return _connected;
    _probing = true;

    try {
      // 优先尝试 LAN 直连
      if (_lanUrl.isNotEmpty && await _probe(_lanUrl)) {
        _mode = ConnectionMode.lan;
        _activate(_lanUrl);
        return true;
      }
      // 回退 WAN 隧道
      if (_wanUrl.isNotEmpty && await _probe(_wanUrl)) {
        _mode = ConnectionMode.wan;
        _activate(_wanUrl);
        return true;
      }
      _mode = ConnectionMode.none;
      _connected = false;
      return false;
    } finally {
      _probing = false;
    }
  }

  Future<bool> _probe(String baseUrl) async {
    try {
      final resp = await http.get(
        Uri.parse('$baseUrl/api/ping'),
      ).timeout(const Duration(seconds: 5));
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  void _activate(String baseUrl) {
    apiClient.configure(baseUrl: baseUrl, pairToken: _pairToken);
    _connected = true;

    // 仅当 URL 变化或 WS 未连接且未在连接中时才重建 WebSocket
    if (_activeUrl != baseUrl) {
      _activeUrl = baseUrl;
      wsClient.connect(baseUrl: baseUrl, pairToken: _pairToken);
    } else if (!wsClient.connected && !wsClient.connecting) {
      wsClient.reconnectNow();
    }

    _startHeartbeat();
    _startConnectivityMonitor();
  }

  void _startConnectivityMonitor() {
    _connectivitySub?.cancel();
    _connectivityDebounce?.cancel();
    _connectivitySub = Connectivity().onConnectivityChanged.listen((_) {
      // 防抖 5 秒：移动端网络抖动频繁，避免频繁重连打断流式
      _connectivityDebounce?.cancel();
      _connectivityDebounce = Timer(const Duration(seconds: 5), () {
        // 仅在 WS 真正断开时才尝试重连
        if (!wsClient.connected && !wsClient.connecting) {
          _tryConnect();
        }
      });
    });
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      if (_activeUrl.isEmpty) return;

      final ok = await apiClient.healthCheck();
      if (!ok) {
        // HTTP 不可达：尝试切换 LAN/WAN
        if (_connected) {
          _connected = false;
          await _tryConnect();
        }
        return;
      }

      // HTTP 正常但 WS 断了且未在重连中：触发重连
      if (!wsClient.connected && !wsClient.connecting && _pairToken.isNotEmpty) {
        wsClient.reconnectNow();
      }
    });
  }

  /// 断开连接并清除配对信息
  Future<void> disconnect() async {
    _heartbeatTimer?.cancel();
    _connectivityDebounce?.cancel();
    _connectivitySub?.cancel();
    wsClient.disconnect();
    _connected = false;
    _activeUrl = '';
    _mode = ConnectionMode.none;
    _pairToken = '';

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('pair_token');
    await prefs.remove('lan_url');
    await prefs.remove('wan_url');
  }

  void dispose() {
    _heartbeatTimer?.cancel();
    _connectivityDebounce?.cancel();
    _connectivitySub?.cancel();
    wsClient.disconnect();
  }
}
