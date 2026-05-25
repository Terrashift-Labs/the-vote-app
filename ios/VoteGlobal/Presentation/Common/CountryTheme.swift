import SwiftUI

/// Holds the government branding for the currently selected country.
/// Injected into the SwiftUI environment so any view can read it.
struct CountryTheme: EnvironmentKey {
    static let defaultValue = CountryTheme.default

    let primaryColor:         Color
    let secondaryColor:       Color
    let surfaceColor:         Color
    let onPrimaryColor:       Color
    let darkStatusBar:        Bool
    let governmentPortalName: String
    let governmentPortalURL:  URL?
    let governmentLogoAlt:    String
    let flagColors:           [Color]

    /// Default TheVoteApp brand — active before country selection.
    static let `default` = CountryTheme(
        primaryColor:         Color(hex: "#1D70B8"),
        secondaryColor:       Color(hex: "#0B0C0C"),
        surfaceColor:         Color(hex: "#F3F2F1"),
        onPrimaryColor:       .white,
        darkStatusBar:        true,
        governmentPortalName: "TheVoteApp",
        governmentPortalURL:  nil,
        governmentLogoAlt:    "TheVoteApp — democratic voting for every nation",
        flagColors:           [Color(hex: "#1D70B8"), .white]
    )

    /// Build a CountryTheme from a decoded CountryBranding model.
    static func from(_ branding: CountryBrandingModel) -> CountryTheme {
        CountryTheme(
            primaryColor:         Color(hex: branding.primaryColor),
            secondaryColor:       Color(hex: branding.secondaryColor),
            surfaceColor:         Color(hex: branding.surfaceColor),
            onPrimaryColor:       Color(hex: branding.onPrimaryColor),
            darkStatusBar:        branding.darkStatusBar,
            governmentPortalName: branding.governmentPortalName,
            governmentPortalURL:  URL(string: branding.governmentPortalURL),
            governmentLogoAlt:    branding.governmentLogoAlt,
            flagColors:           branding.flagColors.map { Color(hex: $0) }
        )
    }
}

extension EnvironmentValues {
    var countryTheme: CountryTheme {
        get { self[CountryTheme.self] }
        set { self[CountryTheme.self] = newValue }
    }
}

// MARK: - Government banner used on auth and policy screens

struct GovernmentBanner: View {
    @Environment(\.countryTheme) private var theme

    var body: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(theme.primaryColor)
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(theme.governmentPortalName)
                    .font(.caption.bold())
                    .foregroundColor(theme.primaryColor)
                if let url = theme.governmentPortalURL {
                    Text(url.host ?? "")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(theme.surfaceColor)
        .accessibilityLabel(theme.governmentLogoAlt)
    }
}

// MARK: - Color from hex string

extension Color {
    init(hex: String) {
        let stripped = hex.trimmingCharacters(in: .init(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: stripped).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >>  8) & 0xFF) / 255
        let b = Double( rgb        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - Decodable model (mirrors backend JSON schema)

struct CountryBrandingModel: Decodable {
    let primaryColor:         String
    let secondaryColor:       String
    let surfaceColor:         String
    let onPrimaryColor:       String
    let darkStatusBar:        Bool
    let governmentPortalName: String
    let governmentPortalURL:  String
    let governmentLogoAlt:    String
    let flagColors:           [String]
    let headerFontFamily:     String?
}
