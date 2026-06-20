import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 知识库列表页
class KnowledgeListScreen extends StatefulWidget {
  const KnowledgeListScreen({super.key});

  @override
  State<KnowledgeListScreen> createState() => _KnowledgeListScreenState();
}

class _KnowledgeListScreenState extends State<KnowledgeListScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String _searchQuery = '';
  List<dynamic>? _searchResults;
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _loadKnowledge();
  }

  Future<void> _loadKnowledge() async {
    setState(() => _loading = true);
    try {
      final data = await context.read<AppState>().apiClient.listKnowledge();
      if (mounted) setState(() { _items = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _doSearch(String query) async {
    if (query.trim().isEmpty) {
      setState(() { _searchResults = null; _searching = false; });
      return;
    }
    setState(() => _searching = true);
    try {
      final results = await context.read<AppState>().apiClient.searchKnowledge(query);
      if (mounted) setState(() { _searchResults = results; _searching = false; });
    } catch (_) {
      if (mounted) setState(() { _searchResults = []; _searching = false; });
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
        title: Text('知识库', style: TextStyle(
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
                onChanged: (v) {
                  setState(() => _searchQuery = v);
                  _doSearch(v);
                },
                style: TextStyle(
                  fontSize: AppDimens.fontBody,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                ),
                decoration: InputDecoration(
                  hintText: '语义搜索知识库...',
                  prefixIcon: Icon(Icons.search, size: 20, color: isDark ? Colors.white38 : Colors.black38),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  hintStyle: TextStyle(color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary),
                  suffixIcon: _searching ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  ) : null,
                ),
              ),
            ),
          ),

          // 搜索结果 or 知识库列表
          Expanded(
            child: _searchResults != null
                ? _buildSearchResults(isDark)
                : _buildKnowledgeList(isDark),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchResults(bool isDark) {
    if (_searchResults!.isEmpty) {
      return Center(
        child: Text('未找到相关内容', style: TextStyle(
          color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
        )),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      itemCount: _searchResults!.length,
      itemBuilder: (_, i) {
        final item = _searchResults![i];
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item['title'] ?? item['source'] ?? '匹配结果', maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary)),
              const SizedBox(height: 4),
              Text(item['content'] ?? item['chunk'] ?? '', maxLines: 3, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: AppDimens.fontSm, height: 1.5,
                  color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary)),
              if (item['score'] != null) ...[
                const SizedBox(height: 4),
                Text('相关度: ${(item['score'] * 100).toStringAsFixed(0)}%', style: TextStyle(
                  fontSize: 10, color: AppColors.brand)),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildKnowledgeList(bool isDark) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_items.isEmpty) return _EmptyKnowledge(isDark: isDark);

    return RefreshIndicator(
      onRefresh: _loadKnowledge,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: _items.length,
        itemBuilder: (_, i) => _KnowledgeCard(item: _items[i], isDark: isDark),
      ),
    );
  }
}

class _KnowledgeCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool isDark;
  const _KnowledgeCard({required this.item, required this.isDark});

  IconData _iconForCategory(String category) {
    switch (category) {
      case 'docs': return Icons.description;
      case 'qa': return Icons.question_answer;
      case 'data': return Icons.storage;
      default: return Icons.article;
    }
  }

  Color _colorForCategory(String category) {
    switch (category) {
      case 'docs': return AppColors.brand;
      case 'qa': return AppColors.warning;
      case 'data': return AppColors.success;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = item['name'] ?? item['title'] ?? '未命名';
    final category = (item['category'] ?? 'docs').toString();
    final fileType = item['file_type'] ?? '';

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
            color: _colorForCategory(category).withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(_iconForCategory(category), size: 20, color: _colorForCategory(category)),
        ),
        title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(
          fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600,
          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
        )),
        subtitle: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: _colorForCategory(category).withOpacity(0.08),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(category, style: TextStyle(fontSize: 10, color: _colorForCategory(category))),
            ),
            if (fileType.toString().isNotEmpty) ...[
              const SizedBox(width: 6),
              Text(fileType, style: TextStyle(fontSize: 10, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary)),
            ],
          ],
        ),
        trailing: Text('查看请在PC端', style: TextStyle(
          fontSize: 10, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
        )),
      ),
    );
  }
}

class _EmptyKnowledge extends StatelessWidget {
  final bool isDark;
  const _EmptyKnowledge({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.menu_book_outlined, size: 56, color: AppColors.success.withOpacity(0.3)),
          const SizedBox(height: 12),
          Text('暂无知识库', style: TextStyle(
            fontSize: AppDimens.fontLg, fontWeight: FontWeight.w600,
            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
          )),
          const SizedBox(height: 6),
          Text('前往 PC 端上传知识库文档', style: TextStyle(
            fontSize: AppDimens.fontSm, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
          )),
        ],
      ),
    );
  }
}
