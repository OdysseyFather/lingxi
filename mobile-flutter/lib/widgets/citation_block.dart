import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class Citation {
  final int index;
  final String? title;
  final String? source;
  final String? snippet;

  Citation({required this.index, this.title, this.source, this.snippet});
}

class CitationParser {
  static final _pattern = RegExp(r'\[(\d+)\]');

  static ({String cleanText, List<Citation> citations}) parse(String text) {
    final matches = _pattern.allMatches(text);
    if (matches.isEmpty) return (cleanText: text, citations: []);

    final indices = <int>{};
    for (final m in matches) {
      final idx = int.tryParse(m.group(1) ?? '');
      if (idx != null) indices.add(idx);
    }

    final citations = indices.map((i) => Citation(index: i)).toList()..sort((a, b) => a.index.compareTo(b.index));
    return (cleanText: text, citations: citations);
  }
}

/// 引用脚注列表（蓝色主题）
class CitationFooter extends StatefulWidget {
  final List<Map<String, dynamic>> citations;

  const CitationFooter({super.key, required this.citations});

  @override
  State<CitationFooter> createState() => _CitationFooterState();
}

class _CitationFooterState extends State<CitationFooter> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.citations.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
        border: Border.all(color: AppColors.citation.withOpacity(0.2)),
        color: isDark
            ? AppColors.citation.withOpacity(0.08)
            : AppColors.citationBg,
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: _expanded
                ? const BorderRadius.vertical(top: Radius.circular(AppDimens.radiusXs))
                : BorderRadius.circular(AppDimens.radiusXs),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Row(
                children: [
                  Icon(Icons.format_quote, size: 14, color: AppColors.citation.withOpacity(0.7)),
                  const SizedBox(width: 4),
                  Text(
                    '${widget.citations.length} 个引用来源',
                    style: TextStyle(
                      fontSize: AppDimens.fontSm - 1,
                      color: AppColors.citation,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const Spacer(),
                  Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 16, color: AppColors.textTertiary),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: widget.citations.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final c = entry.value;
                  final title = c['title']?.toString() ?? '引用 ${idx + 1}';
                  final snippet = c['snippet']?.toString() ?? '';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 2),
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.citation.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: Text(
                            '${idx + 1}',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: AppColors.citation,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                              if (snippet.isNotEmpty)
                                Text(
                                  snippet.length > 100 ? '${snippet.substring(0, 100)}...' : snippet,
                                  style: const TextStyle(fontSize: AppDimens.fontXs, color: AppColors.textSecondary),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }
}
