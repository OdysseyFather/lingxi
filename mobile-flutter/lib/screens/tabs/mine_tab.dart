import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_dimens.dart';
import '../usage_screen.dart';
import '../memory_screen.dart';

/// 我的 Tab：个人资料、用量、记忆、快捷操作
class MineTab extends StatelessWidget {
  const MineTab({super.key});

  void _showComingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('该功能即将上线'), duration: Duration(seconds: 2)),
    );
  }

  void _showAbout(BuildContext context) {
    showAboutDialog(
      context: context,
      applicationName: '灵犀',
      applicationVersion: '1.0.0',
      applicationLegalese: '本地优先的 AI Agent 工作台',
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppColors.surfaceDark : const Color(0xFFFAF8F5),
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text('我的', style: TextStyle(
          fontSize: AppDimens.fontLg, fontWeight: FontWeight.bold,
          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
        )),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 用户资料卡片
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: AppColors.heroGradient,
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            ),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Center(
                    child: Icon(Icons.person, size: 28, color: Colors.white),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('灵犀用户', style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white,
                      )),
                      const SizedBox(height: 4),
                      Text(
                        state.connectionManager.connected ? '已连接 PC 端' : '未连接',
                        style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.8)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 功能区
          _SectionTitle(title: '数据管理', isDark: isDark),
          const SizedBox(height: 8),
          _MenuCard(isDark: isDark, items: [
            _MenuItem(icon: Icons.bar_chart, label: '用量统计', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const UsageScreen()))),
            _MenuItem(icon: Icons.psychology, label: '长期记忆', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MemoryScreen()))),
            _MenuItem(icon: Icons.history, label: '对话导出', onTap: () => _showComingSoon(context)),
          ]),

          const SizedBox(height: 16),
          _SectionTitle(title: '快捷操作', isDark: isDark),
          const SizedBox(height: 8),
          _MenuCard(isDark: isDark, items: [
            _MenuItem(icon: Icons.notifications_outlined, label: '通知管理', onTap: () => _showComingSoon(context)),
            _MenuItem(icon: Icons.color_lens_outlined, label: '外观主题', onTap: () => _showComingSoon(context)),
            _MenuItem(icon: Icons.help_outline, label: '帮助与反馈', onTap: () => _showAbout(context)),
            _MenuItem(icon: Icons.info_outline, label: '关于灵犀', onTap: () => _showAbout(context)),
          ]),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final bool isDark;
  const _SectionTitle({required this.title, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Text(title, style: TextStyle(
      fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600,
      color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
    ));
  }
}

class _MenuCard extends StatelessWidget {
  final bool isDark;
  final List<_MenuItem> items;
  const _MenuCard({required this.isDark, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: AppColors.divider.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          for (int i = 0; i < items.length; i++) ...[
            if (i > 0) Divider(height: 1, indent: 52, color: AppColors.divider.withOpacity(0.3)),
            items[i]._build(context, isDark),
          ],
        ],
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _MenuItem({required this.icon, required this.label, required this.onTap});

  Widget _build(BuildContext context, bool isDark) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: AppColors.brand.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 18, color: AppColors.brand),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label, style: TextStyle(
                fontSize: AppDimens.fontBody,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              )),
            ),
            Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white24 : Colors.black26),
          ],
        ),
      ),
    );
  }
}
