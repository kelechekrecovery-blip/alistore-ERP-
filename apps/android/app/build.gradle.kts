plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
}

val releaseApiBaseUrl = providers.gradleProperty("ALISTORE_API_BASE_URL").orElse("").get()
val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) || it == "build" }
val firebaseConfigured = file("google-services.json").isFile
if (firebaseConfigured) apply(plugin = "com.google.gms.google-services")
require(!releaseRequested || releaseApiBaseUrl.startsWith("https://")) { "Release requires -PALISTORE_API_BASE_URL=https://..." }
require(!releaseRequested || firebaseConfigured) { "Client Release requires apps/android/app/google-services.json" }

android {
    namespace = "kg.alistore.client"
    compileSdk = 36
    defaultConfig {
        applicationId = "kg.alistore.client"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api\"")
        buildConfigField("String", "PAYMENT_RETURN_URL", "\"alistore://payment-return\"")
        buildConfigField("boolean", "FCM_CONFIGURED", firebaseConfigured.toString())
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
            buildConfigField("String", "PAYMENT_RETURN_URL", "\"https://alistore.kg/payment-return\"")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
  implementation(project(":core"))
}
