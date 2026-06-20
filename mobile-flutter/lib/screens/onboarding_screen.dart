import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';

/// 首次启动引导页（3 页）
class OnboardingScreen extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingScreen({super.key, required this.onDone});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _currentPage = 0;

  static const _pages = [
    _PageData(
      icon: Icons.hub,
      title: '连接 PC，掌控全局',
      subtitle: '扫描二维码或输入配对码，即可将手机与电脑端灵犀连接。所有 AI 算力和数据都在本地电脑完成，手机端作为便携入口。',
      gradient: [Color(0xFF667EEA), Color(0xFF764BA2)],
    ),
    _PageData(
      icon: Icons.smart_toy,
      title: '多样智能体，随心选择',
      subtitle: '在电脑端创建各种专业智能体——编程助手、写作帮手、翻译专家。手机端一键切换，随时随地获得 AI 帮助。',
      gradient: [Color(0xFFF093FB), Color(0xFFF5576C)],
    ),
    _PageData(
      icon: Icons.chat_bubble,
      title: '流畅对话，无缝体验',
      subtitle: '支持流式输出、图片发送、语音输入、消息搜索。AI 回复实时呈现，和电脑端一样强大。',
      gradient: [Color(0xFF4FACFE), Color(0xFF00F2FE)],
    ),
  ];

  void _next() {
    if (_currentPage < _pages.length - 1) {
      _controller.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    } else {
      _finish();
    }
  }

  void _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_done', true);
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: _pages.length,
            onPageChanged: (i) => setState(() => _currentPage = i),
            itemBuilder: (_, i) => _OnboardingPage(data: _pages[i]),
          ),
          // 跳过按钮
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            right: 16,
            child: TextButton(
              onPressed: _finish,
              child: const Text('跳过', style: TextStyle(color: Colors.white70, fontSize: 14)),
            ),
          ),
          // 底部指示器 + 按钮
          Positioned(
            bottom: MediaQuery.of(context).padding.bottom + 40,
            left: 0, right: 0,
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_pages.length, (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: _currentPage == i ? 24 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _currentPage == i ? Colors.white : Colors.white38,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  )),
                ),
                const SizedBox(height: 32),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _next,
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: AppColors.brand,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                      ),
                      child: Text(
                        _currentPage == _pages.length - 1 ? '开始使用' : '下一步',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PageData {
  final IconData icon;
  final String title;
  final String subtitle;
  final List<Color> gradient;
  const _PageData({required this.icon, required this.title, required this.subtitle, required this.gradient});
}

class _OnboardingPage extends StatelessWidget {
  final _PageData data;
  const _OnboardingPage({required this.data});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: data.gradient,
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(flex: 2),
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Icon(data.icon, size: 50, color: Colors.white),
              ),
              const SizedBox(height: 40),
              Text(
                data.title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 26, fontWeight: FontWeight.bold, color: Colors.white, height: 1.3,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                data.subtitle,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15, color: Colors.white.withOpacity(0.85), height: 1.6,
                ),
              ),
              const Spacer(flex: 3),
            ],
          ),
        ),
      ),
    );
  }
}
