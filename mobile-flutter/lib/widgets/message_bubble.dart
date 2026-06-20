import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/message.dart';
import '../providers/app_state.dart';
import '../services/tts_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import 'tool_card.dart';
import 'thinking_block.dart';
import 'code_block.dart';
import 'ask_question_card.dart';

class MessageBubble extends StatelessWidget {
  final Message message;
  final bool isStreaming;

  const MessageBubble({
    super.key,
    required this.message,
    this.isStreaming = false,
  });

  bool get isUser => message.role == 'user';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: GestureDetector(
        onLongPress: () => _showContextMenu(context),
        child: Row(
          mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser) _buildAvatar(context),
            if (!isUser) const SizedBox(width: 8),
            Flexible(
              child: Column(
                crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  if (message.pinned)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.push_pin, size: 11, color: AppColors.thinking),
                          const SizedBox(width: 2),
                          Text('已固定', style: TextStyle(fontSize: 10, color: AppColors.thinking)),
                        ],
                      ),
                    ),
                  isUser ? _buildUserBubble(context) : _buildAssistantBubble(context),
                  if (!isStreaming) _buildCompactActions(context),
                ],
              ),
            ),
            if (isUser) const SizedBox(width: 8),
            if (isUser) _buildAvatar(context),
          ],
        ),
      ),
    );
  }

  void _showContextMenu(BuildContext context) {
    final state = context.read<AppState>();
    final tts = TtsService();
    final isSpeaking = tts.speaking && tts.currentMessageId == message.id;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xFF2A2A3E)
              : Colors.white,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius: 20, offset: const Offset(0, -4)),
          ],
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 12),
              _MenuTile(icon: Icons.copy_outlined, label: '复制', onTap: () {
                Clipboard.setData(ClipboardData(text: message.content));
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('已复制'), duration: Duration(seconds: 1)),
                );
              }),
              _MenuTile(
                icon: message.pinned ? Icons.push_pin : Icons.push_pin_outlined,
                label: message.pinned ? '取消固定' : '固定',
                onTap: () {
                  state.togglePin(message.id);
                  Navigator.pop(ctx);
                },
              ),
              // TTS 朗读
              if (!isUser)
                _MenuTile(
                  icon: isSpeaking ? Icons.stop_circle_outlined : Icons.volume_up_outlined,
                  label: isSpeaking ? '停止朗读' : '朗读',
                  onTap: () {
                    Navigator.pop(ctx);
                    if (isSpeaking) {
                      tts.stop();
                    } else {
                      tts.speak(_extractPlainText(message.content), messageId: message.id);
                    }
                  },
                ),
              if (isUser)
                _MenuTile(icon: Icons.edit_outlined, label: '编辑并重发', onTap: () {
                  Navigator.pop(ctx);
                  _showEditDialog(context);
                }),
              if (!isUser) ...[
                // 重新生成
                _MenuTile(icon: Icons.refresh, label: '重新生成', onTap: () {
                  Navigator.pop(ctx);
                  _regenerateResponse(context, state);
                }),
                _MenuTile(
                  icon: Icons.thumb_up_outlined,
                  label: '点赞',
                  color: message.feedback == 'up' ? AppColors.brand : null,
                  onTap: () {
                    state.setMessageFeedback(message.id, 'up');
                    Navigator.pop(ctx);
                  },
                ),
                _MenuTile(
                  icon: Icons.thumb_down_outlined,
                  label: '踩',
                  color: message.feedback == 'down' ? AppColors.error : null,
                  onTap: () {
                    state.setMessageFeedback(message.id, 'down');
                    Navigator.pop(ctx);
                  },
                ),
              ],
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  /// 提取纯文本（去除 Markdown 语法、JSON 格式等）
  String _extractPlainText(String content) {
    // 移除代码块
    var text = content.replaceAll(RegExp(r'```[\s\S]*?```'), '');
    // 移除行内代码
    text = text.replaceAll(RegExp(r'`[^`]+`'), '');
    // 移除 Markdown 标记
    text = text.replaceAll(RegExp(r'[#*_~>|]'), '');
    // 移除链接
    text = text.replaceAll(RegExp(r'\[([^\]]+)\]\([^)]+\)'), r'$1');
    // 压缩空白
    text = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    return text;
  }

  /// 重新生成 AI 回复（找到此消息前的最后一条用户消息并重发）
  void _regenerateResponse(BuildContext context, AppState state) {
    final messages = state.messages;
    final idx = messages.indexWhere((m) => m.id == message.id);
    if (idx <= 0) return;
    // 向前查找最近的 user 消息
    for (int i = idx - 1; i >= 0; i--) {
      if (messages[i].role == 'user') {
        state.editAndResend(messages[i].id, messages[i].content);
        break;
      }
    }
  }

  Widget _buildAvatar(BuildContext context) {
    if (isUser) {
      return Container(
        width: AppDimens.avatarSm,
        height: AppDimens.avatarSm,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [AppColors.userBubble, AppColors.userBubble.withOpacity(0.8)]),
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
          boxShadow: [
            BoxShadow(
              color: AppColors.userBubble.withOpacity(0.2),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: const Center(
          child: Icon(Icons.person, size: 18, color: Colors.white),
        ),
      );
    }

    // AI 头像：使用智能体自定义头像/emoji
    final state = context.read<AppState>();
    final agent = state.selectedAgent;
    final baseUrl = state.connectionManager.activeUrl;

    if (agent?.avatar != null && agent!.avatar!.isNotEmpty) {
      final avatarUrl = agent.avatar!.startsWith('http')
          ? agent.avatar!
          : '$baseUrl${agent.avatar}';
      return Container(
        width: AppDimens.avatarSm,
        height: AppDimens.avatarSm,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
          boxShadow: [
            BoxShadow(
              color: AppColors.brand.withOpacity(0.15),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
          child: Image.network(
            avatarUrl,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _defaultAssistantAvatar(agent.emoji),
          ),
        ),
      );
    }

    if (agent?.emoji != null && agent!.emoji!.isNotEmpty) {
      return Container(
        width: AppDimens.avatarSm,
        height: AppDimens.avatarSm,
        decoration: BoxDecoration(
          color: AppColors.brand.withOpacity(0.1),
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
        ),
        child: Center(
          child: Text(agent.emoji!, style: const TextStyle(fontSize: 20)),
        ),
      );
    }

    return _defaultAssistantAvatar(null);
  }

  Widget _defaultAssistantAvatar(String? emoji) {
    return Container(
      width: AppDimens.avatarSm,
      height: AppDimens.avatarSm,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [AppColors.brand, AppColors.brand.withOpacity(0.7)]),
        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withOpacity(0.2),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Center(
        child: emoji != null && emoji.isNotEmpty
            ? Text(emoji, style: const TextStyle(fontSize: 20))
            : const Text('灵', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
      ),
    );
  }

  Widget _buildUserBubble(BuildContext context) {
    List<String>? images;
    String displayContent = message.content;
    if (message.content.startsWith('{')) {
      try {
        final parsed = jsonDecode(message.content);
        if (parsed is Map) {
          displayContent = parsed['text'] ?? parsed['content'] ?? message.content;
          if (parsed['images'] is List) {
            images = List<String>.from(parsed['images']);
          }
        }
      } catch (_) {}
    }

    return Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: AppColors.userBubbleGradient,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(AppDimens.radiusLg),
          topRight: Radius.circular(AppDimens.radiusLg),
          bottomLeft: Radius.circular(AppDimens.radiusLg),
          bottomRight: Radius.circular(6),
        ),
        boxShadow: AppDimens.shadowBrand(AppColors.userBubble, opacity: 0.22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (images != null && images.isNotEmpty) ...[
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: images.map((img) {
                try {
                  return GestureDetector(
                    onTap: () => _showFullImage(context, img),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                      child: Image.memory(
                        base64Decode(img.split(',').last),
                        width: 120, height: 120, fit: BoxFit.cover,
                      ),
                    ),
                  );
                } catch (_) {
                  return const SizedBox.shrink();
                }
              }).toList(),
            ),
            const SizedBox(height: 6),
          ],
          if (displayContent.isNotEmpty)
            Text(
              displayContent,
              style: const TextStyle(color: AppColors.userBubbleText, fontSize: AppDimens.fontBody, height: 1.5),
            ),
        ],
      ),
    );
  }

  Widget _buildAssistantBubble(BuildContext context) {
    final blocks = message.blocks;
    final hasBlocks = blocks != null && blocks.isNotEmpty;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.aiBubbleDark : Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(AppDimens.radiusLg),
          topRight: Radius.circular(AppDimens.radiusLg),
          bottomLeft: Radius.circular(6),
          bottomRight: Radius.circular(AppDimens.radiusLg),
        ),
        border: isDark
            ? null
            : Border.all(color: AppColors.divider.withOpacity(0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: hasBlocks ? _buildBlocks(blocks, context) : _buildContentWithInteractive(message.content, context),
    );
  }

  Widget _buildBlocks(List<MessageBlock> blocks, BuildContext context) {
    final widgets = <Widget>[];
    List<Map<String, dynamic>> toolGroup = [];

    void flushToolGroup() {
      if (toolGroup.isEmpty) return;
      if (toolGroup.length == 1) {
        final t = toolGroup.first;
        widgets.add(ToolCard(
          name: t['name'] ?? '',
          label: t['label'],
          done: t['done'] ?? true,
          ms: t['ms'],
          status: t['status'],
          input: t['input'] is Map ? Map<String, dynamic>.from(t['input']) : null,
        ));
      } else {
        widgets.add(ToolGroupCard(tools: toolGroup));
      }
      toolGroup = [];
    }

    for (final block in blocks) {
      if (block.type == 'tool') {
        toolGroup.add({
          'name': block.toolName ?? '',
          'label': block.toolLabel,
          'done': block.done,
          'ms': block.ms,
          'status': block.status,
          'input': block.input,
        });
        continue;
      }

      flushToolGroup();

      if (block.type == 'thinking') {
        if (block.text.trim().isNotEmpty) {
          widgets.add(ThinkingBlock(text: block.text));
        }
      } else if (block.type == 'text') {
        if (block.text.trim().isNotEmpty) {
          _addContentWithInteractive(widgets, block.text, context);
        }
      }
    }
    flushToolGroup();

    if (widgets.isEmpty) {
      final allText = blocks.where((b) => b.type == 'text').map((b) => b.text).join();
      return _buildContentWithInteractive(allText, context);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: widgets,
    );
  }

  /// 渲染文本内容，自动检测 choice/input JSON 并渲染为交互卡片
  Widget _buildContentWithInteractive(String content, BuildContext context) {
    final parts = splitInteractiveBlocks(content);
    final hasInteractive = parts.any((p) => p['type'] == 'choice' || p['type'] == 'input');
    if (!hasInteractive) {
      return _buildMarkdown(content, context);
    }

    final widgets = <Widget>[];
    _addInteractiveParts(widgets, parts, context);
    if (widgets.isEmpty) return _buildMarkdown(content, context);
    if (widgets.length == 1) return widgets.first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: widgets,
    );
  }

  /// 将文本内容中的交互块和 markdown 部分添加到 widgets 列表
  void _addContentWithInteractive(List<Widget> widgets, String content, BuildContext context) {
    final parts = splitInteractiveBlocks(content);
    final hasInteractive = parts.any((p) => p['type'] == 'choice' || p['type'] == 'input');
    if (!hasInteractive) {
      widgets.add(_buildMarkdown(content, context));
      return;
    }
    _addInteractiveParts(widgets, parts, context);
  }

  void _addInteractiveParts(List<Widget> widgets, List<Map<String, dynamic>> parts, BuildContext context) {
    for (final part in parts) {
      if (part['type'] == 'md') {
        final md = (part['content'] as String?)?.trim() ?? '';
        if (md.isNotEmpty) {
          widgets.add(_buildMarkdown(md, context));
        }
      } else if (part['type'] == 'choice') {
        final data = part['data'] as Map<String, dynamic>? ?? {};
        widgets.add(ChoiceCard(data: data));
      } else if (part['type'] == 'input') {
        final data = part['data'] as Map<String, dynamic>? ?? {};
        widgets.add(InputCard(data: data));
      }
    }
  }

  Widget _buildMarkdown(String content, BuildContext context) {
    if (content.trim().isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimary;

    return MarkdownBody(
      data: content,
      selectable: true,
      onTapLink: (text, href, title) {
        if (href != null && href.isNotEmpty) {
          launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication);
        }
      },
      builders: {
        'code': _CodeElementBuilder(),
      },
      styleSheet: MarkdownStyleSheet(
        p: TextStyle(color: textColor, fontSize: AppDimens.fontBody, height: 1.6),
        h1: TextStyle(color: textColor, fontSize: AppDimens.fontXl, fontWeight: FontWeight.bold),
        h2: TextStyle(color: textColor, fontSize: 19, fontWeight: FontWeight.bold),
        h3: TextStyle(color: textColor, fontSize: AppDimens.fontLg, fontWeight: FontWeight.w600),
        code: TextStyle(
          color: textColor,
          backgroundColor: isDark ? Colors.white.withOpacity(0.08) : AppColors.textPrimary.withOpacity(0.06),
          fontSize: AppDimens.fontSm,
          fontFamily: 'monospace',
        ),
        codeblockDecoration: BoxDecoration(
          color: isDark ? Colors.white.withOpacity(0.06) : AppColors.textPrimary.withOpacity(0.04),
          borderRadius: BorderRadius.circular(AppDimens.radiusXs),
        ),
        listBullet: TextStyle(color: textColor),
        blockquoteDecoration: BoxDecoration(
          border: Border(left: BorderSide(color: AppColors.thinking, width: 3)),
          color: AppColors.thinking.withOpacity(0.05),
        ),
        tableBorder: TableBorder.all(color: AppColors.divider),
      ),
    );
  }

  /// 紧凑内联操作（只显示 feedback 状态）
  Widget _buildCompactActions(BuildContext context) {
    if (!isUser && (message.feedback == 'up' || message.feedback == 'down')) {
      return Padding(
        padding: const EdgeInsets.only(top: 3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.feedback == 'up')
              Icon(Icons.thumb_up, size: 12, color: AppColors.brand.withOpacity(0.6)),
            if (message.feedback == 'down')
              Icon(Icons.thumb_down, size: 12, color: AppColors.error.withOpacity(0.6)),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }

  void _showEditDialog(BuildContext context) {
    final controller = TextEditingController(text: message.content);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusMd)),
        title: const Text('编辑消息'),
        content: TextField(
          controller: controller,
          maxLines: null,
          autofocus: true,
          decoration: const InputDecoration(hintText: '编辑内容...'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () {
              final newText = controller.text.trim();
              if (newText.isNotEmpty && newText != message.content) {
                context.read<AppState>().editAndResend(message.id, newText);
              }
              Navigator.pop(ctx);
            },
            child: const Text('保存并重发'),
          ),
        ],
      ),
    );
  }

  void _showFullImage(BuildContext context, String base64Img) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        child: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: InteractiveViewer(
            child: Image.memory(
              base64Decode(base64Img.split(',').last),
              fit: BoxFit.contain,
            ),
          ),
        ),
      ),
    );
  }
}

/// 长按菜单中的条目
class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  const _MenuTile({required this.icon, required this.label, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListTile(
      dense: true,
      leading: Icon(icon, size: 20, color: color ?? (isDark ? AppColors.textSecondaryDark : AppColors.textSecondary)),
      title: Text(
        label,
        style: TextStyle(
          fontSize: AppDimens.fontBody,
          color: color ?? (isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
        ),
      ),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
    );
  }
}

class _CodeElementBuilder extends MarkdownElementBuilder {
  @override
  Widget? visitElementAfter(element, preferredStyle) {
    final code = element.textContent.trimRight();
    if (code.isEmpty) return null;

    final langClass = element.attributes['class'];
    if (langClass == null && !code.contains('\n')) {
      return null;
    }

    String? language;
    if (langClass != null && langClass.startsWith('language-')) {
      language = langClass.substring('language-'.length);
    }
    return CodeBlockWidget(code: code, language: language);
  }
}

/// 解析 JSON 字符串，判断是否为 choice/input 交互块
Map<String, dynamic>? _tryParseInteractiveJSON(String raw) {
  try {
    final parsed = jsonDecode(raw.trim());
    if (parsed is Map<String, dynamic>) {
      final type = parsed['type']?.toString();
      if (type == 'choice' || type == 'input') {
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

/// 将文本拆分为 markdown 和交互块的混合序列
/// 返回 [{type:'md', content:'...'}, {type:'choice'/'input', data:{...}}, ...]
List<Map<String, dynamic>> splitInteractiveBlocks(String text) {
  if (text.isEmpty) return [{'type': 'md', 'content': text}];

  final parts = <Map<String, dynamic>>[];
  var last = 0;

  // 1) 匹配 ```json ... ``` 围栏包裹的 JSON
  final fencedRe = RegExp(r'```json\s*\n([\s\S]*?)\n```');
  for (final m in fencedRe.allMatches(text)) {
    final obj = _tryParseInteractiveJSON(m.group(1) ?? '');
    if (obj != null) {
      if (m.start > last) {
        parts.add({'type': 'md', 'content': text.substring(last, m.start)});
      }
      parts.add({'type': obj['type'], 'data': obj});
      last = m.end;
    }
  }

  // 2) 如果围栏中未找到，扫描裸 JSON 花括号配对
  if (parts.isEmpty) {
    last = 0;
    for (var i = 0; i < text.length; i++) {
      if (text[i] != '{') continue;
      var depth = 0;
      for (var j = i; j < text.length; j++) {
        if (text[j] == '{') {
          depth++;
        } else if (text[j] == '}') {
          depth--;
          if (depth == 0) {
            final candidate = text.substring(i, j + 1);
            if (candidate.contains('"type"') &&
                (candidate.contains('"choice"') || candidate.contains('"input"'))) {
              final obj = _tryParseInteractiveJSON(candidate);
              if (obj != null) {
                if (i > last) {
                  parts.add({'type': 'md', 'content': text.substring(last, i)});
                }
                parts.add({'type': obj['type'], 'data': obj});
                last = j + 1;
                i = j;
              }
            }
            break;
          }
        }
      }
    }
  }

  // 尾部剩余
  if (last < text.length) {
    final remaining = text.substring(last).trim();
    if (remaining.isNotEmpty) {
      parts.add({'type': 'md', 'content': remaining});
    }
  }

  if (parts.isEmpty) return [{'type': 'md', 'content': text}];
  return parts;
}
