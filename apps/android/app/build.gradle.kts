plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
}

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
require(!releaseRequested || firebaseConfigured) { "Client Release requires apps/android/app/google-services.json" }
val googleWebClientId = providers.gradleProperty("GOOGLE_WEB_CLIENT_ID")
    .orElse(providers.environmentVariable("GOOGLE_WEB_CLIENT_ID"))
    .orNull
    ?.trim()
    .orEmpty()
require(!releaseRequested || googleWebClientId.isNotBlank()) {
    "Client Release requires GOOGLE_WEB_CLIENT_ID (Gradle property or environment variable)"
}
val escapedGoogleWebClientId = googleWebClientId.replace("\\", "\\\\").replace("\"", "\\\"")

android {
    namespace = "kg.alistore.client"
    compileSdk = 36
    defaultConfig {
        applicationId = "kg.alistore.client"
        minSdk = 26
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "PAYMENT_RETURN_URL", "\"alistore://payment-return\"")
        buildConfigField("boolean", "FCM_CONFIGURED", firebaseConfigured.toString())
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$escapedGoogleWebClientId\"")
    }

    buildTypes {
        release {
            buildConfigField("String", "PAYMENT_RETURN_URL", "\"https://ali.kg/payment-return\"")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = true
      aidl = false
      buildConfig = true
      shaders = false
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.biometric)
  implementation(libs.androidx.credentials)
  implementation(libs.androidx.credentials.play.services.auth)
  implementation(libs.googleid)
  implementation(platform(libs.firebase.bom))
  implementation(libs.firebase.messaging)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.rules)
  testImplementation(libs.junit)
  implementation(project(":core"))
}
