import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// 流式输出光标 + 气泡呼吸效果
///
/// 双层动画：
/// - 内层：纵向竖条光标快速闪烁（700ms 周期）
/// - 外层：发光晕圈呼吸 + 颜色脉动，增强"正在输入"的活力感
class StreamingCursor extends StatefulWidget {
  const StreamingCursor({super.key});

  @override
  State<StreamingCursor> createState() => _StreamingCursorState();
}

class _StreamingCursorState extends State<StreamingCursor>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value;
        return Container(
          margin: const EdgeInsets.only(left: 2, top: 2),
          padding: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(1.5),
            boxShadow: [
              BoxShadow(
                color: AppColors.brand.withOpacity(t * 0.35),
                blurRadius: 6 + t * 3,
                spreadRadius: t * 0.5,
              ),
            ],
          ),
          child: Container(
            width: 2.5,
            height: 18,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AppColors.brand.withOpacity(0.6 + t * 0.4),
                  AppColors.brand,
                ],
              ),
              borderRadius: BorderRadius.circular(1.5),
            ),
          ),
        );
      },
    );
  }
}
