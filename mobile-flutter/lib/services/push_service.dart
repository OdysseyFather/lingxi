import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_client.dart';

/// 推送通知服务：FCM token 获取 + 前台通知展示 + 点击跳转
/// Firebase 完全延迟初始化——没有 google-services.json 时自动降级为无推送模式
class PushService {
  static final PushService _instance = PushService._();
  factory PushService() => _instance;
  PushService._();

  final _localNotifications = FlutterLocalNotificationsPlugin();
  bool _firebaseAvailable = false;
  FirebaseMessaging? _messaging;

  Function(int sessionId)? onNotificationTap;

  Future<void> init() async {
    // 尝试初始化 Firebase（缺少 google-services.json 时会失败）
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      _firebaseAvailable = true;
      _messaging = FirebaseMessaging.instance;
    } catch (e) {
      debugPrint('[PushService] Firebase 不可用，推送功能已禁用: $e');
      _firebaseAvailable = false;
      return;
    }

    try {
      final messaging = _messaging!;

      // 请求通知权限
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return;
      }

      // 初始化本地通知（前台展示用）
      await _localNotifications.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: _onNotificationTap,
      );

      // Android 高优先级通知渠道
      if (Platform.isAndroid) {
        const channel = AndroidNotificationChannel(
          'lingxi_messages',
          '灵犀消息',
          description: 'AI 回复完成通知',
          importance: Importance.high,
        );
        await _localNotifications
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(channel);
      }

      // 前台消息：显示本地通知
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      // 点击通知打开 App
      FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpenedApp);

      // App 从完全关闭状态通过通知打开
      final initialMessage = await messaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationData(initialMessage.data);
      }
    } catch (e) {
      debugPrint('[PushService] 推送设置失败: $e');
      _firebaseAvailable = false;
    }
  }

  /// 获取 FCM token
  Future<String?> getToken() async {
    if (!_firebaseAvailable || _messaging == null) return null;
    try {
      return await _messaging!.getToken();
    } catch (_) {
      return null;
    }
  }

  /// 向 PC 后端注册推送 token
  Future<void> registerToken(ApiClient apiClient, String deviceId) async {
    final token = await getToken();
    if (token == null || token.isEmpty) return;

    try {
      await apiClient.post('/api/pair/devices/$deviceId/push-token', {
        'push_token': token,
      });
    } catch (_) {}

    // 监听 token 刷新
    if (_messaging != null) {
      try {
        _messaging!.onTokenRefresh.listen((newToken) {
          apiClient.post('/api/pair/devices/$deviceId/push-token', {
            'push_token': newToken,
          });
        });
      } catch (_) {}
    }
  }

  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      message.hashCode,
      notification.title ?? '灵犀',
      notification.body ?? '',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'lingxi_messages',
          '灵犀消息',
          icon: '@mipmap/ic_launcher',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: message.data['session_id'],
    );
  }

  void _onNotificationTap(NotificationResponse response) {
    if (response.payload != null) {
      final sessionId = int.tryParse(response.payload!);
      if (sessionId != null && onNotificationTap != null) {
        onNotificationTap!(sessionId);
      }
    }
  }

  void _onMessageOpenedApp(RemoteMessage message) {
    _handleNotificationData(message.data);
  }

  void _handleNotificationData(Map<String, dynamic> data) {
    final sessionIdStr = data['session_id'];
    if (sessionIdStr != null) {
      final sessionId = int.tryParse(sessionIdStr.toString());
      if (sessionId != null && onNotificationTap != null) {
        onNotificationTap!(sessionId);
      }
    }
  }
}
