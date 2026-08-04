plugins { alias(libs.plugins.android.application); alias(libs.plugins.compose.compiler) }
// Версии, подпись, R8 и требование HTTPS для release заданы в apps/android/build.gradle.kts.
android {
  namespace = "kg.alistore.pos"
  compileSdk = 36
  defaultConfig {
    applicationId = "kg.alistore.pos"; minSdk = 26; targetSdk = 36
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
}
