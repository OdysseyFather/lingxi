import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 思考过程折叠块（金色主题，千问风格信息密度 + 豆包温和感）
class ThinkingBlock extends StatefulWidget {
  final String text;
  final bool live;

  const ThinkingBlock({super.key, required this.text, this.live = false});

  @override
  State<ThinkingBlock> createState() => _ThinkingBlockState();
}

class _ThinkingBlockState extends State<ThinkingBlock> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final previewLen = widget.text.length > 80 ? 80 : widget.text.length;
    final preview = widget.text.substring(0, previewLen).replaceAll('\n', ' ');

    return Container(
      margin: const EdgeInsets.symmetric(vertical: AppDimens.unit),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
        color: isDark
            ? AppColors.thinking.withOpacity(0.08)
            : AppColors.thinkingBg,
        border: Border.all(
          color: AppColors.thinking.withOpacity(isDark ? 0.2 : 0.25),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: _expanded
                ? const BorderRadius.vertical(top: Radius.circular(AppDimens.radiusSm))
                : BorderRadius.circular(AppDimens.radiusSm),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                children: [
                  if (widget.live)
                    _PulsingDot(color: AppColors.thinking)
                  else
                    const Icon(Icons.lightbulb_outline, size: 14, color: AppColors.thinking),
                  const SizedBox(width: 6),
                  Text(
                    widget.live ? '思考中...' : '思考过程',
                    style: TextStyle(
                      fontSize: AppDimens.fontSm,
                      fontWeight: FontWeight.w600,
                      color: AppColors.thinking.withOpacity(0.9),
                    ),
                  ),
                  if (!_expanded && !widget.live && preview.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        preview,
                        style: TextStyle(
                          fontSize: AppDimens.fontXs,
                          color: isDark ? AppColors.textSecondaryDark : AppColors.textTertiary,
                        ),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                    ),
                  ] else
                    const Spacer(),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 16,
                    color: AppColors.textTertiary,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: SelectableText(
                widget.text,
                style: TextStyle(
                  fontSize: AppDimens.fontSm,
                  height: 1.6,
                  color: isDark
                      ? AppColors.textSecondaryDark
                      : AppColors.textSecondary,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  final Color color;
  const _PulsingDot({required this.color});

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
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
      builder: (context, child) => Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: widget.color.withOpacity(0.4 + _controller.value * 0.6),
        ),
      ),
    );
  }
}
