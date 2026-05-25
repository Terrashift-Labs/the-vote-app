package com.TheVoteApp.presentation.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.TheVoteApp.domain.model.CountryBranding

val LocalCountryBranding = staticCompositionLocalOf<CountryBranding?> { null }

/** Default TheVoteApp palette — used before country selection. */
private val DefaultColorScheme = lightColorScheme(
    primary         = Color(0xFF1D70B8),
    onPrimary       = Color.White,
    secondary       = Color(0xFF0B0C0C),
    surface         = Color(0xFFF3F2F1),
    background      = Color(0xFFF3F2F1),
    onBackground    = Color(0xFF0B0C0C),
)

@Composable
fun TheVoteAppTheme(
    branding: CountryBranding? = null,
    content: @Composable () -> Unit
) {
    val colorScheme = branding?.let { countryColorScheme(it) } ?: DefaultColorScheme

    CompositionLocalProvider(LocalCountryBranding provides branding) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography  = Typography(),
            content     = content
        )
    }
}
