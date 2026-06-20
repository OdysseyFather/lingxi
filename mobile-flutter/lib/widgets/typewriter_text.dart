import 'dart:async';
import 'package:flutter/material.dart';

/// 打字机文字效果
/// 逐字浮现的文本组件,用于 AI 流式回复展示
///
/// 流式期间外部 text 不断追加,本组件会按设定速度逐字浮现
/// 直到所有字符显示完毕,避免一次性显示大段文本造成的突兀感
class TypewriterText extends StatefulWidget {
  final String text;
  final TextStyle? style;
  final Duration charDuration;
  final bool active;
  final VoidCallback? onCompleted;

  const TypewriterText({
    super.key,
    required this.text,
    this.style,
    this.charDuration = const Duration(milliseconds: 18),
    this.active = true,
    this.onCompleted,
  });

  @override
  State<TypewriterText> createState() => _TypewriterTextState();
}

class _TypewriterTextState extends State<TypewriterText> {
  int _visible = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(TypewriterText old) {
    super.didUpdateWidget(old);
    // 文本被替换为更短或不同 → 重置
    if (!widget.text.startsWith(old.text)) {
      _visible = 0;
    }
    _start();
  }

  void _start() {
    _timer?.cancel();
    if (!widget.active || _visible >= widget.text.length) return;
    _timer = Timer.periodic(widget.charDuration, (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_visible >= widget.text.length) {
        t.cancel();
        widget.onCompleted?.call();
        return;
      }
      setState(() => _visible++);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visible.clamp(0, widget.text.length);
    return Text(
      widget.text.substring(0, visible),
      style: widget.style,
    );
  }
}
