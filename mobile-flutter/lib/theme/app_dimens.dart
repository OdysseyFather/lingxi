/// 灵犀 Design Tokens（统一圆角/间距/字号/阴影）
///
/// 对标豆包/千问的视觉系统：大圆角、柔和阴影、精致间距
import 'package:flutter/material.dart';

class AppDimens {
  AppDimens._();

  // ── 圆角 ──────────────────────────────────────────────
  static const double radiusXs = 8;
  static const double radiusSm = 12;
  static const double radiusMd = 16;
  static const double radiusLg = 20;
  static const double radiusXl = 24;
  static const double radiusXxl = 28;
  static const double radiusPill = 999;

  // ── 间距 ──────────────────────────────────────────────
  static const double unit = 4;
  static const double spaceXs = 8;
  static const double spaceSm = 12;
  static const double spaceMd = 16;
  static const double spaceLg = 24;
  static const double spaceXl = 32;
  static const double spaceXxl = 48;

  // ── 字号 ──────────────────────────────────────────────
  static const double fontXs = 11;
  static const double fontSm = 13;
  static const double fontBody = 15;
  static const double fontLg = 17;
  static const double fontXl = 22;
  static const double fontTitle = 26;
  static const double fontHero = 32;

  // ── 字间距/行高 ───────────────────────────────────────
  static const double lineHeightLoose = 1.7;
  static const double lineHeightNormal = 1.55;
  static const double lineHeightTight = 1.3;
  static const double letterSpacingTitle = -0.4;

  // ── 头像尺寸 ──────────────────────────────────────────
  static const double avatarSm = 32;
  static const double avatarMd = 40;
  static const double avatarLg = 56;
  static const double avatarXl = 72;

  // ── 阴影体系（柔和、3级） ─────────────────────────────
  static List<BoxShadow> shadowSm({Color? base}) => [
        BoxShadow(
          color: (base ?? Colors.black).withOpacity(0.04),
          blurRadius: 8,
          offset: const Offset(0, 2),
        ),
      ];

  static List<BoxShadow> shadowMd({Color? base}) => [
        BoxShadow(
          color: (base ?? Colors.black).withOpacity(0.06),
          blurRadius: 16,
          offset: const Offset(0, 4),
        ),
      ];

  static List<BoxShadow> shadowLg({Color? base}) => [
        BoxShadow(
          color: (base ?? Colors.black).withOpacity(0.08),
          blurRadius: 32,
          offset: const Offset(0, 8),
        ),
      ];

  static List<BoxShadow> shadowBrand(Color brand, {double opacity = 0.18}) => [
        BoxShadow(
          color: brand.withOpacity(opacity),
          blurRadius: 24,
          offset: const Offset(0, 6),
        ),
      ];

  // ── Composer 高度 ─────────────────────────────────────
  static const double composerMaxHeight = 160;
  static const double composerInputHeight = 48;
}
