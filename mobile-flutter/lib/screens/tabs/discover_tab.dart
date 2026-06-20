import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../models/agent.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_dimens.dart';
import '../skill_list_screen.dart';
import '../knowledge_list_screen.dart';
import '../agent_detail_screen.dart';
import '../deep_search_screen.dart';
import '../../widgets/staggered_anim.dart';
import '../../widgets/refresh_indicator.dart';

/// 发现页 — 豆包风格
/// 顶部分类横滑 + 大图推荐卡片 + 横向 Agent 推荐 + 使用技巧
class DiscoverTab extends StatefulWidget {
  const DiscoverTab({super.key});

  @override
  State<DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<DiscoverTab> {
  String _activeCategory = '全部';
  static const _categories = ['全部', '效率', '创作', '编程', '学习', '生活', '娱乐'];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final state = context.watch<AppState>();

    return Scaffold(
      backgroundColor: isDark ? AppColors.bgPrimaryDark : const Color(0xFFFAFAFC),
      body: SafeArea(
        child: LingxiRefreshIndicator(
          onRefresh: () => state.loadAgents(),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: _buildHeader(isDark)),
              SliverToBoxAdapter(child: _buildCategoryStrip(isDark)),
              SliverToBoxAdapter(child: _buildHeroBanner(context, isDark)),
              SliverToBoxAdapter(child: _buildEntryRow(context, isDark)),
              SliverToBoxAdapter(child: _buildAgentSection(context, state, isDark)),
              SliverToBoxAdapter(child: _buildTipsSection(isDark)),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 12),
      child: Row(
        children: [
          Text(
            '发现',
            style: TextStyle(
              fontSize: AppDimens.fontTitle,
              fontWeight: FontWeight.w800,
              letterSpacing: AppDimens.letterSpacingTitle,
              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isDark ? Colors.white.withOpacity(0.05) : Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.6), width: 0.5),
            ),
            child: Icon(Icons.search, size: 18, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryStrip(bool isDark) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final cat = _categories[i];
          final isActive = cat == _activeCategory;
          return GestureDetector(
            onTap: () => setState(() => _activeCategory = cat),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                gradient: isActive ? AppColors.avatarHaloGradient : null,
                color: isActive
                    ? null
                    : (isDark ? Colors.white.withOpacity(0.05) : Colors.white),
                borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                border: isActive
                    ? null
                    : Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.6), width: 0.5),
                boxShadow: isActive ? AppDimens.shadowBrand(AppColors.brand, opacity: 0.2) : null,
              ),
              child: Center(
                child: Text(
                  cat,
                  style: TextStyle(
                    fontSize: AppDimens.fontSm,
                    fontWeight: FontWeight.w600,
                    color: isActive
                        ? Colors.white
                        : (isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeroBanner(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Container(
        height: 140,
        decoration: BoxDecoration(
          gradient: AppColors.avatarHaloGradient,
          borderRadius: BorderRadius.circular(AppDimens.radiusXl),
          boxShadow: AppDimens.shadowBrand(AppColors.brand, opacity: 0.25),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -20, top: -30,
              child: Container(
                width: 140, height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.1),
                ),
              ),
            ),
            Positioned(
              left: -40, bottom: -40,
              child: Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.08),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.25),
                      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                    ),
                    child: const Text(
                      '热门',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        '探索灵犀的全部能力',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: -0.3,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        '智能体 · 技能 · 知识库 · 工作流',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white70,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEntryRow(BuildContext context, bool isDark) {
    final entries = [
      ('深度搜索', Icons.travel_explore, AppColors.brand, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DeepSearchScreen()))),
      ('技能市场', Icons.extension, const Color(0xFF8B5CF6), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SkillListScreen()))),
      ('知识库', Icons.menu_book_rounded, AppColors.success, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const KnowledgeListScreen()))),
      ('定时任务', Icons.schedule, AppColors.warning, () => _showComingSoon(context)),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Row(
        children: entries.map((e) {
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: _MiniEntryCard(
                label: e.$1,
                icon: e.$2,
                color: e.$3,
                isDark: isDark,
                onTap: e.$4,
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildAgentSection(BuildContext context, AppState state, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '热门智能体',
                style: TextStyle(
                  fontSize: AppDimens.fontLg,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.local_fire_department, size: 18, color: AppColors.warning),
              const Spacer(),
              if (state.agents.isNotEmpty)
                Text(
                  '${state.agents.length} 个',
                  style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (state.agents.isEmpty)
            _emptyAgentsCard(isDark)
          else
            SizedBox(
              height: 156,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                clipBehavior: Clip.none,
                padding: const EdgeInsets.only(right: 16),
                itemCount: state.agents.length > 8 ? 8 : state.agents.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, i) {
                  final agent = state.agents[i];
                  return StaggeredEntry(
                    index: i,
                    stepMs: 50,
                    yOffset: 16,
                    child: _AgentRecommendCard(
                      agent: agent,
                      baseUrl: state.connectionManager.activeUrl,
                      isDark: isDark,
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AgentDetailScreen(agent: agent))),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _emptyAgentsCard(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
      ),
      child: Column(
        children: [
          Icon(Icons.smart_toy_outlined, size: 40, color: AppColors.brand.withOpacity(0.3)),
          const SizedBox(height: 8),
          Text(
            '在 PC 端创建你的智能体',
            style: TextStyle(
              fontSize: AppDimens.fontSm,
              color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTipsSection(bool isDark) {
    final tips = [
      ('使用技巧', '长按消息可编辑、朗读、重生成、固定', Icons.lightbulb_outline, AppColors.warning),
      ('语义搜索', '在知识库使用自然语言智能匹配相关内容', Icons.search, AppColors.brand),
      ('语音输入', '在对话中点击麦克风,用语音发送消息', Icons.record_voice_over, AppColors.success),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '使用技巧',
            style: TextStyle(
              fontSize: AppDimens.fontLg,
              fontWeight: FontWeight.w700,
              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          ...tips.map((t) => Padding(
                padding: const EdgeInsets.only(right: 16, bottom: 10),
                child: _TipCard(title: t.$1, subtitle: t.$2, icon: t.$3, color: t.$4, isDark: isDark),
              )),
        ],
      ),
    );
  }

  void _showComingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('该功能暂仅支持 PC 端操作'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
      ),
    );
  }
}

class _MiniEntryCard extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool isDark;
  final VoidCallback onTap;

  const _MiniEntryCard({
    required this.label,
    required this.icon,
    required this.color,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: isDark ? AppColors.bgElevatedDark : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
            boxShadow: AppDimens.shadowSm(),
          ),
          child: Column(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Icon(icon, size: 20, color: color),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AgentRecommendCard extends StatelessWidget {
  final Agent agent;
  final String baseUrl;
  final bool isDark;
  final VoidCallback onTap;

  const _AgentRecommendCard({
    required this.agent,
    required this.baseUrl,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        onTap: onTap,
        child: Container(
          width: 130,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.bgElevatedDark : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
            boxShadow: AppDimens.shadowSm(),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  gradient: AppColors.avatarHaloGradient,
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Center(
                  child: Text(
                    agent.emoji ?? '🤖',
                    style: const TextStyle(fontSize: 22),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                agent.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: AppDimens.fontSm,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Expanded(
                child: Text(
                  agent.description ?? '智能助手',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TipCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final bool isDark;

  const _TipCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: AppDimens.fontSm,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
