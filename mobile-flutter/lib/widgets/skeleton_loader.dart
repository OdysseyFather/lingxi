import 'package:flutter/material.dart';
import '../theme/app_dimens.dart';

/// 消息加载骨架屏
class MessageSkeleton extends StatefulWidget {
  const MessageSkeleton({super.key});

  @override
  State<MessageSkeleton> createState() => _MessageSkeletonState();
}

class _MessageSkeletonState extends State<MessageSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = isDark ? Colors.white.withOpacity(0.06) : Colors.grey.withOpacity(0.08);
    final highlight = isDark ? Colors.white.withOpacity(0.12) : Colors.grey.withOpacity(0.15);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final shimmerOpacity = ((_controller.value * 2 - 1).abs());
        final color = Color.lerp(base, highlight, shimmerOpacity)!;

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: AppDimens.avatarSm,
                height: AppDimens.avatarSm,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 14,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 14,
                      width: 200,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 14,
                      width: 140,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// 通用骨架行
class SkeletonLine extends StatelessWidget {
  final double width;
  final double height;

  const SkeletonLine({super.key, this.width = double.infinity, this.height = 14});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withOpacity(0.06) : Colors.grey.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
      ),
    );
  }
}

/// 会话卡片骨架屏（豆包/千问风格）
class SessionCardSkeleton extends StatefulWidget {
  const SessionCardSkeleton({super.key});

  @override
  State<SessionCardSkeleton> createState() => _SessionCardSkeletonState();
}

class _SessionCardSkeletonState extends State<SessionCardSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1300),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final s = ((_ctrl.value * 2 - 1).abs());
        final base = isDark ? Colors.white.withOpacity(0.06) : Colors.grey.withOpacity(0.08);
        final highlight = isDark ? Colors.white.withOpacity(0.12) : Colors.grey.withOpacity(0.15);
        final c = Color.lerp(base, highlight, s)!;
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 5),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF222633) : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            border: Border.all(color: Colors.grey.withOpacity(isDark ? 0.1 : 0.4), width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(height: 14, width: 180, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
                    const SizedBox(height: 8),
                    Container(height: 11, width: 120, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// 智能体卡片骨架屏（横滑用）
class AgentCardSkeleton extends StatefulWidget {
  const AgentCardSkeleton({super.key});

  @override
  State<AgentCardSkeleton> createState() => _AgentCardSkeletonState();
}

class _AgentCardSkeletonState extends State<AgentCardSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1300),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final s = ((_ctrl.value * 2 - 1).abs());
        final base = isDark ? Colors.white.withOpacity(0.06) : Colors.grey.withOpacity(0.08);
        final highlight = isDark ? Colors.white.withOpacity(0.12) : Colors.grey.withOpacity(0.15);
        final c = Color.lerp(base, highlight, s)!;
        return Container(
          width: 130,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF222633) : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            border: Border.all(color: Colors.grey.withOpacity(isDark ? 0.1 : 0.4), width: 0.5),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
              ),
              const SizedBox(height: 10),
              Container(height: 13, width: 80, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
              const SizedBox(height: 6),
              Container(height: 11, width: double.infinity, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
              const SizedBox(height: 4),
              Container(height: 11, width: 80, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
            ],
          ),
        );
      },
    );
  }
}
