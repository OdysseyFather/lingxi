import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../providers/user_preferences.dart';
import '../services/connection_manager.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class SettingsScreen extends StatelessWidget {
  final bool embedded;
  const SettingsScreen({super.key, this.embedded = false});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final prefs = context.watch<UserPreferences>();
    final cm = state.connectionManager;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppColors.bgPrimaryDark : const Color(0xFFFAFAFC),
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: !embedded,
        title: Text(
          '设置',
          style: TextStyle(
            fontSize: AppDimens.fontLg,
            fontWeight: FontWeight.bold,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 32),
        children: [
          // 个性化设置
          _SectionHeader(title: '个性化', isDark: isDark),
          _SettingsGroup(isDark: isDark, items: [
            _Item(
              icon: Icons.dark_mode_outlined,
              iconBg: const Color(0xFF8B5CF6),
              title: '主题',
              trailing: prefs.themeModeLabel,
              onTap: () => _showThemePicker(context, prefs),
            ),
            _Item(
              icon: Icons.text_fields,
              iconBg: const Color(0xFF3B82F6),
              title: '字体大小',
              trailing: prefs.fontScaleLabel,
              onTap: () => _showFontScalePicker(context, prefs),
            ),
            _Item(
              icon: Icons.send_outlined,
              iconBg: const Color(0xFF10B981),
              title: '回车键发送',
              trailing: prefs.sendOnEnter ? '开' : '关',
              switchValue: prefs.sendOnEnter,
              onSwitchChanged: (v) => prefs.setSendOnEnter(v),
            ),
            _Item(
              icon: Icons.vibration,
              iconBg: const Color(0xFFF59E0B),
              title: '触感反馈',
              switchValue: prefs.hapticEnabled,
              onSwitchChanged: (v) => prefs.setHapticEnabled(v),
            ),
          ]),

          const SizedBox(height: 18),

          // 通知设置
          _SectionHeader(title: '通知', isDark: isDark),
          _SettingsGroup(isDark: isDark, items: [
            _Item(
              icon: Icons.notifications_active_outlined,
              iconBg: AppColors.error,
              title: '系统通知',
              subtitle: 'AI 回复完成后推送到通知栏',
              switchValue: prefs.notifyEnabled,
              onSwitchChanged: (v) => prefs.setNotifyEnabled(v),
            ),
            _Item(
              icon: Icons.volume_up_outlined,
              iconBg: const Color(0xFF06B6D4),
              title: '提示音',
              switchValue: prefs.soundEnabled,
              onSwitchChanged: (v) => prefs.setSoundEnabled(v),
            ),
          ]),

          const SizedBox(height: 18),

          // 连接
          _SectionHeader(title: '连接', isDark: isDark),
          _ConnectionCard(cm: cm, isDark: isDark),

          const SizedBox(height: 12),

          _SettingsGroup(isDark: isDark, items: [
            _Item(
              icon: Icons.refresh,
              iconBg: AppColors.brand,
              title: '手动重连',
              onTap: () async {
                cm.reconnectNow();
                _toast(context, '正在重连...');
              },
            ),
            _Item(
              icon: Icons.link_off,
              iconBg: AppColors.error,
              title: '解除配对',
              titleColor: AppColors.error,
              onTap: () => _confirmUnpair(context, state),
            ),
          ]),

          const SizedBox(height: 18),

          // 智能体（仅快速切换）
          _SectionHeader(title: '当前智能体', isDark: isDark),
          _AgentQuickPanel(state: state, isDark: isDark),

          const SizedBox(height: 18),

          // 关于
          _SectionHeader(title: '关于', isDark: isDark),
          _SettingsGroup(isDark: isDark, items: const [
            _Item(
              icon: Icons.info_outline,
              iconBg: Color(0xFF6B7280),
              title: '版本',
              trailing: '1.0.0',
            ),
            _Item(
              icon: Icons.code,
              iconBg: Color(0xFF6366F1),
              title: 'Flutter 端',
              trailing: '瘦客户端',
            ),
          ]),
        ],
      ),
    );
  }

  static void _showThemePicker(BuildContext context, UserPreferences prefs) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.bgElevatedDark : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 10),
                Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('选择主题', style: TextStyle(
                    fontSize: AppDimens.fontBody,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  )),
                ),
                _ThemeOption(
                  label: '亮色',
                  icon: Icons.light_mode,
                  selected: prefs.themeMode == ThemeMode.light,
                  onTap: () { prefs.setThemeMode(ThemeMode.light); Navigator.pop(ctx); },
                ),
                _ThemeOption(
                  label: '暗色',
                  icon: Icons.dark_mode,
                  selected: prefs.themeMode == ThemeMode.dark,
                  onTap: () { prefs.setThemeMode(ThemeMode.dark); Navigator.pop(ctx); },
                ),
                _ThemeOption(
                  label: '跟随系统',
                  icon: Icons.settings_brightness,
                  selected: prefs.themeMode == ThemeMode.system,
                  onTap: () { prefs.setThemeMode(ThemeMode.system); Navigator.pop(ctx); },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  static void _showFontScalePicker(BuildContext context, UserPreferences prefs) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return StatefulBuilder(builder: (ctx2, setLocalState) {
          double current = prefs.fontScale;
          return Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? AppColors.bgElevatedDark : Colors.white,
              borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(child: Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2)))),
                  const SizedBox(height: 16),
                  Text('字体大小', style: TextStyle(
                    fontSize: AppDimens.fontBody,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  )),
                  const SizedBox(height: 4),
                  Text('调整字体后可在对话中看到效果', style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                  )),
                  const SizedBox(height: 20),

                  // 预览
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withOpacity(0.05) : const Color(0xFFF6F5F8),
                      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                    ),
                    child: Text(
                      '示例文本 Sample 中英 abc 123',
                      style: TextStyle(
                        fontSize: AppDimens.fontBody * current,
                        height: 1.5,
                        color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  Row(
                    children: [
                      Text('小', style: TextStyle(fontSize: 12, color: AppColors.textTertiary)),
                      Expanded(
                        child: Slider(
                          value: current,
                          min: 0.85,
                          max: 1.5,
                          divisions: 13,
                          activeColor: AppColors.brand,
                          onChanged: (v) {
                            setLocalState(() { current = v; });
                            prefs.setFontScale(v);
                          },
                        ),
                      ),
                      Text('大', style: TextStyle(fontSize: 16, color: AppColors.textTertiary)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: Text(
                      '当前: ${(current * 100).toInt()}%',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.brand,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        });
      },
    );
  }

  static void _confirmUnpair(BuildContext context, AppState state) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusLg)),
        title: const Text('解除配对'),
        content: const Text('解除后需要重新扫码配对才能继续使用,确定吗?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('解除'),
          ),
        ],
      ),
    );
    if (confirm == true) {
      await state.unpair();
    }
  }

  static void _toast(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimens.radiusSm)),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final bool isDark;
  const _SectionHeader({required this.title, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
          color: AppColors.textTertiary,
        ),
      ),
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  final bool isDark;
  final List<_Item> items;
  const _SettingsGroup({required this.isDark, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Column(
        children: List.generate(items.length, (i) {
          return Column(
            children: [
              items[i].build(context),
              if (i < items.length - 1)
                Padding(
                  padding: const EdgeInsets.only(left: 60),
                  child: Container(height: 0.5, color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5)),
                ),
            ],
          );
        }),
      ),
    );
  }
}

class _Item {
  final IconData icon;
  final Color iconBg;
  final String title;
  final String? subtitle;
  final String? trailing;
  final Color? titleColor;
  final VoidCallback? onTap;
  final bool? switchValue;
  final ValueChanged<bool>? onSwitchChanged;

  const _Item({
    required this.icon,
    required this.iconBg,
    required this.title,
    this.subtitle,
    this.trailing,
    this.titleColor,
    this.onTap,
    this.switchValue,
    this.onSwitchChanged,
  });

  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hasSwitch = switchValue != null && onSwitchChanged != null;

    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: iconBg.withOpacity(0.15),
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            ),
            child: Icon(icon, size: 18, color: iconBg),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: AppDimens.fontBody,
                    fontWeight: FontWeight.w500,
                    color: titleColor ?? (isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (hasSwitch)
            Switch.adaptive(
              value: switchValue!,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                onSwitchChanged!(v);
              },
              activeColor: AppColors.brand,
            )
          else if (trailing != null) ...[
            Text(
              trailing!,
              style: TextStyle(
                fontSize: AppDimens.fontSm,
                color: AppColors.textTertiary,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 16, color: AppColors.textTertiary),
          ] else if (onTap != null)
            Icon(Icons.chevron_right, size: 16, color: AppColors.textTertiary),
        ],
      ),
    );

    if (hasSwitch) return content;
    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(onTap: onTap, child: content),
      );
    }
    return content;
  }
}

class _ThemeOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _ThemeOption({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 22, color: selected ? AppColors.brand : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondary)),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: AppDimens.fontBody,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                  color: selected
                      ? AppColors.brand
                      : (isDark ? AppColors.textPrimaryDark : AppColors.textPrimary),
                ),
              ),
            ),
            if (selected) Icon(Icons.check, size: 20, color: AppColors.brand),
          ],
        ),
      ),
    );
  }
}

class _ConnectionCard extends StatelessWidget {
  final ConnectionManager cm;
  final bool isDark;
  const _ConnectionCard({required this.cm, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(
          color: (cm.connected ? AppColors.success : AppColors.error).withOpacity(0.2),
        ),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: cm.connected ? AppColors.success : AppColors.error,
                  boxShadow: [
                    BoxShadow(
                      color: (cm.connected ? AppColors.success : AppColors.error).withOpacity(0.4),
                      blurRadius: 6,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                cm.connected ? '已连接' : '未连接',
                style: TextStyle(
                  fontSize: AppDimens.fontBody,
                  fontWeight: FontWeight.w600,
                  color: cm.connected ? AppColors.success : AppColors.error,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.brand.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                ),
                child: Text(
                  cm.mode == ConnectionMode.lan ? '局域网' : (cm.mode == ConnectionMode.wan ? '云端隧道' : '离线'),
                  style: TextStyle(fontSize: 11, color: AppColors.brand, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          if (cm.activeUrl.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              cm.activeUrl,
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                fontFamily: 'monospace',
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class _AgentQuickPanel extends StatelessWidget {
  final AppState state;
  final bool isDark;
  const _AgentQuickPanel({required this.state, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final agent = state.selectedAgent;
    final agents = state.agents;

    if (agents.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? AppColors.bgElevatedDark : Colors.white,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        ),
        child: Center(
          child: Text(
            '暂无可用智能体,请在 PC 端创建',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.bgElevatedDark : Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        border: Border.all(color: AppColors.divider.withOpacity(isDark ? 0.15 : 0.5), width: 0.5),
        boxShadow: AppDimens.shadowSm(),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  gradient: AppColors.avatarHaloGradient,
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Center(
                  child: Text(agent?.emoji ?? '🤖', style: const TextStyle(fontSize: 22)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      agent?.name ?? '默认助手',
                      style: TextStyle(
                        fontSize: AppDimens.fontBody,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                      ),
                    ),
                    if (agent?.description != null)
                      Text(
                        agent!.description!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => _showAgentPicker(context, state),
                style: TextButton.styleFrom(foregroundColor: AppColors.brand),
                child: const Text('切换'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showAgentPicker(BuildContext context, AppState state) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.bgElevatedDark : Colors.white,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.65),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 10),
                Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2))),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('选择智能体', style: TextStyle(
                    fontSize: AppDimens.fontBody,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                  )),
                ),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: state.agents.length,
                    itemBuilder: (_, i) {
                      final a = state.agents[i];
                      final sel = state.selectedAgent?.id == a.id;
                      return ListTile(
                        leading: Text(a.emoji ?? '🤖', style: const TextStyle(fontSize: 22)),
                        title: Text(a.name, style: TextStyle(
                          color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
                          fontWeight: sel ? FontWeight.w600 : FontWeight.normal,
                        )),
                        subtitle: a.description != null ? Text(a.description!, maxLines: 1, overflow: TextOverflow.ellipsis) : null,
                        trailing: sel ? Icon(Icons.check_circle, color: AppColors.brand, size: 20) : null,
                        onTap: () {
                          state.selectAgent(a);
                          Navigator.pop(ctx);
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }
}
