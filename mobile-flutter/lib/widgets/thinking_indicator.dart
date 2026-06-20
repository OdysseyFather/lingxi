import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class ThinkingIndicator extends StatefulWidget {
  final String text;
  const ThinkingIndicator({super.key, required this.text});

  @override
  State<ThinkingIndicator> createState() => _ThinkingIndicatorState();
}

class _ThinkingIndicatorState extends State<ThinkingIndicator> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppDimens.unit, horizontal: AppDimens.unit),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.thinking.withOpacity(0.1)
                    : AppColors.thinkingBg,
                borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                border: Border.all(color: AppColors.thinking.withOpacity(0.25)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.thinking,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '正在思考...',
                    style: TextStyle(
                      fontSize: AppDimens.fontSm,
                      color: AppColors.thinking.withOpacity(0.9),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (widget.text.isNotEmpty) ...[
                    const SizedBox(width: 4),
                    Icon(
                      _expanded ? Icons.expand_less : Icons.expand_more,
                      size: 18,
                      color: AppColors.thinking,
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_expanded && widget.text.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 4, left: 4),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.thinking.withOpacity(0.06)
                    : AppColors.thinkingBg.withOpacity(0.7),
                borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                border: Border.all(color: AppColors.thinking.withOpacity(0.15)),
              ),
              child: Text(
                widget.text,
                style: TextStyle(
                  fontSize: AppDimens.fontSm,
                  color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                  fontStyle: FontStyle.italic,
                  height: 1.5,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
