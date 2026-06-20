import 'package:flutter/material.dart';

/// 可按压卡片：按下时缩放 + ripple 反馈
///
/// 比单纯 InkWell 更显眼,适合所有主要可点击卡片
/// (场景卡片/会话卡片/Agent 卡片/快捷入口等)
class PressableCard extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final BorderRadius borderRadius;
  final double scaleDown;
  final Color? splashColor;

  const PressableCard({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.borderRadius = const BorderRadius.all(Radius.circular(16)),
    this.scaleDown = 0.97,
    this.splashColor,
  });

  @override
  State<PressableCard> createState() => _PressableCardState();
}

class _PressableCardState extends State<PressableCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      scale: _pressed ? widget.scaleDown : 1.0,
      child: Material(
        color: Colors.transparent,
        borderRadius: widget.borderRadius,
        child: InkWell(
          borderRadius: widget.borderRadius,
          splashColor: widget.splashColor,
          onTap: widget.onTap,
          onLongPress: widget.onLongPress,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: widget.child,
        ),
      ),
    );
  }
}
