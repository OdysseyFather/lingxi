import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 用户偏好设置（主题/字体/通知）
///
/// 持久化到 SharedPreferences,所有页面通过 Provider 监听变更
class UserPreferences extends ChangeNotifier {
  static const _kThemeMode = 'pref_theme_mode';
  static const _kFontScale = 'pref_font_scale';
  static const _kNotifyEnabled = 'pref_notify_enabled';
  static const _kSoundEnabled = 'pref_sound_enabled';
  static const _kStreamSpeed = 'pref_stream_speed';
  static const _kHapticEnabled = 'pref_haptic_enabled';
  static const _kSendOnEnter = 'pref_send_on_enter';

  ThemeMode _themeMode = ThemeMode.system;
  double _fontScale = 1.0;
  bool _notifyEnabled = true;
  bool _soundEnabled = true;
  double _streamSpeed = 1.0;
  bool _hapticEnabled = true;
  bool _sendOnEnter = false;

  ThemeMode get themeMode => _themeMode;
  double get fontScale => _fontScale;
  bool get notifyEnabled => _notifyEnabled;
  bool get soundEnabled => _soundEnabled;
  double get streamSpeed => _streamSpeed;
  bool get hapticEnabled => _hapticEnabled;
  bool get sendOnEnter => _sendOnEnter;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();

    final themeIdx = prefs.getInt(_kThemeMode);
    if (themeIdx != null && themeIdx >= 0 && themeIdx < ThemeMode.values.length) {
      _themeMode = ThemeMode.values[themeIdx];
    }
    _fontScale = prefs.getDouble(_kFontScale) ?? 1.0;
    _notifyEnabled = prefs.getBool(_kNotifyEnabled) ?? true;
    _soundEnabled = prefs.getBool(_kSoundEnabled) ?? true;
    _streamSpeed = prefs.getDouble(_kStreamSpeed) ?? 1.0;
    _hapticEnabled = prefs.getBool(_kHapticEnabled) ?? true;
    _sendOnEnter = prefs.getBool(_kSendOnEnter) ?? false;
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    _themeMode = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kThemeMode, mode.index);
  }

  Future<void> setFontScale(double scale) async {
    // 限制范围 0.85 ~ 1.5
    _fontScale = scale.clamp(0.85, 1.5);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_kFontScale, _fontScale);
  }

  Future<void> setNotifyEnabled(bool v) async {
    _notifyEnabled = v;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kNotifyEnabled, v);
  }

  Future<void> setSoundEnabled(bool v) async {
    _soundEnabled = v;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kSoundEnabled, v);
  }

  Future<void> setStreamSpeed(double v) async {
    _streamSpeed = v.clamp(0.5, 2.0);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_kStreamSpeed, _streamSpeed);
  }

  Future<void> setHapticEnabled(bool v) async {
    _hapticEnabled = v;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kHapticEnabled, v);
  }

  Future<void> setSendOnEnter(bool v) async {
    _sendOnEnter = v;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kSendOnEnter, v);
  }

  /// 字体大小档位
  String get fontScaleLabel {
    if (_fontScale <= 0.9) return '小';
    if (_fontScale <= 1.05) return '标准';
    if (_fontScale <= 1.2) return '大';
    return '超大';
  }

  /// 主题模式标签
  String get themeModeLabel {
    switch (_themeMode) {
      case ThemeMode.light: return '亮色';
      case ThemeMode.dark: return '暗色';
      case ThemeMode.system: return '跟随系统';
    }
  }
}
