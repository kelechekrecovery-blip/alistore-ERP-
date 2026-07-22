import SwiftUI
import CoreText

/// AliStore 3.0 design tokens — dark liquid-glass.
///
/// Source of truth: the "Клиент App 3.0" deck
/// (`~/Desktop/AliStore интернет магазин архитектура/AliStore Клиент App 3.0.dc.html`)
/// + Native Design System §1. 3.0 flips the 2.0 lime-primary to **orange**, moves headings to
/// **Manrope**, and applies liquid glass to nearly every surface.
///
/// Lives in the `AliStoreCore` framework so every split Client screen can `import AliStoreCore`
/// and reference one token set. Font *files* are bundled in the Client target; iOS font
/// registration is process-global, so `Font.custom` here resolves against them at runtime.
public enum Design3 {

    // MARK: - Brand accents
    public static let orange = hex(0xFF5B2E)         // primary — CTAs, active, accents
    public static let orangePressed = hex(0xE8410F)  // pressed / price-deep
    public static let orangeSoft = hex(0xFF7A4D)     // lighter coral for gradients/glows
    public static let lime = hex(0xC6FF3D)           // money / success micro-accent ONLY (was 2.0 primary)
    public static let gold = hex(0xE5B23C)           // rating, GOLD tier, warranty warning
    public static let blue = hex(0x7FB0EC)           // Face ID / sync / links
    public static let success = hex(0x4ED17A)        // online / delivered
    public static let successSoft = hex(0x7EE6A0)
    public static let danger = hex(0xFF8A7A)         // logout / cancel / expired

    // MARK: - Surfaces (dark)
    public static let frame = hex(0x181410)          // device frame
    public static let screen = hex(0x201B17)         // screen background
    public static let surface = hex(0x2A231D)        // solid card / selected
    public static let surfaceRaised = hex(0x3A322B)  // steppers / controls
    public static let hairline = hex(0x463C31)       // borders on solid

    // MARK: - Text ramp
    public static let textPrimary = Color.white
    public static let textBright = hex(0xD8CFC6)
    public static let textMuted = hex(0xA79C92)
    public static let textSubtle = hex(0x8A7F76)
    public static let textFaint = hex(0x6E645C)      // placeholder

    // MARK: - Glass (liquid-glass surfaces)
    /// Base translucent material — pair with `glassTint`/`hairlineGlass` for the deck look.
    public static var glass: Material { .ultraThinMaterial }
    public static var glassStrong: Material { .regularMaterial }
    /// Warm tint overlaid on the material so dark glass reads on-brand.
    public static let glassTint = Color.white.opacity(0.05)
    public static let glassTintStrong = Color.white.opacity(0.08)
    public static let hairlineGlass = Color.white.opacity(0.12)
    /// Coral glow used behind heroes / on-screen radial light.
    public static let glow = Color(red: 1, green: 0.357, blue: 0.18).opacity(0.14)

    // MARK: - Radii
    public enum Radius {
        public static let card: CGFloat = 16
        public static let hero: CGFloat = 22
        public static let button: CGFloat = 12
        public static let chip: CGFloat = 9
        public static let pill: CGFloat = 999
    }

    // MARK: - Spacing (4pt grid)
    public enum Space {
        public static let xs: CGFloat = 4
        public static let s: CGFloat = 8
        public static let m: CGFloat = 12
        public static let l: CGFloat = 16
        public static let xl: CGFloat = 20
        public static let xxl: CGFloat = 24
    }

    // MARK: - Typography
    // Manrope = headings/prices · Golos Text = body/UI · JetBrains Mono = numbers/SKU/IMEI/codes.
    // Uses PostScript names; if a face is not registered, `Font.custom` falls back to the system font.
    //
    // `relativeTo:` подключает Dynamic Type: кастомные шрифты через
    // `.custom(_:size:)` были фиксированного размера и не реагировали на
    // системную настройку размера текста. Базовый размер остаётся `size`,
    // меняется только реакция на настройку доступности. Рост ограничен на корне
    // приложений (`dynamicTypeSize`), чтобы плотная вёрстка не ломалась на AX5.
    public static func heading(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .custom("Manrope-\(styleName(weight))", size: size, relativeTo: .body)
    }
    public static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom("GolosText-\(styleName(weight))", size: size, relativeTo: .body)
    }
    public static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .custom("JetBrainsMono-\(styleName(weight))", size: size, relativeTo: .body)
    }

    private static func styleName(_ weight: Font.Weight) -> String {
        switch weight {
        case .medium: return "Medium"
        case .semibold: return "SemiBold"
        case .bold: return "Bold"
        case .heavy, .black: return "ExtraBold"
        default: return "Regular"
        }
    }

    // MARK: - Font registration
    /// Fallback registration if `UIAppFonts` (project.yml) misses a file. Safe to call once at launch.
    public static func registerFonts() {
        guard let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) else { return }
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    // MARK: - Helpers
    private static func hex(_ value: UInt32) -> Color {
        Color(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }
}
