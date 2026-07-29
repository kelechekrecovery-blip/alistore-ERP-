import com.android.build.api.dsl.ApplicationExtension

// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
  alias(libs.plugins.android.application) apply false
  alias(libs.plugins.android.library) apply false
  alias(libs.plugins.compose.compiler) apply false
  alias(libs.plugins.kotlin.serialization) apply false
  alias(libs.plugins.google.services) apply false
}

// ---------------------------------------------------------------------------
// Единая релизная конвенция для :app, :staff, :courier, :pos.
// Модули не дублируют версии, подпись, R8 и проверку HTTPS — всё живёт здесь.
// ---------------------------------------------------------------------------

/** Общий маркетинговый номер — совпадает с iOS (1.0.0). */
val alistoreVersionName = "1.0.0"

/** Свойство Gradle или переменная окружения; пустая строка считается отсутствием. */
fun buildInput(name: String): String? =
  providers.gradleProperty(name).orElse(providers.environmentVariable(name)).orNull
    ?.trim()
    ?.takeIf { it.isNotEmpty() }

/** Единый счётчик сборок для всех четырёх APK: `-PALISTORE_VERSION_CODE=42`. */
val alistoreVersionCode = (buildInput("ALISTORE_VERSION_CODE") ?: "1").toIntOrNull()
  ?: throw GradleException("ALISTORE_VERSION_CODE должен быть целым числом")

val releaseRequested = gradle.startParameter.taskNames.any {
  it.contains("release", ignoreCase = true) || it == "build" || it.endsWith(":build")
}

val alistoreApiBaseUrl = buildInput("ALISTORE_API_BASE_URL") ?: ""

val keystorePath = buildInput("ALISTORE_KEYSTORE_FILE")
val keystorePassword = buildInput("ALISTORE_KEYSTORE_PASSWORD")
val releaseKeyAlias = buildInput("ALISTORE_KEY_ALIAS")
val releaseKeyPassword = buildInput("ALISTORE_KEY_PASSWORD")
val keystoreFile = keystorePath?.let { rootProject.file(it) }
val signingReady = keystoreFile != null &&
  keystorePassword != null &&
  releaseKeyAlias != null &&
  releaseKeyPassword != null

if (releaseRequested) {
  require(alistoreApiBaseUrl.startsWith("https://")) {
    "Release требует -PALISTORE_API_BASE_URL=https://ali.kg/api " +
      "(или переменную окружения ALISTORE_API_BASE_URL)"
  }
  require(signingReady) {
    """
    |Release требует релизный keystore. Задай четыре свойства Gradle (-P...) или переменные окружения:
    |  ALISTORE_KEYSTORE_FILE      — путь к .jks (абсолютный или относительно apps/android)
    |  ALISTORE_KEYSTORE_PASSWORD  — пароль хранилища
    |  ALISTORE_KEY_ALIAS          — алиас ключа
    |  ALISTORE_KEY_PASSWORD       — пароль ключа
    |Держи их в ~/.gradle/gradle.properties или в секретах CI.
    |Keystore и пароли в репозиторий не коммитятся.
    """.trimMargin()
  }
  require(keystoreFile!!.isFile) {
    "ALISTORE_KEYSTORE_FILE указывает на ${keystoreFile.absolutePath} — файла нет"
  }
}

val sharedProguardFile = rootProject.file("gradle/proguard-alistore.pro")

subprojects {
  val module = this
  plugins.withId("com.android.application") {
    module.extensions.configure<ApplicationExtension> {
      defaultConfig {
        versionCode = alistoreVersionCode
        versionName = alistoreVersionName
        // Debug смотрит на эмуляторный loopback и разрешает cleartext.
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api\"")
      }

      if (signingReady) {
        signingConfigs.create("release") {
          storeFile = keystoreFile
          storePassword = keystorePassword
          keyAlias = releaseKeyAlias
          keyPassword = releaseKeyPassword
          // minSdk 26 => v1 не нужен; v3 оставляет возможность ротации ключа.
          enableV1Signing = false
          enableV2Signing = true
          enableV3Signing = true
        }
      }

      buildTypes.getByName("release") {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        buildConfigField("String", "API_BASE_URL", "\"$alistoreApiBaseUrl\"")
        isMinifyEnabled = true
        isShrinkResources = true
        signingConfig = if (signingReady) signingConfigs.getByName("release") else null
        proguardFiles(sharedProguardFile, module.file("proguard-rules.pro"))
      }
    }
  }
}
