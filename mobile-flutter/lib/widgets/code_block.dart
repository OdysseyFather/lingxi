import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-light.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 代码块（语法高亮 + 语言标签 + 复制按钮 + 自适应主题）
class CodeBlockWidget extends StatelessWidget {
  final String code;
  final String? language;

  const CodeBlockWidget({super.key, required this.code, this.language});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final lang = language?.toLowerCase() ?? '';
    final displayLang = lang.isNotEmpty ? lang : 'code';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
        border: Border.all(color: AppColors.divider.withOpacity(0.6)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            color: isDark ? Colors.white.withOpacity(0.06) : AppColors.textPrimary.withOpacity(0.04),
            child: Row(
              children: [
                Text(
                  displayLang,
                  style: const TextStyle(
                    fontSize: AppDimens.fontXs,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textTertiary,
                    fontFamily: 'monospace',
                  ),
                ),
                const Spacer(),
                InkWell(
                  borderRadius: BorderRadius.circular(4),
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: code));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('代码已复制'), duration: Duration(seconds: 1)),
                    );
                  },
                  child: const Padding(
                    padding: EdgeInsets.all(2),
                    child: Icon(Icons.copy, size: 13, color: AppColors.textTertiary),
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: isDark ? const Color(0xFF1E1E2E) : const Color(0xFFFAF8F5),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.all(10),
              child: HighlightView(
                code,
                language: lang.isEmpty ? 'plaintext' : lang,
                theme: isDark ? atomOneDarkTheme : atomOneLightTheme,
                padding: EdgeInsets.zero,
                textStyle: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12.5,
                  height: 1.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
