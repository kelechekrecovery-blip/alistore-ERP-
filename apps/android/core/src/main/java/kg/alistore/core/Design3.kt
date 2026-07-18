package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Shared AliStore 3.0 tokens. Keep this in sync with the latest native handoff. */
object Design3 {
  val frame = Color(0xFF181410)
  val screen = Color(0xFF201B17)
  val surface = Color(0xFF2A231D)
  val surfaceRaised = Color(0xFF3A322B)
  val hairline = Color(0xFF463C31)

  val orange = Color(0xFFFF5B2E)
  val orangePressed = Color(0xFFE8410F)
  val orangeSoft = Color(0xFFFF7A4D)
  val lime = Color(0xFFC6FF3D)
  val gold = Color(0xFFE5B23C)
  val blue = Color(0xFF7FB0EC)
  val success = Color(0xFF4ED17A)
  val danger = Color(0xFFFF8A7A)

  val textPrimary = Color.White
  val textBright = Color(0xFFD8CFC6)
  val textMuted = Color(0xFFA79C92)
  val textSubtle = Color(0xFF8A7F76)

  val colors = darkColorScheme(
    primary = orange,
    onPrimary = Color.White,
    secondary = lime,
    onSecondary = Color(0xFF14110E),
    tertiary = blue,
    background = screen,
    onBackground = textBright,
    surface = surface,
    onSurface = textBright,
    surfaceVariant = surfaceRaised,
    onSurfaceVariant = textMuted,
    outline = hairline,
    error = danger,
  )

  private val baseTypography = Typography()
  val typography = Typography(
    headlineLarge = baseTypography.headlineLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Black),
    headlineMedium = baseTypography.headlineMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.ExtraBold),
    titleLarge = baseTypography.titleLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold),
    bodyLarge = baseTypography.bodyLarge.copy(fontFamily = FontFamily.SansSerif, fontSize = 15.sp),
    bodyMedium = baseTypography.bodyMedium.copy(fontFamily = FontFamily.SansSerif, fontSize = 13.sp),
    labelMedium = baseTypography.labelMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold),
  )
}

@Composable
fun Design3Theme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = Design3.colors, typography = Design3.typography, content = content)
}
