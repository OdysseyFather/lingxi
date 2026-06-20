import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// 自定义下拉刷新 indicator
///
/// 灵犀风格：拉动时显示一个旋转的小logo + 进度环
class LingxiRefreshIndicator extends StatelessWidget {
  final Widget child;
  final Future<void> Function() onRefresh;
  final double displacement;

  const LingxiRefreshIndicator({
    super.key,
    required this.child,
    required this.onRefresh,
    this.displacement = 50,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppColors.brand,
      backgroundColor: Theme.of(context).brightness == Brightness.dark
          ? const Color(0xFF222633)
          : Colors.white,
      strokeWidth: 2.5,
      displacement: displacement,
      child: child,
    );
  }
}

/// 炸裂效果的下拉刷新自定义内容（用于 sliver）
///
/// 在刷新完成的瞬间播放轻微的缩放反馈
class BurstRefreshHeader extends StatelessWidget {
  const BurstRefreshHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 60,
      alignment: Alignment.center,
      child: SizedBox(
        width: 36,
        height: 36,
        child: CircularProgressIndicator(
          color: AppColors.brand,
          strokeWidth: 2.5,
        ),
      ),
    );
  }
}
