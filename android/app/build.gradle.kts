plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "me.getcoinio.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "me.getcoinio.widget"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("COINIO_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("COINIO_VERSION") ?: "0.0.0-dev"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.activity.compose)
    implementation(libs.glance.appwidget)
    implementation(libs.glance.material3)
    implementation(libs.work.runtime)
    implementation(libs.security.crypto)
    implementation(libs.zxing.embedded)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
}
