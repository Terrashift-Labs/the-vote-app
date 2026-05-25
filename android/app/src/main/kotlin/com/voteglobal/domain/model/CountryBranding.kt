package com.TheVoteApp.domain.model

/**
 * Government branding for a country — drives dynamic theming in the app.
 * All colour fields are hex strings ("#RRGGBB").
 */
data class CountryBranding(
    val primaryColor:         String,
    val secondaryColor:       String,
    val surfaceColor:         String,
    val onPrimaryColor:       String,
    val darkStatusBar:        Boolean,
    val governmentPortalName: String,
    val governmentPortalURL:  String,
    val governmentLogoAlt:    String,
    val flagColors:           List<String>,
    val headerFontFamily:     String? = null
)

data class CountryProfile(
    val code:           String,
    val name:           String,
    val nativeName:     String,
    val language:       String,
    val languages:      List<String>,
    val rtl:            Boolean,
    val identityScheme: String,
    val flagEmoji:      String,
    val region:         String,
    val branding:       CountryBranding,
    val policies:       List<Policy>
)
