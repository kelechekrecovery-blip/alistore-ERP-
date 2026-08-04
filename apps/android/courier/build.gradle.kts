plugins { alias(libs.plugins.android.application); alias(libs.plugins.compose.compiler) }
// Версии, подпись, R8 и требование HTTPS для release заданы в apps/android/build.gradle.kts.
val releaseRequested = gradle.startParameter.taskNames.any { requestedTask ->
  val normalized = requestedTask.removePrefix(":")
  val modulePrefix = "${project.path.removePrefix(":")}:"
  val taskName = normalized.substringAfterLast(":")
  (normalized.startsWith(modulePrefix) || !normalized.contains(":")) &&
    (taskName.contains("release", ignoreCase = true) || taskName == "build")
}
val firebaseConfigured = file("google-services.json").isFile
if (firebaseConfigured) apply(plugin = "com.google.gms.google-services")
require(!releaseRequested || firebaseConfigured) { "Courier Release requires apps/android/courier/google-services.json" }
android {
  namespace = "kg.alistore.courier"
  compileSdk = 36
  defaultConfig {
    applicationId = "kg.alistore.courier"; minSdk = 26; targetSdk = 36
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    buildConfigField("boolean", "FCM_CONFIGURED", firebaseConfigured.toString())
  }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  buildFeatures { compose = true; buildConfig = true }
}
kotlin { jvmToolchain(17) }
dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(project(":core"))
  implementation(composeBom)
  androidTestImplementation(composeBom)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.biometric)
  implementation(libs.androidx.core.ktx)
  implementation(libs.kotlinx.coroutines.android)
  implementation(platform(libs.firebase.bom))
  implementation(libs.firebase.messaging)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.rules)
}
