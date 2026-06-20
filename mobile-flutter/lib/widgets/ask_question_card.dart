import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// 选择块 — 对应 PC 端 SingleChoiceBlock
/// 用户选择后以 [选择结果] 格式发送普通消息（与 PC 端逻辑一致）
class ChoiceCard extends StatefulWidget {
  final Map<String, dynamic> data;
  const ChoiceCard({super.key, required this.data});

  @override
  State<ChoiceCard> createState() => _ChoiceCardState();
}

class _ChoiceCardState extends State<ChoiceCard> {
  String? _selectedId;
  List<String> _selectedIds = [];
  bool _submitted = false;

  bool get _isMulti => widget.data['multi'] == true;
  String get _title => widget.data['title']?.toString() ?? widget.data['question']?.toString() ?? '请选择';
  List<Map<String, dynamic>> get _options {
    final raw = widget.data['options'];
    if (raw is List) {
      return raw.map((o) => o is Map ? Map<String, dynamic>.from(o) : <String, dynamic>{}).toList();
    }
    return [];
  }

  void _toggle(String optId) {
    if (_submitted) return;
    setState(() {
      if (_isMulti) {
        if (_selectedIds.contains(optId)) {
          _selectedIds = _selectedIds.where((id) => id != optId).toList();
        } else {
          _selectedIds = [..._selectedIds, optId];
        }
      } else {
        _selectedId = optId;
      }
    });
  }

  bool get _hasSelection => _isMulti ? _selectedIds.isNotEmpty : _selectedId != null;

  void _submit() {
    if (_submitted) return;
    final chosen = _isMulti ? _selectedIds : [_selectedId!];
    final labels = chosen
        .map((id) => _options.firstWhere(
              (o) => o['id']?.toString() == id,
              orElse: () => {'label': id},
            )['label']?.toString() ?? id)
        .toList();
    final msg = '[选择结果] $_title: ${labels.join(', ')}';
    setState(() => _submitted = true);
    context.read<AppState>().sendMessage(msg);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final streaming = context.select<AppState, bool>((s) => s.streaming);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF2A2A3E) : const Color(0xFFF8F7F5),
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: AppColors.brand.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题栏
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [
                AppColors.brand.withOpacity(0.08),
                Colors.transparent,
              ]),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(AppDimens.radiusMd)),
              border: Border(bottom: BorderSide(color: AppColors.brand.withOpacity(0.1))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.checklist_rounded, size: 16, color: AppColors.brand),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _title,
                        style: TextStyle(
                          fontSize: AppDimens.fontBody,
                          fontWeight: FontWeight.w600,
                          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _isMulti ? '可多选 · ${_submitted ? "已提交" : "请选择后确认"}' : '单选 · ${_submitted ? "已提交" : "请选择后确认"}',
                  style: TextStyle(fontSize: AppDimens.fontXs, color: isDark ? Colors.white38 : Colors.black38),
                ),
              ],
            ),
          ),

          // 选项
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: _options.map((opt) {
                final id = opt['id']?.toString() ?? '';
                final label = opt['label']?.toString() ?? id;
                final isSelected = _isMulti ? _selectedIds.contains(id) : _selectedId == id;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    onTap: _submitted ? null : () => _toggle(id),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                        color: isSelected
                            ? AppColors.brand.withOpacity(0.12)
                            : (isDark ? Colors.white.withOpacity(0.05) : Colors.white),
                        border: Border.all(
                          color: isSelected
                              ? AppColors.brand.withOpacity(0.5)
                              : (isDark ? Colors.white12 : Colors.black12),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _isMulti
                                ? (isSelected ? Icons.check_box : Icons.check_box_outline_blank)
                                : (isSelected ? Icons.radio_button_checked : Icons.radio_button_off),
                            size: 18,
                            color: isSelected ? AppColors.brand : (isDark ? Colors.white38 : Colors.black38),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              label,
                              style: TextStyle(
                                fontSize: AppDimens.fontBody,
                                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          // 提交按钮 / 已提交
          if (!_submitted)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: (_hasSelection && !streaming) ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppColors.brand.withOpacity(0.3),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  child: const Text('确认选择', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
              child: Row(
                children: [
                  Icon(Icons.check_circle, size: 16, color: AppColors.success),
                  const SizedBox(width: 6),
                  Text('已提交', style: TextStyle(fontSize: AppDimens.fontSm, color: AppColors.success, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// 输入块 — 对应 PC 端 SingleInputBlock
class InputCard extends StatefulWidget {
  final Map<String, dynamic> data;
  const InputCard({super.key, required this.data});

  @override
  State<InputCard> createState() => _InputCardState();
}

class _InputCardState extends State<InputCard> {
  final Map<String, TextEditingController> _controllers = {};
  bool _submitted = false;

  String get _title => widget.data['title']?.toString() ?? widget.data['question']?.toString() ?? '请提供信息';
  String? get _desc => widget.data['desc']?.toString();
  List<Map<String, dynamic>> get _fields {
    final raw = widget.data['fields'];
    if (raw is List) {
      return raw.map((f) => f is Map ? Map<String, dynamic>.from(f) : <String, dynamic>{}).toList();
    }
    // 如果没有 fields，把 question 当作单个自由输入字段
    return [
      {'id': 'answer', 'label': _title, 'required': true}
    ];
  }

  TextEditingController _ctrl(String id) {
    return _controllers.putIfAbsent(id, () => TextEditingController());
  }

  bool get _allFilled => _fields
      .where((f) => f['required'] != false)
      .every((f) => (_ctrl(f['id']?.toString() ?? '').text).trim().isNotEmpty);

  void _submit() {
    if (_submitted) return;
    final entries = _fields.map((f) {
      final id = f['id']?.toString() ?? '';
      final label = f['label']?.toString() ?? id;
      return '$label: ${_ctrl(id).text.trim().isEmpty ? "(未填写)" : _ctrl(id).text.trim()}';
    }).toList();
    final msg = '[信息回复] $_title:\n${entries.join('\n')}';
    setState(() => _submitted = true);
    context.read<AppState>().sendMessage(msg);
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final streaming = context.select<AppState, bool>((s) => s.streaming);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF2A2A3E) : const Color(0xFFF8F7F5),
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: AppColors.brand.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [
                AppColors.brand.withOpacity(0.08),
                Colors.transparent,
              ]),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(AppDimens.radiusMd)),
              border: Border(bottom: BorderSide(color: AppColors.brand.withOpacity(0.1))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.question_answer_outlined, size: 16, color: AppColors.brand),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _title,
                        style: TextStyle(
                          fontSize: AppDimens.fontBody,
                          fontWeight: FontWeight.w600,
                          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_desc != null) ...[
                  const SizedBox(height: 2),
                  Text(_desc!, style: TextStyle(fontSize: AppDimens.fontXs, color: isDark ? Colors.white38 : Colors.black38)),
                ],
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: _fields.map((f) {
                final id = f['id']?.toString() ?? '';
                final label = f['label']?.toString() ?? id;
                final ctrl = _ctrl(id);

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: TextField(
                    controller: ctrl,
                    enabled: !_submitted,
                    maxLines: 3,
                    minLines: 1,
                    onChanged: (_) => setState(() {}),
                    style: TextStyle(
                      fontSize: AppDimens.fontBody,
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                    ),
                    decoration: InputDecoration(
                      labelText: label,
                      labelStyle: TextStyle(fontSize: AppDimens.fontSm, color: isDark ? Colors.white54 : Colors.black45),
                      filled: true,
                      fillColor: isDark ? Colors.white.withOpacity(0.06) : Colors.white,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                        borderSide: BorderSide(color: AppColors.brand.withOpacity(0.3)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                        borderSide: BorderSide(color: AppColors.brand),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          if (!_submitted)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: (_allFilled && !streaming) ? _submit : null,
                  icon: const Icon(Icons.send, size: 14),
                  label: const Text('提交', style: TextStyle(fontWeight: FontWeight.w600)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppColors.brand.withOpacity(0.3),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
              child: Row(
                children: [
                  Icon(Icons.check_circle, size: 16, color: AppColors.success),
                  const SizedBox(width: 6),
                  Text('已提交', style: TextStyle(fontSize: AppDimens.fontSm, color: AppColors.success, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// 流式占位 — 对应 PC 端 PendingInteractivePlaceholder
/// AI 仍在输出时，显示一个"等待中"的占位卡片
class PendingInteractivePlaceholder extends StatelessWidget {
  const PendingInteractivePlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF2A2A3E) : const Color(0xFFF8F7F5),
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: AppColors.brand.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 16, height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand),
          ),
          const SizedBox(width: 10),
          Text(
            '正在生成交互选项...',
            style: TextStyle(
              fontSize: AppDimens.fontSm,
              color: isDark ? Colors.white54 : Colors.black45,
            ),
          ),
        ],
      ),
    );
  }
}

/// 向后兼容旧的 AskQuestionCard（仅作重导出，内部转为 ChoiceCard）
class AskQuestionCard extends StatelessWidget {
  final String question;
  final List<Map<String, dynamic>> options;
  final bool allowCustom;
  final bool answered;
  final ValueChanged<String> onSubmit;

  const AskQuestionCard({
    super.key,
    required this.question,
    required this.options,
    this.allowCustom = true,
    this.answered = false,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceCard(data: {
      'type': 'choice',
      'title': question,
      'options': options,
    });
  }
}
