import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../models/session.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 全局消息搜索页面
class SearchMessagesScreen extends StatefulWidget {
  const SearchMessagesScreen({super.key});

  @override
  State<SearchMessagesScreen> createState() => _SearchMessagesScreenState();
}

class _SearchMessagesScreenState extends State<SearchMessagesScreen> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  List<Map<String, dynamic>> _results = [];
  bool _loading = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onQueryChanged(String query) {
    _debounce?.cancel();
    if (query.trim().length < 2) {
      setState(() { _results = []; _loading = false; });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _performSearch(query.trim());
    });
  }

  Future<void> _performSearch(String query) async {
    try {
      final state = context.read<AppState>();
      final data = await state.apiClient.searchMessages(query);
      if (!mounted) return;
      setState(() {
        _results = data.map((d) => Map<String, dynamic>.from(d as Map)).toList();
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _results = []; _loading = false; });
    }
  }

  void _jumpToSession(Map<String, dynamic> result) {
    final state = context.read<AppState>();
    final sessionId = result['session_id'] as int? ?? 0;
    final session = state.sessions.cast<Session?>().firstWhere(
      (s) => s?.id == sessionId,
      orElse: () => null,
    );
    if (session != null) {
      state.setActiveSession(session);
      Navigator.pop(context);
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
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: TextField(
          controller: _controller,
          focusNode: _focusNode,
          autofocus: true,
          onChanged: _onQueryChanged,
          style: TextStyle(
            fontSize: AppDimens.fontBody,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
          ),
          decoration: InputDecoration(
            hintText: '搜索消息...',
            border: InputBorder.none,
            hintStyle: TextStyle(
              color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
            ),
          ),
        ),
        actions: [
          if (_controller.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.close, size: 20),
              onPressed: () {
                _controller.clear();
                setState(() { _results = []; });
              },
            ),
        ],
      ),
      body: _buildBody(isDark),
    );
  }

  Widget _buildBody(bool isDark) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_controller.text.trim().isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search, size: 48, color: AppColors.textTertiary.withOpacity(0.4)),
            const SizedBox(height: 12),
            Text('输入关键词搜索所有对话',
              style: TextStyle(color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary)),
          ],
        ),
      );
    }

    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off, size: 48, color: AppColors.textTertiary.withOpacity(0.4)),
            const SizedBox(height: 12),
            Text('未找到相关消息',
              style: TextStyle(color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary)),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: _results.length,
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemBuilder: (context, index) {
        final result = _results[index];
        return _SearchResultCard(
          result: result,
          isDark: isDark,
          query: _controller.text.trim(),
          onTap: () => _jumpToSession(result),
        );
      },
    );
  }
}

class _SearchResultCard extends StatelessWidget {
  final Map<String, dynamic> result;
  final bool isDark;
  final String query;
  final VoidCallback onTap;
  const _SearchResultCard({required this.result, required this.isDark, required this.query, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final content = result['content']?.toString() ?? '';
    final role = result['role']?.toString() ?? '';
    final sessionTitle = result['session_title']?.toString() ?? '对话';
    final isUser = role == 'user';

    return Card(
      margin: EdgeInsets.zero,
      elevation: isDark ? 0 : 0.5,
      color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusMd)),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isUser ? Icons.person : Icons.smart_toy,
                    size: 14,
                    color: isUser ? AppColors.userBubble : AppColors.brand,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    sessionTitle,
                    style: TextStyle(
                      fontSize: AppDimens.fontSm,
                      fontWeight: FontWeight.w500,
                      color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  Icon(Icons.arrow_forward_ios, size: 12, color: AppColors.textTertiary),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _truncate(content, 120),
                style: TextStyle(
                  fontSize: AppDimens.fontBody,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  height: 1.5,
                ),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _truncate(String text, int maxLen) {
    final cleaned = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (cleaned.length <= maxLen) return cleaned;
    return '${cleaned.substring(0, maxLen)}...';
  }
}
