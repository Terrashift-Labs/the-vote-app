package com.TheVoteApp.presentation.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import com.TheVoteApp.domain.model.CountryBranding

/**
 * Derives a Material 3 [ColorScheme] from a country's government branding.
 *
 * All countries ship with a default scheme; this override applies when a
 * citizen is authenticated to a specific country.
 */
fun countryColorScheme(branding: CountryBranding): ColorScheme {
    val primary       = Color(android.graphics.Color.parseColor(branding.primaryColor))
    val secondary     = Color(android.graphics.Color.parseColor(branding.secondaryColor))
    val surface       = Color(android.graphics.Color.parseColor(branding.surfaceColor))
    val onPrimary     = Color(android.graphics.Color.parseColor(branding.onPrimaryColor))

    return if (branding.darkStatusBar) {
        lightColorScheme(
            primary         = primary,
            secondary       = secondary,
            surface         = surface,
            onPrimary       = onPrimary,
            onSecondary     = Color.White,
            background      = surface,
            onBackground    = Color(0xFF1C1B1F),
        )
    } else {
        darkColorScheme(
            primary     = primary,
            secondary   = secondary,
            surface     = Color(0xFF1C1B1F),
            onPrimary   = onPrimary,
        )
    }
}
