import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/agent.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import 'chat_screen.dart';

/// 智能体详情页
class AgentDetailScreen extends StatelessWidget {
  final Agent agent;
  const AgentDetailScreen({super.key, required this.agent});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final state = context.read<AppState>();
    final baseUrl = state.connectionManager.activeUrl;

    return Scaffold(
      backgroundColor: isDark ? AppColors.surfaceDark : const Color(0xFFFAF8F5),
      body: CustomScrollView(
        slivers: [
          // Hero header
          SliverAppBar(
            expandedHeight: 220,
            pinned: true,
            backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
            surfaceTintColor: Colors.transparent,
            leading: IconButton(
              icon: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.arrow_back_ios_new, size: 16, color: Colors.white),
              ),
              onPressed: () => Navigator.pop(context),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.brand, AppColors.brand.withOpacity(0.6)],
                  ),
                ),
                child: SafeArea(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 20),
                      _buildAvatar(baseUrl),
                      const SizedBox(height: 12),
                      Text(
                        agent.name,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      if (agent.role.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                          ),
                          child: Text(
                            agent.role,
                            style: const TextStyle(fontSize: 12, color: Colors.white),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 描述
                  if (agent.description != null && agent.description!.isNotEmpty) ...[
                    _SectionCard(
                      isDark: isDark,
                      title: '描述',
                      icon: Icons.info_outline,
                      child: Text(
                        agent.description!,
                        style: TextStyle(
                          fontSize: AppDimens.fontBody,
                          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                          height: 1.6,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // 参数信息
                  _SectionCard(
                    isDark: isDark,
                    title: '参数配置',
                    icon: Icons.tune,
                    child: Column(
                      children: [
                        _InfoRow(label: 'Temperature', value: agent.temperature.toStringAsFixed(1), isDark: isDark),
                        _InfoRow(label: 'Max Tokens', value: agent.maxTokens.toString(), isDark: isDark),
                        if (agent.model != null && agent.model!.isNotEmpty)
                          _InfoRow(label: '绑定模型', value: agent.model!, isDark: isDark),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // 提示：更多配置请在PC端操作
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withOpacity(0.04) : AppColors.brand.withOpacity(0.04),
                      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                      border: Border.all(color: AppColors.brand.withOpacity(0.15)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.desktop_mac_outlined, size: 20, color: AppColors.brand),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '编辑智能体、管理技能和知识库请在 PC 端操作',
                            style: TextStyle(
                              fontSize: AppDimens.fontSm,
                              color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // 开始对话按钮
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () async {
                        state.selectAgent(agent);
                        await state.createNewSession();
                        if (context.mounted) {
                          Navigator.pushReplacement(
                            context,
                            MaterialPageRoute(builder: (_) => const ChatScreen()),
                          );
                        }
                      },
                      icon: const Icon(Icons.chat_bubble_outline, size: 20),
                      label: const Text('开始对话', style: TextStyle(fontSize: 16)),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusMd)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvatar(String baseUrl) {
    const size = 72.0;
    if (agent.avatar != null && agent.avatar!.isNotEmpty) {
      final url = agent.avatar!.startsWith('http') ? agent.avatar! : '$baseUrl${agent.avatar}';
      return Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Image.network(url, width: size, height: size, fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _defaultAvatar()),
        ),
      );
    }
    return _defaultAvatar();
  }

  Widget _defaultAvatar() {
    return Container(
      width: 72, height: 72,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.2),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Center(
        child: Text(
          agent.emoji ?? '🤖',
          style: const TextStyle(fontSize: 36),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final bool isDark;
  final String title;
  final IconData icon;
  final Widget child;
  const _SectionCard({required this.isDark, required this.title, required this.icon, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: AppColors.brand),
              const SizedBox(width: 8),
              Text(title, style: TextStyle(
                fontSize: AppDimens.fontBody,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              )),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isDark;
  const _InfoRow({required this.label, required this.value, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(label, style: TextStyle(
            fontSize: AppDimens.fontSm,
            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
          )),
          const Spacer(),
          Text(value, style: TextStyle(
            fontSize: AppDimens.fontSm,
            fontWeight: FontWeight.w500,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
          )),
        ],
      ),
    );
  }
}
