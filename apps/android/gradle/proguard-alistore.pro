# Общие R8-правила для всех четырёх релизных APK AliStore.
# Подключается из apps/android/build.gradle.kts вместе с модульным proguard-rules.pro.

# --- Стандартный Android-базис (аналог proguard-android-optimize.txt) --------
-dontusemixedcaseclassnames
-verbose
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

-keepclassmembers class **.R$* {
    public static <fields>;
}

# View-биндинги из XML-атрибутов и android:onClick.
-keepclassmembers class * extends android.view.View {
    void set*(***);
    *** get*();
}
-keepclassmembers class * extends android.content.Context {
    public void *(android.view.View);
    public void *(android.view.MenuItem);
}

# --- Kotlin -----------------------------------------------------------------
-keepclassmembers class kotlin.Metadata { public <methods>; }
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }

# --- WorkManager: воркеры инстанцируются рефлексией --------------------------
-keep class * extends androidx.work.ListenableWorker { public <init>(...); }
-keep class * extends androidx.work.Worker { public <init>(...); }

# --- Firebase Cloud Messaging ----------------------------------------------
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }
-dontwarn com.google.firebase.**

# --- ML Kit / CameraX -------------------------------------------------------
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-dontwarn com.google.mlkit.**
-dontwarn androidx.camera.**

# --- org.json (offline queue / API-парсинг в :core) -------------------------
-dontwarn org.json.**

# --- androidx.window ---------------------------------------------------------
# Расширения оконного менеджера подгружаются рефлексией только на устройствах,
# где вендор их поставляет; в APK этих классов нет и быть не должно.
-dontwarn androidx.window.extensions.**
-dontwarn androidx.window.sidecar.**

# --- Compose ----------------------------------------------------------------
# Compose-рантайм поставляет свои consumer-правила; здесь только страховка
# от предупреждений по отсутствующим desktop-классам.
-dontwarn androidx.compose.**
