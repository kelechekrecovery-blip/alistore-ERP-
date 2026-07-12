plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
}

val releaseApiBaseUrl = providers.gradleProperty("ALISTORE_API_BASE_URL").orElse("").get()
val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) || it == "build" }
require(!releaseRequested || releaseApiBaseUrl.startsWith("https://")) { "Release requires -PALISTORE_API_BASE_URL=https://..." }

android {
    namespace = "kg.alistore.client"
    compileSdk = 36
    defaultConfig {
        applicationId = "kg.alistore.client"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
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

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  implementation(project(":core"))
}
