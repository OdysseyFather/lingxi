import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 长期记忆管理页
class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key});

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  List<dynamic> _memories = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadMemories();
  }

  Future<void> _loadMemories() async {
    setState(() => _loading = true);
    try {
      final data = await context.read<AppState>().apiClient.listMemories();
      if (mounted) setState(() { _memories = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _addMemory() async {
    final controller = TextEditingController();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final content = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF2A2A3E) : Colors.white,
        title: Text('添加记忆', style: TextStyle(color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary)),
        content: TextField(
          controller: controller,
          maxLines: 3,
          autofocus: true,
          style: TextStyle(color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
          decoration: InputDecoration(
            hintText: '输入要让 AI 记住的内容...',
            hintStyle: TextStyle(color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
            child: const Text('添加'),
          ),
        ],
      ),
    );

    if (content != null && content.trim().isNotEmpty && mounted) {
      try {
        await context.read<AppState>().apiClient.createMemory({'content': content.trim()});
        _loadMemories();
      } catch (_) {}
    }
  }

  void _deleteMemory(int id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: const Text('删除后无法恢复，确认删除这条记忆？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await context.read<AppState>().apiClient.deleteMemory(id);
        _loadMemories();
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppColors.surfaceDark : const Color(0xFFFAF8F5),
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text('长期记忆', style: TextStyle(
          fontSize: AppDimens.fontLg, fontWeight: FontWeight.bold,
          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
        )),
        actions: [
          IconButton(
            icon: Icon(Icons.add_circle_outline, color: AppColors.brand),
            onPressed: _addMemory,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _memories.isEmpty
              ? _EmptyMemories(isDark: isDark)
              : RefreshIndicator(
                  onRefresh: _loadMemories,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _memories.length,
                    itemBuilder: (_, i) {
                      final mem = _memories[i];
                      return _MemoryCard(
                        memory: mem,
                        isDark: isDark,
                        onDelete: () => _deleteMemory(mem['id']),
                      );
                    },
                  ),
                ),
    );
  }
}

class _MemoryCard extends StatelessWidget {
  final Map<String, dynamic> memory;
  final bool isDark;
  final VoidCallback onDelete;
  const _MemoryCard({required this.memory, required this.isDark, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final content = memory['content'] ?? '';
    final category = memory['category'] ?? '';
    final createdAt = memory['created_at'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.psychology, size: 16, color: AppColors.brand),
              const SizedBox(width: 6),
              if (category.toString().isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.brand.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Text(category, style: TextStyle(fontSize: 10, color: AppColors.brand)),
                ),
                const SizedBox(width: 6),
              ],
              const Spacer(),
              Text(createdAt.toString().length > 10 ? createdAt.toString().substring(0, 10) : createdAt,
                style: TextStyle(fontSize: 10, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary)),
              const SizedBox(width: 8),
              InkWell(
                onTap: onDelete,
                child: Icon(Icons.delete_outline, size: 16, color: isDark ? Colors.white30 : Colors.black26),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(content, style: TextStyle(
            fontSize: AppDimens.fontBody,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
            height: 1.5,
          )),
        ],
      ),
    );
  }
}

class _EmptyMemories extends StatelessWidget {
  final bool isDark;
  const _EmptyMemories({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.psychology_outlined, size: 56, color: AppColors.brand.withOpacity(0.3)),
          const SizedBox(height: 12),
          Text('暂无记忆', style: TextStyle(
            fontSize: AppDimens.fontLg, fontWeight: FontWeight.w600,
            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
          )),
          const SizedBox(height: 6),
          Text('点击右上角 + 添加，或在对话中提取', style: TextStyle(
            fontSize: AppDimens.fontSm, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
          )),
        ],
      ),
    );
  }
}
