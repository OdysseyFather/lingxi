import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 用量统计页
class UsageScreen extends StatefulWidget {
  const UsageScreen({super.key});

  @override
  State<UsageScreen> createState() => _UsageScreenState();
}

class _UsageScreenState extends State<UsageScreen> {
  Map<String, dynamic>? _usage;
  bool _loading = true;
  String _period = 'month';

  @override
  void initState() {
    super.initState();
    _loadUsage();
  }

  Future<void> _loadUsage() async {
    setState(() => _loading = true);
    try {
      final data = await context.read<AppState>().apiClient.getUsage(period: _period);
      if (mounted) setState(() { _usage = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
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
        title: Text('用量统计', style: TextStyle(
          fontSize: AppDimens.fontLg, fontWeight: FontWeight.bold,
          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
        )),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadUsage,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // 时间筛选
                  Row(
                    children: [
                      _PeriodChip(label: '本月', value: 'month', current: _period, onTap: (v) { _period = v; _loadUsage(); }, isDark: isDark),
                      const SizedBox(width: 8),
                      _PeriodChip(label: '本周', value: 'week', current: _period, onTap: (v) { _period = v; _loadUsage(); }, isDark: isDark),
                      const SizedBox(width: 8),
                      _PeriodChip(label: '今天', value: 'day', current: _period, onTap: (v) { _period = v; _loadUsage(); }, isDark: isDark),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // 总览卡片
                  _OverviewCard(usage: _usage!, isDark: isDark),
                  const SizedBox(height: 12),

                  // 详情列表
                  if (_usage!['records'] != null && (_usage!['records'] as List).isNotEmpty) ...[
                    Text('消费记录', style: TextStyle(
                      fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600,
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                    )),
                    const SizedBox(height: 8),
                    ...(_usage!['records'] as List).take(20).map((r) => _RecordItem(record: r, isDark: isDark)),
                  ] else
                    Container(
                      padding: const EdgeInsets.all(24),
                      alignment: Alignment.center,
                      child: Text('暂无消费记录', style: TextStyle(
                        color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                      )),
                    ),
                ],
              ),
            ),
    );
  }
}

class _PeriodChip extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final ValueChanged<String> onTap;
  final bool isDark;
  const _PeriodChip({required this.label, required this.value, required this.current, required this.onTap, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final isActive = value == current;
    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(AppDimens.radiusPill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isActive ? AppColors.brand : (isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFF5F3F0)),
          borderRadius: BorderRadius.circular(AppDimens.radiusPill),
        ),
        child: Text(label, style: TextStyle(
          fontSize: AppDimens.fontSm,
          fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
          color: isActive ? Colors.white : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondary),
        )),
      ),
    );
  }
}

class _OverviewCard extends StatelessWidget {
  final Map<String, dynamic> usage;
  final bool isDark;
  const _OverviewCard({required this.usage, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final totalCost = (usage['total_cost'] ?? usage['totalCost'] ?? 0).toDouble();
    final totalTokens = usage['total_tokens'] ?? usage['totalTokens'] ?? 0;
    final count = usage['count'] ?? usage['total_count'] ?? 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppColors.heroGradient,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('总费用 (USD)', style: TextStyle(fontSize: 12, color: Colors.white70)),
          const SizedBox(height: 4),
          Text('\$${totalCost.toStringAsFixed(4)}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 12),
          Row(
            children: [
              _StatItem(label: 'Tokens', value: _formatNumber(totalTokens)),
              const SizedBox(width: 24),
              _StatItem(label: '请求数', value: count.toString()),
            ],
          ),
        ],
      ),
    );
  }

  String _formatNumber(dynamic n) {
    final val = (n is int) ? n : (n as num).toInt();
    if (val >= 1000000) return '${(val / 1000000).toStringAsFixed(1)}M';
    if (val >= 1000) return '${(val / 1000).toStringAsFixed(1)}K';
    return val.toString();
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  const _StatItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.white60)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
      ],
    );
  }
}

class _RecordItem extends StatelessWidget {
  final dynamic record;
  final bool isDark;
  const _RecordItem({required this.record, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final model = record['model'] ?? '';
    final cost = (record['cost'] ?? 0).toDouble();
    final tokens = record['total_tokens'] ?? record['tokens'] ?? 0;
    final time = record['created_at'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(model, style: TextStyle(
                  fontSize: AppDimens.fontSm, fontWeight: FontWeight.w500,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                )),
                const SizedBox(height: 2),
                Text('$tokens tokens · $time', style: TextStyle(
                  fontSize: 10, color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
                )),
              ],
            ),
          ),
          Text('\$${cost.toStringAsFixed(4)}', style: TextStyle(
            fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
          )),
        ],
      ),
    );
  }
}
