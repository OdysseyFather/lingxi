import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../providers/app_state.dart';
import '../models/message.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../widgets/message_bubble.dart';
import '../widgets/thinking_block.dart';
import '../widgets/thinking_indicator.dart';
import '../widgets/tool_card.dart';
import '../widgets/streaming_cursor.dart';
import '../widgets/recommendation_chips.dart';
import '../widgets/code_block.dart';
import '../widgets/ask_question_card.dart';

class ChatScreen extends StatefulWidget {
  final VoidCallback? onOpenDrawer;
  const ChatScreen({super.key, this.onOpenDrawer});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();
  final _imagePicker = ImagePicker();
  List<String> _pendingImages = [];
  List<Map<String, String>> _pendingFiles = []; // {name, content}
  bool _stickToBottom = true;
  bool _recording = false;
  bool _transcribing = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.position.pixels;
    _stickToBottom = (maxScroll - currentScroll) < 100;

    // 上滑到顶部时加载更早消息
    if (_scrollController.position.pixels < 80) {
      final state = context.read<AppState>();
      if (state.hasMoreMessages && !state.loadingOlder) {
        state.loadOlderMessages();
      }
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_stickToBottom && _scrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
        }
      });
    }
  }

  Future<void> _pickImage() async {
    final image = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      imageQuality: 75,
    );
    if (image != null) {
      final bytes = await image.readAsBytes();
      final base64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      setState(() => _pendingImages.add(base64));
    }
  }

  Future<void> _pickFiles() async {
    final result = await FilePicker.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['txt', 'md', 'py', 'go', 'js', 'ts', 'json', 'csv', 'yaml', 'yml', 'xml', 'html', 'css', 'dart', 'java', 'c', 'cpp', 'h', 'rs', 'rb', 'sh', 'sql', 'log'],
    );
    if (result != null && result.files.isNotEmpty) {
      for (final pf in result.files) {
        if (pf.path != null) {
          try {
            final file = File(pf.path!);
            final content = await file.readAsString();
            setState(() {
              _pendingFiles.add({'name': pf.name, 'content': content});
            });
          } catch (_) {}
        }
      }
    }
  }

  Future<void> _send([String? overrideText]) async {
    final text = overrideText ?? _textController.text.trim();
    if (text.isEmpty && _pendingImages.isEmpty && _pendingFiles.isEmpty) return;

    if (overrideText == null) _textController.clear();
    final images = List<String>.from(_pendingImages);
    final files = List<Map<String, String>>.from(_pendingFiles);
    setState(() {
      _pendingImages.clear();
      _pendingFiles.clear();
    });

    // 构建含文件附件的消息
    String messageText = text;
    if (files.isNotEmpty) {
      final fileParts = files.map((f) => '---\n📎 ${f['name']}\n```\n${f['content']}\n```').join('\n');
      messageText = text.isEmpty ? fileParts : '$text\n\n$fileParts';
    }

    final state = context.read<AppState>();
    await state.sendMessage(messageText, images: images.isNotEmpty ? images : null);
  }

  void _startRecording() {
    setState(() => _recording = true);
    // 简化实现：使用 image_picker 的视频能力或提示用户
    // 实际 ASR 需要 record 包，这里用一个模拟提示
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('长按录音中，松开发送'), duration: Duration(seconds: 2)),
    );
  }

  void _stopRecording() async {
    setState(() {
      _recording = false;
      _transcribing = true;
    });
    // 由于 record 包需要额外的原生配置，这里提供一个简化的语音输入实现：
    // 弹出系统语音输入键盘
    setState(() => _transcribing = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('请使用系统键盘的语音输入功能'), duration: Duration(seconds: 2)),
    );
  }

  Widget _buildAppBarAvatar(AppState state) {
    final agent = state.selectedAgent;
    final baseUrl = state.connectionManager.activeUrl;

    if (agent?.avatar != null && agent!.avatar!.isNotEmpty) {
      final url = agent.avatar!.startsWith('http') ? agent.avatar! : '$baseUrl${agent.avatar}';
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(url, width: 28, height: 28, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _miniDefaultAvatar(agent.emoji)),
      );
    }
    if (agent?.emoji != null && agent!.emoji!.isNotEmpty) {
      return Container(
        width: 28, height: 28,
        decoration: BoxDecoration(
          color: AppColors.brand.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(child: Text(agent.emoji!, style: const TextStyle(fontSize: 16))),
      );
    }
    return _miniDefaultAvatar(null);
  }

  Widget _miniDefaultAvatar(String? emoji) {
    return Container(
      width: 28, height: 28,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [AppColors.brand, AppColors.brand.withOpacity(0.7)]),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: emoji != null && emoji.isNotEmpty
            ? Text(emoji, style: const TextStyle(fontSize: 16))
            : const Text('灵', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
      ),
    );
  }

  void _showAgentPicker(BuildContext context, AppState state) {
    if (state.agents.isEmpty) return;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF2A2A3E) : Colors.white,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('选择智能体', style: TextStyle(
                fontSize: AppDimens.fontBody,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              )),
            ),
            const Divider(height: 1),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.4),
              child: ListView(
                shrinkWrap: true,
                children: [
                  _agentTile(ctx, state, null, isDark),
                  ...state.agents.map((a) => _agentTile(ctx, state, a, isDark)),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showProfilePicker(BuildContext context, AppState state) {
    if (state.apiProfiles.isEmpty) {
      state.loadApiProfiles();
      return;
    }
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF2A2A3E) : Colors.white,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('选择模型接入点', style: TextStyle(
                fontSize: AppDimens.fontBody,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              )),
            ),
            const Divider(height: 1),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.4),
              child: ListView(
                shrinkWrap: true,
                children: state.apiProfiles.map((profile) {
                  final isActive = profile['is_active'] == true || profile['is_active'] == 1;
                  final name = profile['name'] ?? '未命名';
                  final model = profile['model'] ?? '';
                  return ListTile(
                    leading: Icon(
                      Icons.memory,
                      color: isActive ? AppColors.brand : (isDark ? Colors.white38 : Colors.black38),
                    ),
                    title: Text(name, style: TextStyle(
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                      fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                    )),
                    subtitle: model.isNotEmpty ? Text(model, style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.white54 : Colors.black45,
                    )) : null,
                    trailing: isActive ? Icon(Icons.check_circle, color: AppColors.brand, size: 20) : null,
                    onTap: () {
                      if (!isActive && profile['id'] != null) {
                        state.activateProfile(profile['id']);
                      }
                      Navigator.pop(ctx);
                    },
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _agentTile(BuildContext ctx, AppState state, dynamic agent, bool isDark) {
    final isSelected = agent == null
        ? state.selectedAgent == null
        : state.selectedAgent?.id == agent.id;
    final name = agent?.name ?? '默认助手';
    final emoji = agent?.emoji ?? '🤖';

    return ListTile(
      leading: Text(emoji, style: const TextStyle(fontSize: 24)),
      title: Text(name, style: TextStyle(
        color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
      )),
      trailing: isSelected ? Icon(Icons.check_circle, color: AppColors.brand, size: 20) : null,
      onTap: () {
        state.selectAgent(agent);
        Navigator.pop(ctx);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final session = state.activeSession;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

    return Scaffold(
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleSpacing: 0,
        leading: widget.onOpenDrawer != null
            ? IconButton(
                icon: const Icon(Icons.menu),
                onPressed: widget.onOpenDrawer,
              )
            : null,
        title: GestureDetector(
          onTap: () => _showAgentPicker(context, state),
          child: Row(
            children: [
              _buildAppBarAvatar(state),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            state.selectedAgent?.name ?? '默认助手',
                            style: TextStyle(
                              fontSize: AppDimens.fontBody,
                              fontWeight: FontWeight.w600,
                              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(Icons.expand_more, size: 16, color: isDark ? Colors.white54 : Colors.black45),
                      ],
                    ),
                    if (state.streaming)
                      _StreamingStatus(state: state)
                    else
                      Text(
                        session?.title ?? '新对话',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? Colors.white54 : Colors.black45,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (state.streaming)
            _AnimatedStopButton(onPressed: () => state.abortChat())
          else
            IconButton(
              icon: const Icon(Icons.tune, size: 20),
              tooltip: '切换模型',
              onPressed: () => _showProfilePicker(context, state),
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.divider.withOpacity(0.5)),
        ),
      ),
      body: Column(
        children: [
          // WS 断线红条
          if (!state.wsConnected)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              color: AppColors.error.withOpacity(0.9),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_off, size: 14, color: Colors.white),
                  const SizedBox(width: 6),
                  const Text(
                    '连接已断开，正在重连...',
                    style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),

          Expanded(
            child: state.messages.isEmpty && !state.streaming
                ? _WelcomeView(onSuggest: _send)
                : _buildMessageList(state),
          ),

          if (_pendingImages.isNotEmpty)
            _ImagePreviewStrip(
              images: _pendingImages,
              onRemove: (i) => setState(() => _pendingImages.removeAt(i)),
            ),

          if (_pendingFiles.isNotEmpty)
            _FilePreviewStrip(
              files: _pendingFiles,
              onRemove: (i) => setState(() => _pendingFiles.removeAt(i)),
            ),

          _ComposerBar(
            controller: _textController,
            focusNode: _focusNode,
            streaming: state.streaming,
            recording: _recording,
            transcribing: _transcribing,
            onSend: () => _send(),
            onStop: () => state.abortChat(),
            onPickImage: _pickImage,
            onPickFiles: _pickFiles,
            onVoiceStart: _startRecording,
            onVoiceStop: _stopRecording,
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(AppState state) {
    final hasLoader = state.loadingOlder || state.hasMoreMessages;
    final hasSuggestions = !state.streaming && state.suggestedReplies.isNotEmpty;
    final itemCount = (hasLoader ? 1 : 0) + state.messages.length + (state.streaming ? 1 : 0) + (hasSuggestions ? 1 : 0);
    final offset = hasLoader ? 1 : 0;

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        // 顶部加载指示器
        if (hasLoader && index == 0) {
          if (state.loadingOlder) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
            );
          }
          return const SizedBox(height: 8);
        }

        final msgIndex = index - offset;
        if (msgIndex < state.messages.length) {
          final msg = state.messages[msgIndex];
          return MessageBubble(message: msg);
        }

        // 流式输出块
        if (state.streaming) {
          final streamIdx = msgIndex - state.messages.length;
          if (streamIdx == 0) return _buildLiveBlocks(state);
        }

        // 推荐回复 chips（在流式完成后最后一个元素）
        if (hasSuggestions) {
          return RecommendationChips(
            suggestions: state.suggestedReplies,
            onTap: (text) {
              state.clearSuggestions();
              _send(text);
            },
          );
        }

        return _buildLiveBlocks(state);
      },
    );
  }

  Widget _buildLiveBlocks(AppState state) {
    final blocks = state.liveBlocks;
    if (blocks.isEmpty) {
      if (state.streaming) {
        return _buildWaitingIndicator(state);
      }
      return const SizedBox.shrink();
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final widgets = <Widget>[];
    List<Map<String, dynamic>> toolGroup = [];

    void flushToolGroup() {
      if (toolGroup.isEmpty) return;
      if (toolGroup.length == 1) {
        final t = toolGroup.first;
        widgets.add(ToolCard(
          name: t['name'] ?? '',
          label: t['label'],
          done: t['done'] ?? false,
          ms: t['ms'],
          status: t['status'],
          input: t['input'] is Map ? Map<String, dynamic>.from(t['input']) : null,
        ));
      } else {
        widgets.add(ToolGroupCard(tools: toolGroup));
      }
      toolGroup = [];
    }

    for (int i = 0; i < blocks.length; i++) {
      final b = blocks[i];
      final isLast = i == blocks.length - 1;

      if (b.type == 'tool') {
        toolGroup.add({
          'name': b.toolName ?? '',
          'label': b.toolLabel,
          'done': b.done,
          'ms': b.ms,
          'status': b.status,
          'input': b.input,
        });
        continue;
      }

      flushToolGroup();

      if (b.type == 'ask_question') {
        // ask_question WS 事件：流式期间显示占位符，结束后变为可交互
        // 但这里是 liveBlocks（流式期间），显示占位符
        widgets.add(const PendingInteractivePlaceholder());
        continue;
      }

      if (b.type == 'thinking') {
        if (!b.done && isLast) {
          widgets.add(ThinkingIndicator(text: b.text));
        } else if (b.text.trim().isNotEmpty) {
          widgets.add(ThinkingBlock(text: b.text));
        }
      } else if (b.type == 'text') {
        // 流式阶段：检测文本中 choice/input JSON，显示占位符（与 PC 一致）
        final parts = splitInteractiveBlocks(b.text);
        final hasInteractive = parts.any((p) => p['type'] == 'choice' || p['type'] == 'input');

        if (hasInteractive) {
          // 渲染 markdown 部分，交互部分显示占位符
          for (final part in parts) {
            if (part['type'] == 'md') {
              final md = (part['content'] as String?)?.trim() ?? '';
              if (md.isNotEmpty) {
                widgets.add(_buildStreamTextBubble(context, md, isDark, false));
              }
            } else {
              widgets.add(const PendingInteractivePlaceholder());
            }
          }
          if (isLast) {
            widgets.add(const StreamingCursor());
          }
        } else {
          widgets.add(_buildStreamTextBubble(context, b.text, isDark, isLast));
        }
      }
    }
    flushToolGroup();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildAgentAvatar(state),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: widgets,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStreamTextBubble(BuildContext context, String text, bool isDark, bool showCursor) {
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MarkdownBody(
            data: text,
            selectable: true,
            builders: {'code': _CodeBuilder()},
            styleSheet: MarkdownStyleSheet(
              p: TextStyle(
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                fontSize: AppDimens.fontBody,
                height: AppDimens.lineHeightNormal,
              ),
              code: TextStyle(
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                backgroundColor: isDark ? Colors.white.withOpacity(0.08) : AppColors.textPrimary.withOpacity(0.06),
                fontSize: AppDimens.fontSm,
                fontFamily: 'monospace',
              ),
              codeblockDecoration: BoxDecoration(
                color: isDark ? Colors.white.withOpacity(0.06) : AppColors.textPrimary.withOpacity(0.04),
                borderRadius: BorderRadius.circular(AppDimens.radiusXs),
              ),
            ),
          ),
          if (showCursor) const StreamingCursor(),
        ],
      ),
    );
  }

  Widget _buildWaitingIndicator(AppState state) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildAgentAvatar(state),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.white.withOpacity(0.06)
                  : const Color(0xFFF0F2F5),
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.brand.withOpacity(0.6),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '思考中...',
                  style: TextStyle(
                    fontSize: AppDimens.fontSm,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : Colors.black54,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgentAvatar(AppState state) {
    final agent = state.selectedAgent;
    final baseUrl = state.connectionManager.activeUrl;

    // 有自定义头像 URL
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
            errorBuilder: (_, __, ___) => _buildDefaultAgentAvatar(agent.emoji),
          ),
        ),
      );
    }

    // 有 emoji
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

    return _buildDefaultAgentAvatar(null);
  }

  Widget _buildDefaultAgentAvatar(String? emoji) {
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
}

class _CodeBuilder extends MarkdownElementBuilder {
  @override
  Widget? visitElementAfter(element, preferredStyle) {
    final code = element.textContent.trimRight();
    if (code.isEmpty) return null;
    final langClass = element.attributes['class'];
    if (langClass == null && !code.contains('\n')) return null;
    String? language;
    if (langClass != null && langClass.startsWith('language-')) {
      language = langClass.substring('language-'.length);
    }
    return CodeBlockWidget(code: code, language: language);
  }
}

/// 流式状态指示
class _StreamingStatus extends StatelessWidget {
  final AppState state;
  const _StreamingStatus({required this.state});

  @override
  Widget build(BuildContext context) {
    String label;
    if (state.isThinking) {
      label = '思考中...';
    } else if (state.hasToolRunning) {
      final tool = state.liveBlocks.lastWhere(
        (b) => b.type == 'tool' && !b.done,
        orElse: () => LiveBlock(type: 'tool'),
      );
      label = '执行 ${tool.toolLabel ?? tool.toolName ?? "工具"}...';
    } else {
      label = '回复中...';
    }
    return Text(label, style: TextStyle(fontSize: AppDimens.fontXs, color: AppColors.brand));
  }
}

/// 停止按钮（带脉冲效果）
class _AnimatedStopButton extends StatelessWidget {
  final VoidCallback onPressed;
  const _AnimatedStopButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppDimens.radiusPill),
        onTap: onPressed,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.error.withOpacity(0.1),
            borderRadius: BorderRadius.circular(AppDimens.radiusPill),
            border: Border.all(color: AppColors.error.withOpacity(0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.stop_circle, size: 16, color: AppColors.error),
              const SizedBox(width: 4),
              Text('停止', style: TextStyle(fontSize: AppDimens.fontSm, color: AppColors.error, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }
}

/// 胶囊输入栏（含附件弹出菜单 + 语音输入）
class _ComposerBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool streaming;
  final bool recording;
  final bool transcribing;
  final VoidCallback onSend;
  final VoidCallback onStop;
  final VoidCallback onPickImage;
  final VoidCallback onPickFiles;
  final VoidCallback onVoiceStart;
  final VoidCallback onVoiceStop;

  const _ComposerBar({
    required this.controller,
    required this.focusNode,
    required this.streaming,
    this.recording = false,
    this.transcribing = false,
    required this.onSend,
    required this.onStop,
    required this.onPickImage,
    required this.onPickFiles,
    required this.onVoiceStart,
    required this.onVoiceStop,
  });

  void _showAttachMenu(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF2A2A3E) : Colors.white,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 12),
              ListTile(
                leading: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: AppColors.brand.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: Icon(Icons.photo_library_outlined, color: AppColors.brand, size: 20),
                ),
                title: const Text('相册'),
                onTap: () { Navigator.pop(ctx); onPickImage(); },
              ),
              ListTile(
                leading: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: AppColors.success.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: Icon(Icons.camera_alt_outlined, color: AppColors.success, size: 20),
                ),
                title: const Text('拍照'),
                onTap: () async {
                  Navigator.pop(ctx);
                  final picker = ImagePicker();
                  final photo = await picker.pickImage(source: ImageSource.camera, maxWidth: 1920, imageQuality: 75);
                  if (photo != null) {
                    final bytes = await photo.readAsBytes();
                    final _ = 'data:image/jpeg;base64,${base64Encode(bytes)}';
                    onPickImage();
                  }
                },
              ),
              ListTile(
                leading: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: Colors.orange.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.attach_file, color: Colors.orange, size: 20),
                ),
                title: const Text('文件'),
                subtitle: const Text('支持 txt/md/py/go/json 等文本文件', style: TextStyle(fontSize: 11)),
                onTap: () {
                  Navigator.pop(ctx);
                  onPickFiles();
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Container(
      padding: EdgeInsets.only(
        left: 12, right: 12, top: 10,
        bottom: bottomPadding + 10,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withOpacity(0.05) : const Color(0xFFF6F5F8),
          borderRadius: BorderRadius.circular(AppDimens.radiusXxl),
          border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.6), width: 0.5),
          boxShadow: AppDimens.shadowSm(),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // + 附件按钮
              InkWell(
                borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                onTap: () => _showAttachMenu(context),
                child: Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.brand.withOpacity(0.10),
                  ),
                  child: Icon(Icons.add, size: 22, color: AppColors.brand),
                ),
              ),
              const SizedBox(width: 4),
              // 输入框
              Expanded(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: AppDimens.composerMaxHeight),
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    maxLines: null,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSend(),
                    style: TextStyle(
                      fontSize: AppDimens.fontBody,
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                      height: 1.4,
                    ),
                    decoration: InputDecoration(
                      hintText: '问问灵犀...',
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      hintStyle: TextStyle(
                        color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiary,
                        fontSize: AppDimens.fontBody,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              // 麦克风按钮
              if (!streaming && !transcribing)
                InkWell(
                  borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                  onTap: recording ? onVoiceStop : onVoiceStart,
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: recording
                          ? AppColors.error.withOpacity(0.15)
                          : Colors.transparent,
                    ),
                    child: Icon(
                      recording ? Icons.mic_off : Icons.mic_none,
                      size: 20,
                      color: recording ? AppColors.error : AppColors.textSecondary,
                    ),
                  ),
                ),
              if (transcribing)
                const SizedBox(
                  width: 36, height: 36,
                  child: Padding(
                    padding: EdgeInsets.all(10),
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              const SizedBox(width: 2),
              // 发送/停止按钮
              InkWell(
                borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                onTap: streaming ? onStop : onSend,
                child: Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: streaming
                        ? LinearGradient(colors: [AppColors.error, AppColors.error.withOpacity(0.85)])
                        : AppColors.avatarHaloGradient,
                    boxShadow: AppDimens.shadowBrand(streaming ? AppColors.error : AppColors.brand, opacity: 0.3),
                  ),
                  child: Icon(
                    streaming ? Icons.stop_rounded : Icons.arrow_upward_rounded,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 图片预览条
class _ImagePreviewStrip extends StatelessWidget {
  final List<String> images;
  final ValueChanged<int> onRemove;

  const _ImagePreviewStrip({required this.images, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 76,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        itemCount: images.length,
        itemBuilder: (context, i) {
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                  child: Image.memory(
                    base64Decode(images[i].split(',').last),
                    width: 60, height: 60, fit: BoxFit.cover,
                  ),
                ),
                Positioned(
                  top: -2, right: -2,
                  child: GestureDetector(
                    onTap: () => onRemove(i),
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 4)],
                      ),
                      child: const Icon(Icons.close, size: 12, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// 文件附件预览条
class _FilePreviewStrip extends StatelessWidget {
  final List<Map<String, String>> files;
  final ValueChanged<int> onRemove;

  const _FilePreviewStrip({required this.files, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: 40,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        itemCount: files.length,
        itemBuilder: (context, i) {
          return Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: isDark ? Colors.white.withOpacity(0.08) : Colors.orange.withOpacity(0.08),
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              border: Border.all(color: Colors.orange.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.description_outlined, size: 14, color: Colors.orange),
                const SizedBox(width: 4),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 120),
                  child: Text(
                    files[i]['name'] ?? '',
                    style: TextStyle(fontSize: 12, color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: () => onRemove(i),
                  child: Icon(Icons.close, size: 14, color: AppColors.textTertiary),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// 精致空状态欢迎页
class _WelcomeView extends StatelessWidget {
  final ValueChanged<String> onSuggest;
  const _WelcomeView({required this.onSuggest});

  static const _suggestions = [
    '帮我写一封感谢邮件',
    '解释量子计算的原理',
    '给我推荐一些学习 Flutter 的资源',
    '用 Python 写一个快速排序',
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 头像光晕装饰
            Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 120, height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [AppColors.brand.withOpacity(0.18), Colors.transparent],
                    ),
                  ),
                ),
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    gradient: AppColors.avatarHaloGradient,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: AppDimens.shadowBrand(AppColors.brand, opacity: 0.4),
                  ),
                  child: const Center(
                    child: Text('灵', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            ShaderMask(
              shaderCallback: (rect) => AppColors.avatarHaloGradient.createShader(rect),
              child: const Text(
                '我是灵犀',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: AppDimens.letterSpacingTitle,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '你的智能助手,有什么可以帮你?',
              style: TextStyle(
                fontSize: AppDimens.fontBody,
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 32),
            Wrap(
              spacing: 8,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: _suggestions.map((s) {
                return Material(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                    onTap: () => onSuggest(s),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                        color: isDark
                            ? Colors.white.withOpacity(0.06)
                            : Colors.white,
                        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.2 : 0.7), width: 0.5),
                        boxShadow: AppDimens.shadowSm(),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.auto_awesome, size: 14, color: AppColors.brand.withOpacity(0.8)),
                          const SizedBox(width: 6),
                          Text(
                            s,
                            style: TextStyle(
                              fontSize: AppDimens.fontSm,
                              fontWeight: FontWeight.w500,
                              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
