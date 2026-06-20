import 'dart:io';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/app_state.dart';
import '../services/pair_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class PairScreen extends StatefulWidget {
  const PairScreen({super.key});

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _pairService = PairService();

  final _codeController = TextEditingController();
  final _addressController = TextEditingController(text: 'http://192.168.1.1:3001');
  bool _loading = false;
  String? _error;
  String _deviceId = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadOrCreateDeviceId();
  }

  Future<void> _loadOrCreateDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString('device_id') ?? '';
    if (id.isEmpty) {
      id = 'flutter_${DateTime.now().millisecondsSinceEpoch}';
      await prefs.setString('device_id', id);
    }
    _deviceId = id;
  }

  @override
  void dispose() {
    _tabController.dispose();
    _codeController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  String get _deviceName {
    try {
      return '${Platform.operatingSystem} 手机';
    } catch (_) {
      return 'Mobile';
    }
  }

  Future<void> _onQrDetected(String qrData) async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });

    final result = await _pairService.pairWithQrData(qrData, _deviceId, _deviceName);

    if (!mounted) return;

    if (result.success && result.pairToken != null) {
      try {
        final pairData = PairData.fromQrJson(qrData);
        final state = context.read<AppState>();
        await state.onPaired(
          pairToken: result.pairToken!,
          lanIP: pairData.lanIP,
          lanPort: pairData.lanPort,
          wanTunnelToken: pairData.wanTunnelToken,
          wanSignalingUrl: pairData.wanSignalingUrl,
        );
      } catch (e) {
        setState(() { _error = '配对后连接失败: $e'; });
      }
    } else {
      setState(() { _error = result.error ?? '配对失败'; });
    }
    setState(() { _loading = false; });
  }

  Future<void> _onCodeSubmit() async {
    final code = _codeController.text.trim();
    final address = _addressController.text.trim();
    if (code.length != 6 || address.isEmpty) {
      setState(() { _error = '请输入6位配对码和电脑地址'; });
      return;
    }

    setState(() { _loading = true; _error = null; });

    final result = await _pairService.pairWithCode(
      code: code,
      serverAddress: address,
      deviceId: _deviceId,
      deviceName: _deviceName,
    );

    if (!mounted) return;

    if (result.success && result.pairToken != null) {
      final uri = Uri.parse(address);
      final state = context.read<AppState>();
      await state.onPaired(
        pairToken: result.pairToken!,
        lanIP: uri.host,
        lanPort: uri.port.toString(),
      );
    } else {
      setState(() { _error = result.error ?? '配对失败'; });
    }
    setState(() { _loading = false; });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppColors.heroGradientDark : AppColors.heroGradient,
        ),
        child: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 40),
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Center(
                  child: Text('灵', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: AppColors.brand)),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                '灵犀',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 6),
              Text(
                '扫码或输入配对码连接电脑',
                style: TextStyle(fontSize: AppDimens.fontBody, color: Colors.white.withOpacity(0.8)),
              ),
              const SizedBox(height: 28),

              Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.surfaceDark : Colors.white,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.08),
                        blurRadius: 20,
                        offset: const Offset(0, -4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                        child: Container(
                          decoration: BoxDecoration(
                            color: isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFF5F3F0),
                            borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                          ),
                          child: TabBar(
                            controller: _tabController,
                            indicatorSize: TabBarIndicatorSize.tab,
                            indicator: BoxDecoration(
                              color: AppColors.brand,
                              borderRadius: BorderRadius.circular(AppDimens.radiusPill),
                            ),
                            labelColor: Colors.white,
                            unselectedLabelColor: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                            dividerColor: Colors.transparent,
                            labelStyle: const TextStyle(fontSize: AppDimens.fontSm, fontWeight: FontWeight.w600),
                            tabs: const [
                              Tab(text: '📷  扫码配对'),
                              Tab(text: '⌨️  手动输码'),
                            ],
                          ),
                        ),
                      ),
                      Expanded(
                        child: TabBarView(
                          controller: _tabController,
                          children: [
                            _buildQrTab(),
                            _buildCodeTab(),
                          ],
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.error.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                              border: Border.all(color: AppColors.error.withOpacity(0.2)),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.error_outline, color: AppColors.error, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(_error!, style: TextStyle(color: AppColors.error, fontSize: AppDimens.fontSm)),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQrTab() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (_loading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppColors.brand),
            const SizedBox(height: 12),
            Text('配对中...', style: TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.brand.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Icon(Icons.laptop_mac, size: 20, color: AppColors.brand),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '打开电脑端「设置 > 远程访问」\n点击「配对新设备」显示二维码',
                  style: TextStyle(
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondary,
                    fontSize: AppDimens.fontSm,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              child: MobileScanner(
                onDetect: (capture) {
                  final barcodes = capture.barcodes;
                  if (barcodes.isNotEmpty && barcodes.first.rawValue != null) {
                    _onQrDetected(barcodes.first.rawValue!);
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCodeTab() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              '电脑地址',
              style: TextStyle(
                fontSize: AppDimens.fontSm,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _addressController,
              decoration: InputDecoration(
                hintText: 'http://192.168.1.x:3001',
                prefixIcon: Icon(Icons.computer, color: AppColors.brand, size: 20),
                filled: true,
                fillColor: isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFF5F3F0),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: BorderSide(color: AppColors.brand, width: 1.5),
                ),
              ),
              keyboardType: TextInputType.url,
            ),
            const SizedBox(height: 20),
            Text(
              '6 位配对码',
              style: TextStyle(
                fontSize: AppDimens.fontSm,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _codeController,
              decoration: InputDecoration(
                hintText: '000000',
                prefixIcon: Icon(Icons.pin, color: AppColors.brand, size: 20),
                counterText: '',
                filled: true,
                fillColor: isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFF5F3F0),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: BorderSide(color: AppColors.brand, width: 1.5),
                ),
              ),
              keyboardType: TextInputType.number,
              maxLength: 6,
              style: const TextStyle(fontSize: 24, letterSpacing: 8),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            InkWell(
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              onTap: _loading ? null : _onCodeSubmit,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  gradient: _loading ? null : LinearGradient(colors: [AppColors.brand, AppColors.brand.withOpacity(0.8)]),
                  color: _loading ? AppColors.textTertiary.withOpacity(0.3) : null,
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  boxShadow: _loading ? null : [
                    BoxShadow(
                      color: AppColors.brand.withOpacity(0.25),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (_loading)
                      const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    else
                      const Icon(Icons.link, size: 18, color: Colors.white),
                    const SizedBox(width: 8),
                    Text(
                      _loading ? '配对中...' : '开始配对',
                      style: const TextStyle(fontSize: AppDimens.fontBody, fontWeight: FontWeight.w600, color: Colors.white),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
