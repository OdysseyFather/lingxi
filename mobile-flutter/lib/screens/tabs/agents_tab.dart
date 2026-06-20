import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../models/agent.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_dimens.dart';
import '../agent_detail_screen.dart';

/// 智能体广场 Tab：展示可用智能体列表
class AgentsTab extends StatefulWidget {
  const AgentsTab({super.key});

  @override
  State<AgentsTab> createState() => _AgentsTabState();
}

class _AgentsTabState extends State<AgentsTab> {
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().loadAgents();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final filtered = _searchQuery.isEmpty
        ? state.agents
        : state.agents.where((a) => a.name.toLowerCase().contains(_searchQuery.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: isDark ? AppColors.surfaceDark : const Color(0xFFFAF8F5),
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text('智能体', style: TextStyle(
          fontSize: AppDimens.fontLg, fontWeight: FontWeight.bold,
          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
        )),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Container(
              decoration: BoxDecoration(
                color: isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFF5F3F0),
                borderRadius: BorderRadius.circular(AppDimens.radiusPill),
              ),
              child: TextField(
                onChanged: (v) => setState(() => _searchQuery = v),
                style: TextStyle(
                  fontSize: AppDimens.fontBody,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                ),
                decoration: InputDecoration(
                  hintText: '搜索智能体...',
                  prefixIcon: Icon(Icons.search, size: 20, color: isDark ? Colors.white38 : Colors.black38),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  hintStyle: TextStyle(color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary),
                ),
              ),
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? _EmptyAgents(isDark: isDark)
                : RefreshIndicator(
                    onRefresh: () => state.loadAgents(),
                    child: GridView.builder(
                      padding: const EdgeInsets.all(12),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        childAspectRatio: 0.9,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                      ),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        return _AgentCard(
                          agent: filtered[index],
                          baseUrl: state.connectionManager.activeUrl,
                          isSelected: state.selectedAgent?.id == filtered[index].id,
                          onTap: () => _onAgentTap(context, state, filtered[index]),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  void _onAgentTap(BuildContext context, AppState state, Agent agent) async {
    await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => AgentDetailScreen(agent: agent)));
  }
}

class _AgentCard extends StatelessWidget {
  final Agent agent;
  final String baseUrl;
  final bool isSelected;
  final VoidCallback onTap;

  const _AgentCard({required this.agent, required this.baseUrl, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      elevation: isDark ? 0 : 0.5,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            border: isSelected ? Border.all(color: AppColors.brand.withOpacity(0.4), width: 1.5) : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _AgentAvatar(agent: agent, baseUrl: baseUrl, size: 48),
              const SizedBox(height: 10),
              Text(agent.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(
                fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              )),
              const SizedBox(height: 4),
              Text(
                agent.description ?? '',
                maxLines: 2, overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: AppDimens.fontXs,
                  color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AgentAvatar extends StatelessWidget {
  final Agent agent;
  final String baseUrl;
  final double size;
  const _AgentAvatar({required this.agent, required this.baseUrl, required this.size});

  @override
  Widget build(BuildContext context) {
    if (agent.avatar != null && agent.avatar!.isNotEmpty) {
      final url = agent.avatar!.startsWith('http') ? agent.avatar! : '$baseUrl${agent.avatar}';
      return ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.25),
        child: Image.network(url, width: size, height: size, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _defaultAvatar(size)),
      );
    }
    if (agent.emoji != null && agent.emoji!.isNotEmpty) {
      return Container(
        width: size, height: size,
        decoration: BoxDecoration(
          color: AppColors.brand.withOpacity(0.1),
          borderRadius: BorderRadius.circular(size * 0.25),
        ),
        child: Center(child: Text(agent.emoji!, style: TextStyle(fontSize: size * 0.5))),
      );
    }
    return _defaultAvatar(size);
  }

  Widget _defaultAvatar(double s) {
    return Container(
      width: s, height: s,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [AppColors.brand, AppColors.brand.withOpacity(0.7)]),
        borderRadius: BorderRadius.circular(s * 0.25),
      ),
      child: Center(child: Text('灵', style: TextStyle(fontSize: s * 0.4, fontWeight: FontWeight.w700, color: Colors.white))),
    );
  }
}

class _EmptyAgents extends StatelessWidget {
  final bool isDark;
  const _EmptyAgents({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.smart_toy_outlined, size: 64, color: AppColors.brand.withOpacity(0.3)),
          const SizedBox(height: 16),
          Text('暂无智能体', style: TextStyle(
            fontSize: AppDimens.fontLg, fontWeight: FontWeight.w600,
            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
          )),
          const SizedBox(height: 8),
          Text('在 PC 端创建智能体后即可在此查看', style: TextStyle(
            fontSize: AppDimens.fontSm, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
          )),
        ],
      ),
    );
  }
}
