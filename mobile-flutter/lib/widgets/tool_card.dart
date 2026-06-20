import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

IconData _getToolIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('read')) return Icons.description_outlined;
  if (n.contains('write') || n.contains('edit') || n.contains('strreplace')) return Icons.edit_outlined;
  if (n.contains('bash') || n.contains('shell')) return Icons.terminal;
  if (n.contains('glob') || n.contains('grep') || n.contains('search')) return Icons.search;
  if (n.contains('task') || n.contains('todo')) return Icons.checklist;
  if (n.contains('web')) return Icons.public;
  if (n.contains('mcp')) return Icons.extension;
  return Icons.build_outlined;
}

/// 工具调用卡片（降饱和颜色编码 + 圆角统一 + 耗时显示）
class ToolCard extends StatefulWidget {
  final String name;
  final String? label;
  final bool done;
  final int? ms;
  final String? status;
  final Map<String, dynamic>? input;
  final bool defaultExpanded;

  const ToolCard({
    super.key,
    required this.name,
    this.label,
    this.done = false,
    this.ms,
    this.status,
    this.input,
    this.defaultExpanded = false,
  });

  @override
  State<ToolCard> createState() => _ToolCardState();
}

class _ToolCardState extends State<ToolCard> {
  late bool _expanded;

  @override
  void initState() {
    super.initState();
    _expanded = widget.defaultExpanded;
  }

  @override
  Widget build(BuildContext context) {
    final color = AppColors.getToolColor(widget.name);
    final icon = _getToolIcon(widget.name);
    final displayName = widget.label ?? widget.name;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
        border: Border.all(color: color.withOpacity(widget.done ? 0.2 : 0.4)),
        color: color.withOpacity(0.05),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppDimens.radiusXs),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Row(
                children: [
                  Icon(icon, size: 14, color: color),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      displayName,
                      style: TextStyle(fontSize: AppDimens.fontSm, fontWeight: FontWeight.w500, color: color),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (widget.ms != null && widget.ms! > 0)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Text(
                        '${(widget.ms! / 1000).toStringAsFixed(1)}s',
                        style: const TextStyle(fontSize: AppDimens.fontXs, color: AppColors.textTertiary),
                      ),
                    ),
                  if (!widget.done)
                    SizedBox(
                      width: 12, height: 12,
                      child: CircularProgressIndicator(strokeWidth: 1.5, color: color),
                    )
                  else
                    Icon(
                      widget.status == 'error' ? Icons.error_outline : Icons.check_circle_outline,
                      size: 14,
                      color: widget.status == 'error' ? AppColors.error : AppColors.success,
                    ),
                  const SizedBox(width: 4),
                  Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 16, color: AppColors.textTertiary),
                ],
              ),
            ),
          ),
          if (_expanded && widget.input != null && widget.input!.isNotEmpty)
            Container(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
              child: _buildDetails(),
            ),
        ],
      ),
    );
  }

  Widget _buildDetails() {
    final input = widget.input!;
    final n = widget.name.toLowerCase();

    if (n.contains('bash') || n.contains('shell')) {
      final cmd = input['command']?.toString() ?? '';
      return Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.textPrimary.withOpacity(0.04),
          borderRadius: BorderRadius.circular(6),
        ),
        child: SelectableText(
          cmd,
          style: const TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.4),
        ),
      );
    }

    if (n.contains('read') || n.contains('write') || n.contains('edit')) {
      final path = input['path']?.toString() ?? input['file_path']?.toString() ?? '';
      return Row(
        children: [
          const Icon(Icons.insert_drive_file_outlined, size: 13, color: AppColors.textTertiary),
          const SizedBox(width: 4),
          Expanded(
            child: SelectableText(
              path,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.textSecondary),
            ),
          ),
        ],
      );
    }

    if (n.contains('grep') || n.contains('glob') || n.contains('search')) {
      final pattern = input['pattern']?.toString() ?? input['glob_pattern']?.toString() ?? input['query']?.toString() ?? '';
      return Row(
        children: [
          const Icon(Icons.search, size: 13, color: AppColors.textTertiary),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              pattern,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.textSecondary),
              overflow: TextOverflow.ellipsis,
              maxLines: 2,
            ),
          ),
        ],
      );
    }

    if (n.contains('task') || n.contains('todo')) {
      final desc = input['description']?.toString() ?? input['content']?.toString() ?? '';
      return Text(desc, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary));
    }

    final entries = input.entries.take(3).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: entries.map((e) {
        final val = e.value?.toString() ?? '';
        return Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: Text(
            '${e.key}: ${val.length > 80 ? '${val.substring(0, 80)}...' : val}',
            style: const TextStyle(fontFamily: 'monospace', fontSize: AppDimens.fontXs, color: AppColors.textSecondary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        );
      }).toList(),
    );
  }
}

/// 工具组卡片（聚合同类型工具调用）
class ToolGroupCard extends StatefulWidget {
  final List<Map<String, dynamic>> tools;
  final bool defaultExpanded;

  const ToolGroupCard({super.key, required this.tools, this.defaultExpanded = false});

  @override
  State<ToolGroupCard> createState() => _ToolGroupCardState();
}

class _ToolGroupCardState extends State<ToolGroupCard> {
  late bool _expanded;

  @override
  void initState() {
    super.initState();
    _expanded = widget.defaultExpanded;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.tools.isEmpty) return const SizedBox.shrink();
    if (widget.tools.length == 1) {
      final t = widget.tools.first;
      return ToolCard(
        name: t['name'] ?? '',
        label: t['label'],
        done: t['done'] ?? false,
        ms: t['ms'],
        status: t['status'],
        input: t['input'] is Map ? Map<String, dynamic>.from(t['input']) : null,
      );
    }

    final totalMs = widget.tools.fold<int>(0, (sum, t) => sum + ((t['ms'] as int?) ?? 0));
    final allDone = widget.tools.every((t) => t['done'] == true);
    final names = widget.tools.map((t) => t['name']?.toString() ?? '').toSet();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
        border: Border.all(color: AppColors.divider),
        color: AppColors.textPrimary.withOpacity(0.02),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppDimens.radiusXs),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Row(
                children: [
                  const Icon(Icons.flash_on, size: 14, color: AppColors.thinking),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      names.length == 1
                          ? '${names.first} ×${widget.tools.length}'
                          : '${widget.tools.length} 项工具调用',
                      style: const TextStyle(fontSize: AppDimens.fontSm, fontWeight: FontWeight.w500),
                    ),
                  ),
                  if (totalMs > 0)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Text(
                        '${(totalMs / 1000).toStringAsFixed(1)}s',
                        style: const TextStyle(fontSize: AppDimens.fontXs, color: AppColors.textTertiary),
                      ),
                    ),
                  if (!allDone)
                    const SizedBox(
                      width: 12, height: 12,
                      child: CircularProgressIndicator(strokeWidth: 1.5),
                    )
                  else
                    const Icon(Icons.check_circle_outline, size: 14, color: AppColors.success),
                  const SizedBox(width: 4),
                  Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 16, color: AppColors.textTertiary),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Column(
                children: widget.tools.map((t) => ToolCard(
                  name: t['name'] ?? '',
                  label: t['label'],
                  done: t['done'] ?? false,
                  ms: t['ms'],
                  status: t['status'],
                  input: t['input'] is Map ? Map<String, dynamic>.from(t['input']) : null,
                )).toList(),
              ),
            ),
        ],
      ),
    );
  }
}
