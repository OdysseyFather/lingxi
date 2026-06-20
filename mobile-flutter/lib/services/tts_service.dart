import 'package:flutter_tts/flutter_tts.dart';

/// TTS 朗读服务（单例）
class TtsService {
  static final TtsService _instance = TtsService._();
  factory TtsService() => _instance;
  TtsService._();

  final FlutterTts _tts = FlutterTts();
  bool _initialized = false;
  bool _speaking = false;
  int? _currentMessageId;

  bool get speaking => _speaking;
  int? get currentMessageId => _currentMessageId;

  Future<void> _ensureInit() async {
    if (_initialized) return;
    await _tts.setLanguage('zh-CN');
    await _tts.setSpeechRate(0.5);
    await _tts.setVolume(1.0);
    await _tts.setPitch(1.0);

    _tts.setCompletionHandler(() {
      _speaking = false;
      _currentMessageId = null;
    });
    _tts.setCancelHandler(() {
      _speaking = false;
      _currentMessageId = null;
    });
    _tts.setErrorHandler((_) {
      _speaking = false;
      _currentMessageId = null;
    });

    _initialized = true;
  }

  Future<void> speak(String text, {int? messageId}) async {
    await _ensureInit();

    if (_speaking) {
      await stop();
      if (_currentMessageId == messageId) return;
    }

    _speaking = true;
    _currentMessageId = messageId;
    await _tts.speak(text);
  }

  Future<void> stop() async {
    await _tts.stop();
    _speaking = false;
    _currentMessageId = null;
  }

  Future<void> dispose() async {
    await _tts.stop();
  }
}
