import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../models/session.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_dimens.dart';
import '../chat_screen.dart';
import '../search_messages_screen.dart';
import '../../widgets/staggered_anim.dart';
import '../../widgets/pressable_card.dart';
import '../../widgets/refresh_indicator.dart';

/// 对话 Tab：豆包风格三段式首页
/// 顶部欢迎 + 场景入口网格 + 最近对话
class ConversationTab extends StatefulWidget {
  const ConversationTab({super.key});

  @override
  State<ConversationTab> createState() => _ConversationTabState();
}

class _ConversationTabState extends State<ConversationTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().loadSessions();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 280),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, anim) {
        return FadeTransition(
          opacity: anim,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.04, 0.04),
              end: Offset.zero,
            ).animate(anim),
            child: child,
          ),
        );
      },
      child: state.activeSession != null
          ? ChatScreen(
              key: ValueKey('chat_${state.activeSession!.id}'),
              onOpenDrawer: () => state.setActiveSession(null),
            )
          : _ConversationHome(key: const ValueKey('home'), state: state),
    );
  }
}

/// 6 个场景入口（对标豆包/千问主页）
const _kScenes = [
  ('写作', '帮我润色这段文字，让它更生动', Icons.edit_note, AppColors.sceneWriting),
  ('编程', '帮我写一段 Python 代码，实现快速排序', Icons.code, AppColors.sceneCoding),
  ('翻译', '把下面这段话翻译成英文', Icons.translate, AppColors.sceneTranslate),
  ('总结', '帮我总结一下下面这段内容的要点', Icons.summarize, AppColors.sceneSummary),
  ('分析', '帮我分析这个问题的可行解决方案', Icons.analytics, AppColors.sceneAnalysis),
  ('创意', '给我一些有趣的创意点子', Icons.lightbulb_outline, AppColors.sceneCreative),
];

class _ConversationHome extends StatelessWidget {
  final AppState state;
  const _ConversationHome({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final sessions = state.sessions;

    return Scaffold(
      backgroundColor: isDark ? AppColors.bgPrimaryDark : const Color(0xFFFAFAFC),
      body: SafeArea(
        child: LingxiRefreshIndicator(
          onRefresh: () => state.loadSessions(),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: _buildHeader(context, isDark)),
              SliverToBoxAdapter(child: _buildSearchBar(context, isDark)),
              SliverToBoxAdapter(child: _buildScenesGrid(context, isDark)),
              if (sessions.isNotEmpty)
                SliverToBoxAdapter(child: _buildSectionHeader(isDark)),
              if (sessions.isEmpty)
                SliverToBoxAdapter(child: _buildEmptyState(context, isDark))
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                  sliver: SliverList.builder(
                    itemCount: sessions.length,
                    itemBuilder: (context, index) {
                      return StaggeredEntry(
                        index: index,
                        stepMs: 45,
                        initialDelayMs: 280,
                        yOffset: 12,
                        child: _SessionCard(
                          session: sessions[index],
                          isActive: sessions[index].id == state.activeSession?.id,
                          onTap: () => state.setActiveSession(sessions[index]),
                          onDelete: () => _confirmDelete(context, state, sessions[index]),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
      floatingActionButton: _NewChatPill(
        onPressed: () async {
          await state.createNewSession();
        },
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    final connected = state.connectionManager.connected;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 8),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: AppColors.avatarHaloGradient,
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              boxShadow: AppDimens.shadowBrand(AppColors.brand, opacity: 0.3),
            ),
            child: const Center(
              child: Text('灵', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('你好,', style: TextStyle(
                  fontSize: AppDimens.fontSm,
                  color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                )),
                Text('有什么我可以帮你的?', style: TextStyle(
                  fontSize: AppDimens.fontLg,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  letterSpacing: AppDimens.letterSpacingTitle,
                )),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: connected
                  ? AppColors.success.withOpacity(0.1)
                  : AppColors.error.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppDimens.radiusPill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6, height: 6,
                  decoration: BoxDecoration(
                    color: connected ? AppColors.success : AppColors.error,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(connected ? '在线' : '离线', style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: connected ? AppColors.success : AppColors.error,
                )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: GestureDetector(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SearchMessagesScreen()),
        ),
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: isDark ? Colors.white.withOpacity(0.05) : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusPill),
            border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.6), width: 0.5),
          ),
          child: Row(
            children: [
              Icon(Icons.search, size: 20, color: AppColors.textTertiary),
              const SizedBox(width: 8),
              Text('搜索消息或开启新对话',
                  style: TextStyle(
                    fontSize: AppDimens.fontBody,
                    color: AppColors.textTertiary,
                  )),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildScenesGrid(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 12),
            child: Text(
              '场景推荐',
              style: TextStyle(
                fontSize: AppDimens.fontBody,
                fontWeight: FontWeight.w700,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              ),
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.0,
            ),
            itemCount: _kScenes.length,
            itemBuilder: (context, index) {
              final s = _kScenes[index];
              return StaggeredEntry(
                index: index,
                stepMs: 60,
                initialDelayMs: 120,
                child: _SceneCard(
                  title: s.$1,
                  prompt: s.$2,
                  icon: s.$3,
                  gradient: s.$4,
                  onTap: () async {
                    await state.createNewSession();
                    state.sendMessage(s.$2);
                  },
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 16, 12),
      child: Row(
        children: [
          Text(
            '最近对话',
            style: TextStyle(
              fontSize: AppDimens.fontBody,
              fontWeight: FontWeight.w700,
              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
            ),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.brand.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppDimens.radiusXs),
            ),
            child: Text(
              '${state.sessions.length}',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 36),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.brand.withOpacity(0.08),
              borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            ),
            child: Icon(Icons.auto_awesome_outlined, size: 28, color: AppColors.brand.withOpacity(0.6)),
          ),
          const SizedBox(height: 12),
          Text(
            '从场景推荐开始对话吧',
            style: TextStyle(
              fontSize: AppDimens.fontSm,
              color: isDark ? AppColors.textSecondaryDark : AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context, AppState state, Session session) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusLg)),
        title: const Text('删除对话'),
        content: const Text('确定删除该对话?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirm == true) {
      state.deleteSessionById(session.id);
    }
  }
}

/// 场景入口卡片（豆包/千问风格）
class _SceneCard extends StatelessWidget {
  final String title;
  final String prompt;
  final IconData icon;
  final LinearGradient gradient;
  final VoidCallback onTap;

  const _SceneCard({
    required this.title,
    required this.prompt,
    required this.icon,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return PressableCard(
      borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          boxShadow: AppDimens.shadowSm(),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -10, bottom: -10,
              child: Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.18),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                    ),
                    child: Icon(icon, size: 18, color: Colors.white),
                  ),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 底部"新对话"胶囊按钮（豆包风格）
class _NewChatPill extends StatelessWidget {
  final VoidCallback onPressed;
  const _NewChatPill({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.avatarHaloGradient,
        borderRadius: BorderRadius.circular(AppDimens.radiusPill),
        boxShadow: AppDimens.shadowBrand(AppColors.brand, opacity: 0.4),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppDimens.radiusPill),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppDimens.radiusPill),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Icon(Icons.add_comment_outlined, size: 18, color: Colors.white),
                SizedBox(width: 8),
                Text(
                  '新对话',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final Session session;
  final bool isActive;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _SessionCard({
    required this.session,
    required this.isActive,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Dismissible(
      key: ValueKey(session.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        margin: const EdgeInsets.symmetric(vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.error.withOpacity(0.12),
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        ),
        child: Icon(Icons.delete_outline, color: AppColors.error, size: 22),
      ),
      confirmDismiss: (_) async {
        onDelete();
        return false;
      },
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        decoration: BoxDecoration(
          color: isDark ? AppColors.bgElevatedDark : Colors.white,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: isActive
              ? Border.all(color: AppColors.brand.withOpacity(0.4), width: 1.2)
              : Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
          boxShadow: isActive ? AppDimens.shadowBrand(AppColors.brand, opacity: 0.08) : AppDimens.shadowSm(),
        ),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      gradient: AppColors.avatarHaloGradient,
                      borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    ),
                    child: const Center(
                      child: Icon(Icons.chat_bubble_outline, size: 20, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            if (session.pinned)
                              Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: Icon(Icons.push_pin, size: 13, color: AppColors.thinking),
                              ),
                            Expanded(
                              child: Text(
                                session.title.isEmpty ? '新对话' : session.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: AppDimens.fontBody,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (session.agentName.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            session.agentName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: AppDimens.fontSm,
                              color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (session.updatedAt.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text(
                        _formatTime(session.updatedAt),
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.textTertiary,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(String iso) {
    try {
      final t = DateTime.parse(iso).toLocal();
      final now = DateTime.now();
      final diff = now.difference(t);
      if (diff.inMinutes < 1) return '刚刚';
      if (diff.inHours < 1) return '${diff.inMinutes}分';
      if (diff.inDays < 1) return '${diff.inHours}时';
      if (diff.inDays < 7) return '${diff.inDays}天';
      return '${t.month}/${t.day}';
    } catch (_) {
      return '';
    }
  }
}
