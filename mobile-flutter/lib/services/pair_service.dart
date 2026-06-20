import 'dart:convert';
import 'package:http/http.dart' as http;

/// 配对数据（QR 码中包含的信息）
class PairData {
  final String challenge;
  final String lanIP;
  final String lanPort;
  final String? wanTunnelToken;
  final String? wanSignalingUrl;

  PairData({
    required this.challenge,
    required this.lanIP,
    required this.lanPort,
    this.wanTunnelToken,
    this.wanSignalingUrl,
  });

  /// 从 QR 码 JSON 字符串解析
  /// 后端 QR 数据格式：{type, v, challenge, lan:"ip:port", wan_sig?, wan_tok?}
  factory PairData.fromQrJson(String json) {
    final data = jsonDecode(json);

    // lan 字段格式为 "ip:port"，需要拆分
    String lanIP = '';
    String lanPort = '3001';
    final lan = data['lan']?.toString() ?? '';
    if (lan.contains(':')) {
      final parts = lan.split(':');
      lanIP = parts[0];
      lanPort = parts.length > 1 ? parts[1] : '3001';
    } else if (lan.isNotEmpty) {
      lanIP = lan;
    }

    return PairData(
      challenge: data['challenge'] ?? '',
      lanIP: lanIP,
      lanPort: lanPort,
      wanTunnelToken: data['wan_tok'],
      wanSignalingUrl: data['wan_sig'],
    );
  }
}

/// 配对结果
class PairResult {
  final bool success;
  final String? pairToken;
  final String? lanIP;
  final String? lanPort;
  final String? wanTunnelToken;
  final String? error;

  PairResult({
    required this.success,
    this.pairToken,
    this.lanIP,
    this.lanPort,
    this.wanTunnelToken,
    this.error,
  });
}

/// 配对服务：处理 QR 扫码和手动输码两种方式
class PairService {
  /// 通过 QR 码完成配对
  Future<PairResult> pairWithQrData(String qrJson, String deviceId, String deviceName) async {
    try {
      final pairData = PairData.fromQrJson(qrJson);
      return await _completePairing(
        pairData: pairData,
        deviceId: deviceId,
        deviceName: deviceName,
      );
    } catch (e) {
      return PairResult(success: false, error: '无法解析二维码: $e');
    }
  }

  /// 通过手动输入 6 位配对码完成配对
  Future<PairResult> pairWithCode({
    required String code,
    required String serverAddress,
    required String deviceId,
    required String deviceName,
  }) async {
    final uri = Uri.parse(serverAddress);
    final baseUrl = '${uri.scheme}://${uri.host}:${uri.port}';

    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/pair/complete'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'code': code,
          'device_id': deviceId,
          'device_name': deviceName,
          'platform': 'mobile',
        }),
      ).timeout(const Duration(seconds: 10));

      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body);
        return PairResult(
          success: true,
          pairToken: data['pair_token'],
          lanIP: data['lan_ip'],
          lanPort: data['lan_port']?.toString(),
          wanTunnelToken: data['wan_tunnel_token'],
        );
      } else {
        String err = '配对失败 (${resp.statusCode})';
        try {
          err = jsonDecode(resp.body)['error'] ?? err;
        } catch (_) {}
        return PairResult(success: false, error: err);
      }
    } catch (e) {
      return PairResult(success: false, error: '连接失败: $e');
    }
  }

  Future<PairResult> _completePairing({
    required PairData pairData,
    required String deviceId,
    required String deviceName,
  }) async {
    // 尝试 LAN 直连
    final lanUrl = 'http://${pairData.lanIP}:${pairData.lanPort}';
    var result = await _tryComplete(lanUrl, pairData.challenge, deviceId, deviceName);
    if (result.success) {
      return PairResult(
        success: true,
        pairToken: result.pairToken,
        lanIP: pairData.lanIP,
        lanPort: pairData.lanPort,
        wanTunnelToken: result.wanTunnelToken ?? pairData.wanTunnelToken,
      );
    }

    // 回退到 WAN 隧道
    if (pairData.wanTunnelToken != null && pairData.wanSignalingUrl != null) {
      final sigUrl = pairData.wanSignalingUrl!;
      final httpBase = sigUrl
          .replaceFirst('wss://', 'https://')
          .replaceFirst('ws://', 'http://');
      // 移除末尾 /ws 路径
      final cleanBase = httpBase.endsWith('/ws')
          ? httpBase.substring(0, httpBase.length - 3)
          : httpBase;
      final wanUrl = '$cleanBase/tunnel/${pairData.wanTunnelToken}';
      result = await _tryComplete(wanUrl, pairData.challenge, deviceId, deviceName);
      if (result.success) {
        return PairResult(
          success: true,
          pairToken: result.pairToken,
          lanIP: pairData.lanIP,
          lanPort: pairData.lanPort,
          wanTunnelToken: result.wanTunnelToken ?? pairData.wanTunnelToken,
        );
      }
    }

    return PairResult(success: false, error: '无法连接到电脑（LAN 和 WAN 均失败）');
  }

  Future<PairResult> _tryComplete(
    String baseUrl,
    String challenge,
    String deviceId,
    String deviceName,
  ) async {
    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/pair/complete'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'challenge': challenge,
          'device_id': deviceId,
          'device_name': deviceName,
          'platform': 'mobile',
        }),
      ).timeout(const Duration(seconds: 10));

      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body);
        return PairResult(
          success: true,
          pairToken: data['pair_token'],
          lanIP: data['lan_ip'],
          lanPort: data['lan_port']?.toString(),
          wanTunnelToken: data['wan_tunnel_token'],
        );
      }
      return PairResult(success: false, error: '');
    } catch (_) {
      return PairResult(success: false, error: '');
    }
  }
}
