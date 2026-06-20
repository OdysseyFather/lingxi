import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import 'tabs/conversation_tab.dart';
import 'tabs/agents_tab.dart';
import 'tabs/discover_tab.dart';
import 'tabs/mine_tab.dart';
import 'tabs/settings_tab.dart';

/// 主页 — 5 Tab 底部导航壳
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  // Tab 懒加载：首次访问该 tab 时才构建，之后通过 IndexedStack 保留状态
  final Set<int> _builtTabs = {0};

  Widget _buildTabAt(int i) {
    switch (i) {
      case 0:
        return const ConversationTab();
      case 1:
        return const AgentsTab();
      case 2:
        return const DiscoverTab();
      case 3:
        return const MineTab();
      case 4:
        return const SettingsTab();
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: List.generate(5, (i) {
          if (!_builtTabs.contains(i)) {
            return const SizedBox.shrink();
          }
          return _buildTabAt(i);
        }),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : Colors.white,
          border: Border(
            top: BorderSide(color: AppColors.divider.withOpacity(0.3)),
          ),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 56,
            child: Row(
              children: [
                _TabItem(index: 0, icon: Icons.chat_bubble_outline, activeIcon: Icons.chat_bubble, label: '对话', current: _currentIndex, onTap: _onTabTap, isDark: isDark),
                _TabItem(index: 1, icon: Icons.smart_toy_outlined, activeIcon: Icons.smart_toy, label: '智能体', current: _currentIndex, onTap: _onTabTap, isDark: isDark),
                _TabItem(index: 2, icon: Icons.explore_outlined, activeIcon: Icons.explore, label: '发现', current: _currentIndex, onTap: _onTabTap, isDark: isDark),
                _TabItem(index: 3, icon: Icons.person_outline, activeIcon: Icons.person, label: '我的', current: _currentIndex, onTap: _onTabTap, isDark: isDark),
                _TabItem(index: 4, icon: Icons.settings_outlined, activeIcon: Icons.settings, label: '设置', current: _currentIndex, onTap: _onTabTap, isDark: isDark),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _onTabTap(int index) {
    if (index == 0 && _currentIndex == 0) {
      final state = context.read<AppState>();
      if (state.activeSession != null) {
        state.setActiveSession(null);
        return;
      }
    }
    setState(() {
      _builtTabs.add(index);
      _currentIndex = index;
    });
  }
}

class _TabItem extends StatelessWidget {
  final int index;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int current;
  final ValueChanged<int> onTap;
  final bool isDark;

  const _TabItem({
    required this.index,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.current,
    required this.onTap,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final isActive = index == current;
    final color = isActive ? AppColors.brand : (isDark ? Colors.white54 : Colors.black45);

    return Expanded(
      child: InkWell(
        onTap: () => onTap(index),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(isActive ? activeIcon : icon, size: 22, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: isActive ? 16 : 4,
              height: 4,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(2),
                color: isActive ? AppColors.brand : Colors.transparent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
