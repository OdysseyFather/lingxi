import 'package:flutter/material.dart';

/// 灵犀品牌色系统（豆包活泼 + 千问专业融合）
class AppColors {
  AppColors._();

  // ── 品牌主色 ──────────────────────────────────────────────
  static const brand = Color(0xFF7B68EE);        // 中紫（MediumSlateBlue）
  static const brandLight = Color(0xFFE8E4FD);   // 品牌色淡底
  static const brandDark = Color(0xFF5A4ACF);     // 品牌色深色

  // ── 语义色 ──────────────────────────────────────────────
  static const userBubble = Color(0xFF5B6FE8);    // 用户气泡：沉稳蓝紫
  static const userBubbleText = Colors.white;
  static const aiBubble = Color(0xFFF5F6FA);      // AI 气泡：极浅灰蓝
  static const aiBubbleDark = Color(0xFF2A2D3E);  // AI 气泡暗色模式
  static const thinking = Color(0xFFFFC857);      // 思考块金色
  static const thinkingBg = Color(0xFFFFF9E6);    // 思考块背景
  static const citation = Color(0xFF4A90E2);      // 引用块蓝
  static const citationBg = Color(0xFFEBF3FD);    // 引用块背景
  static const success = Color(0xFF34C759);       // 成功绿
  static const error = Color(0xFFFF3B30);         // 错误红
  static const warning = Color(0xFFFF9500);       // 警告橙

  // ── 文字色 ──────────────────────────────────────────────
  static const textPrimary = Color(0xFF1A1A2E);   // 主文字
  static const textSecondary = Color(0xFF6B7280);  // 次要文字
  static const textTertiary = Color(0xFF9CA3AF);   // 最淡文字
  static const textPrimaryDark = Color(0xFFF0F0F5);
  static const textSecondaryDark = Color(0xFFA1A5B0);
  static const textTertiaryDark = Color(0xFF6B7080);

  // ── 表面色 ──────────────────────────────────────────────
  static const surfaceDark = Color(0xFF14161F);

  // ── 背景色 ──────────────────────────────────────────────
  static const bgPrimary = Color(0xFFFAFAFC);     // 主背景
  static const bgSecondary = Color(0xFFF0F1F5);   // 次级背景（卡片）
  static const bgElevated = Colors.white;          // 悬浮背景
  static const bgPrimaryDark = Color(0xFF0F1117);
  static const bgSecondaryDark = Color(0xFF1A1D28);
  static const bgElevatedDark = Color(0xFF222633);

  // ── 分割线 ──────────────────────────────────────────────
  static const divider = Color(0xFFE5E7EB);
  static const dividerDark = Color(0xFF2D3140);

  // ── 渐变 ──────────────────────────────────────────────
  static const heroGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF7B68EE), Color(0xFF9B8FFF), Color(0xFFF5F6FA)],
    stops: [0.0, 0.5, 1.0],
  );

  static const heroGradientDark = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF4A3ABA), Color(0xFF2A2050), Color(0xFF0F1117)],
    stops: [0.0, 0.5, 1.0],
  );

  // ── 场景入口渐变（豆包风格场景卡片） ────────────────────
  static const sceneWriting = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFEC8A0), Color(0xFFFEA87E)],
  );
  static const sceneCoding = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFA0C8FE), Color(0xFF7EA8FE)],
  );
  static const sceneTranslate = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFC8A0FE), Color(0xFFA87EFE)],
  );
  static const sceneSummary = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFA0FEC8), Color(0xFF7EFEA8)],
  );
  static const sceneAnalysis = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFEC8E0), Color(0xFFFEA0C8)],
  );
  static const sceneCreative = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFEEEC8), Color(0xFFFED080)],
  );

  // 用户气泡渐变（左下→右上）
  static const userBubbleGradient = LinearGradient(
    begin: Alignment.bottomLeft,
    end: Alignment.topRight,
    colors: [Color(0xFF5B6FE8), Color(0xFF7B68EE)],
  );

  // 头像柔光渐变
  static const avatarHaloGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF8B7FFF), Color(0xFF6B5FE8)],
  );

  // ── 工具卡片颜色（降饱和版本） ──────────────────────────
  static const toolRead = Color(0xFF5B8DEF);
  static const toolWrite = Color(0xFF9B7FD4);
  static const toolBash = Color(0xFF5EC292);
  static const toolSearch = Color(0xFFE8965A);
  static const toolTask = Color(0xFF6C7BD4);
  static const toolWeb = Color(0xFF5AA8B5);
  static const toolDefault = Color(0xFF8B95A5);

  /// 工具颜色映射
  static Color getToolColor(String name) {
    final n = name.toLowerCase();
    if (n.contains('read')) return toolRead;
    if (n.contains('write') || n.contains('edit') || n.contains('strreplace')) return toolWrite;
    if (n.contains('bash') || n.contains('shell')) return toolBash;
    if (n.contains('glob') || n.contains('grep') || n.contains('search')) return toolSearch;
    if (n.contains('task') || n.contains('todo')) return toolTask;
    if (n.contains('web')) return toolWeb;
    if (n.contains('mcp')) return toolWeb;
    return toolDefault;
  }
}
