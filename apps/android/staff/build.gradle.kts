plugins { alias(libs.plugins.android.application); alias(libs.plugins.compose.compiler) }
val releaseApiBaseUrl = providers.gradleProperty("ALISTORE_API_BASE_URL").orElse("").get()
val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) || it == "build" }
require(!releaseRequested || releaseApiBaseUrl.startsWith("https://")) { "Release requires -PALISTORE_API_BASE_URL=https://..." }
android {
  namespace = "kg.alistore.staff"
  compileSdk = 36
  defaultConfig {
    applicationId = "kg.alistore.staff"; minSdk = 26; targetSdk = 36; versionCode = 1; versionName = "0.1.0"
    manifestPlaceholders["usesCleartextTraffic"] = "true"
    buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api\"")
  }
  buildTypes { release { manifestPlaceholders["usesCleartextTraffic"] = "false"; buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"") } }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  buildFeatures { compose = true; buildConfig = true }
}
kotlin { jvmToolchain(17) }
dependencies { implementation(project(":core")); implementation(platform(libs.androidx.compose.bom)); implementation(libs.androidx.activity.compose) }
