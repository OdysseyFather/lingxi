import 'package:flutter/material.dart';

/// 交错入场动画：每个 item 延迟 `index * stepMs` 毫秒后从下方滑入
///
/// 用于场景卡片、会话列表、Agent 卡片等列表的初次出现
class StaggeredEntry extends StatefulWidget {
  final int index;
  final int stepMs;
  final int initialDelayMs;
  final double yOffset;
  final Duration duration;
  final Widget child;

  const StaggeredEntry({
    super.key,
    required this.index,
    required this.child,
    this.stepMs = 60,
    this.initialDelayMs = 0,
    this.yOffset = 16,
    this.duration = const Duration(milliseconds: 420),
  });

  @override
  State<StaggeredEntry> createState() => _StaggeredEntryState();
}

class _StaggeredEntryState extends State<StaggeredEntry>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;
  late Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: widget.duration);
    final cubic = CurveTween(curve: Curves.easeOutCubic);
    _opacity = _ctrl.drive(cubic).drive(Tween(begin: 0.0, end: 1.0));
    _offset = _ctrl.drive(cubic).drive(Tween(
          begin: Offset(0, widget.yOffset / 100),
          end: Offset.zero,
        ));

    final delay = widget.initialDelayMs + widget.index * widget.stepMs;
    Future.delayed(Duration(milliseconds: delay), () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) {
        return FractionalTranslation(
          translation: _offset.value,
          child: Opacity(opacity: _opacity.value, child: child),
        );
      },
      child: widget.child,
    );
  }
}
