import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 推荐后续问题胶囊按钮组
class RecommendationChips extends StatelessWidget {
  final List<String> suggestions;
  final ValueChanged<String> onTap;

  const RecommendationChips({
    super.key,
    required this.suggestions,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (suggestions.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(left: AppDimens.avatarSm + 8, top: 4, bottom: 4),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: suggestions.map((s) {
          return InkWell(
            borderRadius: BorderRadius.circular(AppDimens.radiusPill),
            onTap: () => onTap(s),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                color: isDark
                    ? AppColors.brand.withOpacity(0.12)
                    : AppColors.brand.withOpacity(0.08),
                border: Border.all(color: AppColors.brand.withOpacity(0.25)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.auto_awesome, size: 12, color: AppColors.brand),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      s,
                      style: TextStyle(
                        fontSize: AppDimens.fontSm,
                        color: AppColors.brand,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
