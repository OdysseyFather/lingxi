import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'providers/app_state.dart';
import 'providers/user_preferences.dart';
import 'screens/pair_screen.dart';
import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'services/push_service.dart';
import 'theme/app_theme.dart';
import 'theme/app_colors.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
  ));

  _safeInitFirebase();

  final prefs = UserPreferences();
  await prefs.init();
  // 应用通知开关到 PushService
  PushService().notificationsEnabled = prefs.notifyEnabled;
  prefs.addListener(() {
    PushService().notificationsEnabled = prefs.notifyEnabled;
  });

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()..init()),
        ChangeNotifierProvider.value(value: prefs),
      ],
      child: const LingxiApp(),
    ),
  );
}

void _safeInitFirebase() {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    PushService().init().catchError((_) {});
  });
}

class LingxiApp extends StatefulWidget {
  const LingxiApp({super.key});

  @override
  State<LingxiApp> createState() => _LingxiAppState();
}

class _LingxiAppState extends State<LingxiApp> {
  bool _onboardingChecked = false;
  bool _onboardingDone = false;

  @override
  void initState() {
    super.initState();
    _checkOnboarding();
  }

  Future<void> _checkOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _onboardingDone = prefs.getBool('onboarding_done') ?? false;
      _onboardingChecked = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final prefs = context.watch<UserPreferences>();
    return MaterialApp(
      title: '灵犀',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: prefs.themeMode,
      builder: (context, child) {
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(prefs.fontScale),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: Consumer<AppState>(
        builder: (context, state, _) {
          if (!_onboardingChecked || state.connecting) {
            return const _SplashScreen();
          }
          if (!_onboardingDone) {
            return OnboardingScreen(onDone: () => setState(() => _onboardingDone = true));
          }
          if (!state.paired) {
            return const PairScreen();
          }
          return const HomeScreen();
        },
      ),
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: Theme.of(context).brightness == Brightness.dark
              ? AppColors.heroGradientDark
              : AppColors.heroGradient,
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.brand.withOpacity(0.3),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Center(
                  child: Text('灵', style: TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: AppColors.brand)),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                '灵犀',
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 8),
              Text(
                '你的本地 AI 工作台',
                style: TextStyle(fontSize: 15, color: Colors.white.withOpacity(0.8)),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: Colors.white.withOpacity(0.8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
