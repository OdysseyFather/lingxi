import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 技能列表页
class SkillListScreen extends StatefulWidget {
  const SkillListScreen({super.key});

  @override
  State<SkillListScreen> createState() => _SkillListScreenState();
}

class _SkillListScreenState extends State<SkillListScreen> {
  List<dynamic> _skills = [];
  bool _loading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadSkills();
  }

  Future<void> _loadSkills() async {
    setState(() => _loading = true);
    try {
      final data = await context.read<AppState>().apiClient.listSkills();
      if (mounted) setState(() { _skills = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final filtered = _searchQuery.isEmpty
        ? _skills
        : _skills.where((s) {
            final name = (s['name'] ?? '').toString().toLowerCase();
            return name.contains(_searchQuery.toLowerCase());
          }).toList();

    return Scaffold(
      backgroundColor: isDark ? AppColors.surfaceDark : const Color(0xFFFAF8F5),
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text('技能市场', style: TextStyle(
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
                  hintText: '搜索技能...',
                  prefixIcon: Icon(Icons.search, size: 20, color: isDark ? Colors.white38 : Colors.black38),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  hintStyle: TextStyle(color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary),
                ),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? _EmptySkills(isDark: isDark)
                    : RefreshIndicator(
                        onRefresh: _loadSkills,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          itemCount: filtered.length,
                          itemBuilder: (context, index) => _SkillCard(skill: filtered[index], isDark: isDark),
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class _SkillCard extends StatelessWidget {
  final Map<String, dynamic> skill;
  final bool isDark;
  const _SkillCard({required this.skill, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final name = skill['name'] ?? '未命名技能';
    final description = skill['description'] ?? '';
    final installed = skill['installed'] == true || skill['installed'] == 1;
    final source = skill['source'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: AppColors.brand.withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.extension, size: 20, color: AppColors.brand),
        ),
        title: Row(
          children: [
            Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(
              fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600,
              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
            ))),
            if (installed) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: AppColors.success.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text('已安装', style: TextStyle(fontSize: 10, color: AppColors.success)),
              ),
            ],
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (description.toString().isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(description, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(
                fontSize: AppDimens.fontXs,
                color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
              )),
            ],
            if (source.toString().isNotEmpty) ...[
              const SizedBox(height: 3),
              Text('来源: $source', style: TextStyle(
                fontSize: 10, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
              )),
            ],
          ],
        ),
        trailing: Text('管理请在PC端', style: TextStyle(
          fontSize: 10, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
        )),
      ),
    );
  }
}

class _EmptySkills extends StatelessWidget {
  final bool isDark;
  const _EmptySkills({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.extension_off, size: 56, color: AppColors.brand.withOpacity(0.3)),
          const SizedBox(height: 12),
          Text('暂无技能', style: TextStyle(
            fontSize: AppDimens.fontLg, fontWeight: FontWeight.w600,
            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
          )),
          const SizedBox(height: 6),
          Text('前往 PC 端安装或创建技能', style: TextStyle(
            fontSize: AppDimens.fontSm, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
          )),
        ],
      ),
    );
  }
}
