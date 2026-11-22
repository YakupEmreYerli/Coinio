package me.getcoinio.widget.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Brand = Color(0xFF4F5BD5)

@Composable
fun CoinioTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) {
        darkColorScheme(primary = Color(0xFF9EA3FF), onPrimary = Color(0xFF14152A), background = Color(0xFF0E0F17), surface = Color(0xFF1C1C1E), error = Color(0xFFFF6369))
    } else {
        lightColorScheme(primary = Brand, onPrimary = Color.White, background = Color(0xFFF6F7FB), surface = Color.White, error = Color(0xFFE5484D))
    }
    MaterialTheme(colorScheme = colors, content = content)
}
