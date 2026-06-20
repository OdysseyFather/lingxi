import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 深度联网搜索页面
///
/// 调用 POST /api/search/deep SSE,实时展示:
/// - 搜索源进度
/// - 网页抓取进度
/// - LLM 综合答案 + 引用标注
class DeepSearchScreen extends StatefulWidget {
  const DeepSearchScreen({super.key});

  @override
  State<DeepSearchScreen> createState() => _DeepSearchScreenState();
}

class _DeepSearchScreenState extends State<DeepSearchScreen> {
  final _queryCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  bool _searching = false;
  String? _error;
  String _answer = '';
  List<Map<String, dynamic>> _sources = [];
  final List<Map<String, dynamic>> _progress = [];

  StreamSubscription? _sub;
  http.Client? _httpClient;

  @override
  void dispose() {
    _queryCtrl.dispose();
    _scrollCtrl.dispose();
    _abort();
    super.dispose();
  }

  void _abort() {
    _sub?.cancel();
    _sub = null;
    _httpClient?.close();
    _httpClient = null;
    if (mounted) setState(() => _searching = false);
  }

  Future<void> _search() async {
    final q = _queryCtrl.text.trim();
    if (q.isEmpty || _searching) return;

    setState(() {
      _searching = true;
      _error = null;
      _answer = '';
      _sources = [];
      _progress.clear();
    });

    final state = context.read<AppState>();
    final baseUrl = state.connectionManager.activeUrl;
    final token = state.connectionManager.pairToken;

    try {
      final client = http.Client();
      _httpClient = client;
      final req = http.Request('POST', Uri.parse('$baseUrl/api/search/deep'))
        ..headers['Content-Type'] = 'application/json'
        ..headers['Accept'] = 'text/event-stream';
      if (token.isNotEmpty) req.headers['X-Pair-Token'] = token;
      req.body = jsonEncode({'query': q, 'max_sources': 5});

      final res = await client.send(req);
      if (res.statusCode != 200) {
        throw Exception('HTTP ${res.statusCode}');
      }

      String buf = '';
      _sub = res.stream.transform(utf8.decoder).listen((chunk) {
        buf += chunk;
        final blocks = buf.split('\n\n');
        if (blocks.isNotEmpty) {
          buf = blocks.removeLast();
        }
        for (final b in blocks) {
          _parseEvent(b);
        }
      }, onDone: () {
        if (mounted) setState(() => _searching = false);
      }, onError: (e) {
        if (mounted) {
          setState(() {
            _error = e.toString();
            _searching = false;
          });
        }
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _searching = false;
      });
    }
  }

  void _parseEvent(String block) {
    String event = '';
    String data = '';
    for (final l in block.split('\n')) {
      if (l.startsWith('event: ')) event = l.substring(7).trim();
      else if (l.startsWith('data: ')) data += l.substring(6);
    }
    if (event.isEmpty || data.isEmpty) return;
    dynamic payload;
    try {
      payload = jsonDecode(data);
    } catch (_) {
      return;
    }
    if (!mounted) return;
    setState(() {
      switch (event) {
        case 'source_start':
        case 'source_done':
        case 'fetch_start':
        case 'fetch_done':
        case 'synthesizing':
        case 'done':
          _progress.add({'type': event, ...(payload as Map<String, dynamic>)});
          break;
        case 'sources':
          if (payload is List) {
            _sources = payload.map((e) => Map<String, dynamic>.from(e)).toList();
          }
          break;
        case 'delta':
          final t = (payload as Map<String, dynamic>)['text'];
          if (t is String) _answer += t;
          // scroll to bottom on new content
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollCtrl.hasClients) {
              _scrollCtrl.jumpTo(_scrollCtrl.position.maxScrollExtent);
            }
          });
          break;
        case 'error':
          _error = (payload as Map<String, dynamic>)['message']?.toString() ?? '未知错误';
          break;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? AppColors.bgPrimaryDark : const Color(0xFFFAFAFC),
      appBar: AppBar(
        title: const Text('深度联网搜索'),
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      body: Column(
        children: [
          _buildSearchBar(isDark),
          if (_error != null) _buildError(),
          Expanded(
            child: ListView(
              controller: _scrollCtrl,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              children: [
                if (!_searching && _answer.isEmpty && _progress.isEmpty && _error == null)
                  _buildEmptyHint(isDark),
                if (_progress.isNotEmpty) _buildProgress(isDark),
                if (_sources.isNotEmpty) _buildSources(isDark),
                if (_answer.isNotEmpty) _buildAnswer(isDark),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar(bool isDark) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
        border: Border(bottom: BorderSide(color: AppColors.divider.withOpacity(0.5))),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _queryCtrl,
              enabled: !_searching,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _search(),
              decoration: InputDecoration(
                hintText: '输入要研究的问题...',
                prefixIcon: Icon(Icons.search, size: 20, color: AppColors.textTertiary),
                filled: true,
                fillColor: isDark ? Colors.white.withOpacity(0.05) : const Color(0xFFF6F5F8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
              ),
            ),
          ),
          const SizedBox(width: 8),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: _searching
                ? IconButton(
                    key: const ValueKey('abort'),
                    onPressed: _abort,
                    icon: Icon(Icons.stop_circle_outlined, color: AppColors.error),
                  )
                : Container(
                    key: const ValueKey('send'),
                    decoration: BoxDecoration(
                      gradient: AppColors.avatarHaloGradient,
                      shape: BoxShape.circle,
                      boxShadow: AppDimens.shadowBrand(AppColors.brand, opacity: 0.3),
                    ),
                    child: IconButton(
                      onPressed: _queryCtrl.text.trim().isEmpty ? null : _search,
                      icon: const Icon(Icons.auto_awesome, color: Colors.white),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyHint(bool isDark) {
    final examples = [
      '量子计算的最新进展',
      '2026 年 AI 大模型领域有哪些突破？',
      '什么是 RAG 检索增强生成？',
      '介绍 React 19 的并发渲染',
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              gradient: AppColors.avatarHaloGradient,
              borderRadius: BorderRadius.circular(AppDimens.radiusXl),
              boxShadow: AppDimens.shadowBrand(AppColors.brand, opacity: 0.3),
            ),
            child: const Center(child: Icon(Icons.travel_explore, size: 36, color: Colors.white)),
          ),
          const SizedBox(height: 16),
          Text(
            '让灵犀帮你查清楚',
            style: TextStyle(
              fontSize: AppDimens.fontXl, fontWeight: FontWeight.w700,
              color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '多源并行检索 + LLM 综合推理',
            style: TextStyle(fontSize: AppDimens.fontSm, color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary),
          ),
          const SizedBox(height: 24),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: examples.map((q) => InkWell(
              onTap: () => setState(() => _queryCtrl.text = q),
              borderRadius: BorderRadius.circular(AppDimens.radiusPill),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withOpacity(0.05) : Colors.white,
                  borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                  border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.2 : 0.6), width: 0.5),
                ),
                child: Text(
                  q,
                  style: TextStyle(
                    fontSize: AppDimens.fontSm,
                    color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  ),
                ),
              ),
            )).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: AppColors.error.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: AppColors.error, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(_error!, style: TextStyle(fontSize: AppDimens.fontSm, color: AppColors.error))),
        ],
      ),
    );
  }

  Widget _buildProgress(bool isDark) {
    // 聚合源进度
    final sourceState = <String, Map<String, dynamic>>{};
    for (final p in _progress) {
      if (p['type'] == 'source_start') {
        sourceState[p['source']] = {'state': 'searching', 'count': 0};
      } else if (p['type'] == 'source_done') {
        sourceState[p['source']] = {'state': 'done', 'count': p['count']};
      }
    }

    final fetchByID = <int, Map<String, dynamic>>{};
    for (final p in _progress) {
      if (p['type'] == 'fetch_start') {
        fetchByID[p['id']] = {'state': 'fetching', 'title': p['title']};
      } else if (p['type'] == 'fetch_done') {
        if (fetchByID[p['id']] != null) {
          fetchByID[p['id']]!['state'] = 'done';
          fetchByID[p['id']]!['chars'] = p['chars'];
        }
      }
    }

    final synthesizing = _progress.any((p) => p['type'] == 'synthesizing');
    final done = _progress.any((p) => p['type'] == 'done');

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (!done)
                SizedBox(
                  width: 14, height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand),
                )
              else
                Icon(Icons.check_circle, size: 16, color: AppColors.success),
              const SizedBox(width: 8),
              Text(
                done ? '搜索完成' : '正在研究...',
                style: TextStyle(
                  fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...sourceState.entries.map((e) {
            final info = e.value;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  Text(_sourceIcon(e.key), style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 8),
                  Text(_sourceLabel(e.key), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary)),
                  const Spacer(),
                  if (info['state'] == 'done')
                    Text('${info['count']} 条', style: TextStyle(fontSize: 11, color: AppColors.textTertiary))
                  else
                    SizedBox(width: 10, height: 10, child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.brand)),
                ],
              ),
            );
          }),
          if (fetchByID.isNotEmpty) ...[
            const Divider(height: 16),
            ...fetchByID.values.take(5).map((f) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 2.5),
              child: Row(
                children: [
                  if (f['state'] == 'done')
                    Icon(Icons.check_circle, size: 11, color: AppColors.success)
                  else
                    SizedBox(width: 11, height: 11, child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.brand)),
                  const SizedBox(width: 6),
                  Expanded(child: Text(
                    f['title'] ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary),
                  )),
                  if (f['chars'] != null) Text('${f['chars']}', style: TextStyle(fontSize: 10, color: AppColors.textTertiary)),
                ],
              ),
            )),
          ],
          if (synthesizing && !done) ...[
            const Divider(height: 16),
            Row(
              children: [
                Icon(Icons.auto_awesome, size: 12, color: AppColors.brand),
                const SizedBox(width: 6),
                Text('正在综合多源信息生成答案...', style: TextStyle(fontSize: 11, color: AppColors.brand)),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSources(bool isDark) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.menu_book_rounded, size: 16, color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(
              '参考来源 (${_sources.length})',
              style: TextStyle(fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600, color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
            ),
          ]),
          const SizedBox(height: 10),
          ..._sources.map((s) => InkWell(
            onTap: () => launchUrl(Uri.parse(s['url']), mode: LaunchMode.externalApplication),
            borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            child: Container(
              padding: const EdgeInsets.all(10),
              margin: const EdgeInsets.only(bottom: 6),
              decoration: BoxDecoration(
                color: AppColors.brand.withOpacity(0.03),
                borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 22, height: 22,
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Center(
                      child: Text(
                        '${s['id']}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s['title'] ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600,
                            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(children: [
                          Text(_sourceIcon(s['source'] ?? ''), style: const TextStyle(fontSize: 10)),
                          const SizedBox(width: 4),
                          Expanded(child: Text(
                            Uri.tryParse(s['url'] ?? '')?.host ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: AppColors.textTertiary),
                          )),
                          Icon(Icons.open_in_new, size: 11, color: AppColors.textTertiary),
                        ]),
                        if (s['snippet'] != null && (s['snippet'] as String).isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            s['snippet'],
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11, height: 1.4,
                              color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildAnswer(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.auto_awesome, size: 16, color: AppColors.brand),
            const SizedBox(width: 6),
            Text('综合答案', style: TextStyle(fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600, color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary)),
          ]),
          const SizedBox(height: 12),
          MarkdownBody(
            data: _answer,
            selectable: true,
            onTapLink: (text, href, title) {
              if (href != null) launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication);
            },
            styleSheet: MarkdownStyleSheet(
              p: TextStyle(
                fontSize: AppDimens.fontBody,
                height: 1.6,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              ),
              h1: TextStyle(fontSize: AppDimens.fontXl, fontWeight: FontWeight.bold),
              h2: TextStyle(fontSize: AppDimens.fontLg, fontWeight: FontWeight.bold),
              h3: TextStyle(fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  String _sourceIcon(String src) {
    switch (src) {
      case 'duckduckgo': return '🦆';
      case 'wikipedia': return '📖';
      default: return '🌐';
    }
  }

  String _sourceLabel(String src) {
    switch (src) {
      case 'duckduckgo': return 'DuckDuckGo';
      case 'wikipedia': return '维基百科';
      default: return src;
    }
  }
}
