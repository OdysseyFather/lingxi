import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../services/connection_manager.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class SettingsScreen extends StatelessWidget {
  final bool embedded;
  const SettingsScreen({super.key, this.embedded = false});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final cm = state.connectionManager;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppColors.surfaceDark : const Color(0xFFFAF8F5),
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: !embedded,
        title: Text(
          '设置',
          style: TextStyle(
            fontSize: AppDimens.fontLg,
            fontWeight: FontWeight.bold,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.divider.withOpacity(0.5)),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _ConnectionCard(cm: cm, isDark: isDark),
          const SizedBox(height: 12),
          _AgentSection(state: state, isDark: isDark),
          const SizedBox(height: 12),
          _ActionsSection(state: state, isDark: isDark),
          const SizedBox(height: 12),
          _AboutSection(isDark: isDark),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _ConnectionCard extends StatelessWidget {
  final ConnectionManager cm;
  final bool isDark;
  const _ConnectionCard({required this.cm, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: cm.connected
            ? LinearGradient(
                colors: [AppColors.success.withOpacity(0.08), AppColors.success.withOpacity(0.02)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : LinearGradient(
                colors: [AppColors.error.withOpacity(0.08), AppColors.error.withOpacity(0.02)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(
          color: (cm.connected ? AppColors.success : AppColors.error).withOpacity(0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: cm.connected ? AppColors.success : AppColors.error,
                  boxShadow: [
                    BoxShadow(
                      color: (cm.connected ? AppColors.success : AppColors.error).withOpacity(0.4),
                      blurRadius: 6,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                cm.connected ? '已连接' : '未连接',
                style: TextStyle(
                  fontSize: AppDimens.fontBody,
                  fontWeight: FontWeight.w600,
                  color: cm.connected ? AppColors.success : AppColors.error,
                ),
              ),
              const Spacer(),
              if (!cm.connected)
                InkWell(
                  borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                  onTap: () async {
                    await cm.restoreFromStorage();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(cm.connected ? '重新连接成功' : '连接失败')),
                      );
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                      color: AppColors.brand.withOpacity(0.1),
                      border: Border.all(color: AppColors.brand.withOpacity(0.3)),
                    ),
                    child: Text(
                      '重连',
                      style: TextStyle(fontSize: AppDimens.fontSm, color: AppColors.brand, fontWeight: FontWeight.w500),
                    ),
                  ),
                ),
            ],
          ),
          if (cm.connected) ...[
            const SizedBox(height: 8),
            Text(
              '通过 ${cm.mode == ConnectionMode.lan ? "局域网" : "广域网"} 连接',
              style: TextStyle(
                fontSize: AppDimens.fontSm,
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              cm.activeUrl,
              style: TextStyle(
                fontSize: AppDimens.fontXs,
                fontFamily: 'monospace',
                color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AgentSection extends StatelessWidget {
  final AppState state;
  final bool isDark;
  const _AgentSection({required this.state, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _CardSection(
      isDark: isDark,
      title: '智能体',
      icon: Icons.smart_toy_outlined,
      trailing: InkWell(
        borderRadius: BorderRadius.circular(AppDimens.radiusPill),
        onTap: () async {
          await state.loadAgents();
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('已刷新，共 ${state.agents.length} 个智能体')),
            );
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(Icons.refresh, size: 18, color: AppColors.brand),
        ),
      ),
      children: [
        if (state.agents.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              '在电脑端创建智能体后会自动同步',
              style: TextStyle(
                fontSize: AppDimens.fontSm,
                color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
              ),
            ),
          )
        else
          ...state.agents.map((agent) {
            final selected = state.selectedAgent?.id == agent.id;
            return InkWell(
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              onTap: () {
                state.selectAgent(agent);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('已选择 ${agent.name}')),
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                decoration: selected
                    ? BoxDecoration(
                        color: AppColors.brand.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                      )
                    : null,
                child: Row(
                  children: [
                    Container(
                      width: AppDimens.avatarSm,
                      height: AppDimens.avatarSm,
                      decoration: BoxDecoration(
                        gradient: AppColors.heroGradient,
                        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                      ),
                      child: Center(
                        child: Text(agent.emoji ?? '🤖', style: const TextStyle(fontSize: 18)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            agent.name,
                            style: TextStyle(
                              fontSize: AppDimens.fontBody,
                              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                            ),
                          ),
                          if (agent.role.isNotEmpty)
                            Text(
                              agent.role,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: AppDimens.fontXs,
                                color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (selected)
                      Icon(Icons.check_circle, size: 18, color: AppColors.brand),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _ActionsSection extends StatelessWidget {
  final AppState state;
  final bool isDark;
  const _ActionsSection({required this.state, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _CardSection(
      isDark: isDark,
      title: '操作',
      icon: Icons.tune,
      children: [
        _ActionTile(
          icon: Icons.link_off,
          title: '解除配对',
          color: AppColors.error,
          isDark: isDark,
          onTap: () async {
            final confirm = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusMd)),
                title: const Text('解除配对'),
                content: const Text('确定要断开与电脑的连接吗？需要重新扫码配对。'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.error),
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('确定'),
                  ),
                ],
              ),
            );
            if (confirm == true) {
              await state.unpair();
            }
          },
        ),
      ],
    );
  }
}

class _AboutSection extends StatelessWidget {
  final bool isDark;
  const _AboutSection({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _CardSection(
      isDark: isDark,
      title: '关于',
      icon: Icons.info_outline,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  gradient: AppColors.heroGradient,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Center(
                  child: Text('灵', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '灵犀',
                    style: TextStyle(
                      fontSize: AppDimens.fontBody,
                      fontWeight: FontWeight.w600,
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                    ),
                  ),
                  Text(
                    '版本 1.0.0 · 手机端',
                    style: TextStyle(
                      fontSize: AppDimens.fontXs,
                      color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '所有数据和 AI 计算在电脑本地完成',
          style: TextStyle(
            fontSize: AppDimens.fontSm,
            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}

class _CardSection extends StatelessWidget {
  final bool isDark;
  final String title;
  final IconData icon;
  final Widget? trailing;
  final List<Widget> children;

  const _CardSection({
    required this.isDark,
    required this.title,
    required this.icon,
    this.trailing,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        boxShadow: isDark ? null : [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: AppColors.brand),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(
                  fontSize: AppDimens.fontSm,
                  fontWeight: FontWeight.w600,
                  color: AppColors.brand,
                  letterSpacing: 0.3,
                ),
              ),
              if (trailing != null) ...[const Spacer(), trailing!],
            ],
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  final bool isDark;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.title,
    required this.color,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppDimens.radiusSm),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 10),
            Text(
              title,
              style: TextStyle(fontSize: AppDimens.fontBody, color: color, fontWeight: FontWeight.w500),
            ),
            const Spacer(),
            Icon(Icons.chevron_right, size: 18, color: AppColors.textTertiary),
          ],
        ),
      ),
    );
  }
}
