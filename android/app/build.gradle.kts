import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ============================================================
// 把上层目录（闪卡工具/）的网页文件同步进 APK 的 assets
// 你只需要改 web 代码，构建时自动带进包里，不用手动复制。
// ============================================================
val webRoot: File = rootProject.projectDir.parentFile!!
val generatedAssets = layout.buildDirectory.dir("generated/webassets")

val syncWebAssets by tasks.registering(Sync::class) {
    description = "把 web 源码同步进 APK assets"
    group = "build"
    // 只搬运行时真正需要的文件，跳过 android/ 自身和 md 文档
    from(webRoot) {
        include("index.html")
        include("app.css")
        include("js/**")
        include("plugins/**")
    }
    into(generatedAssets.map { it.dir("www") })
    doFirst {
        require(File(webRoot, "index.html").exists()) {
            "找不到 ${webRoot}/index.html —— android/ 目录必须放在闪卡工具/ 下面"
        }
        logger.lifecycle("同步 web 资源：$webRoot  ->  ${generatedAssets.get().asFile}/www")
    }
}

android {
    namespace = "com.example.flashcards"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.flashcards"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    // 签名配置：如果你有 keystore，把 keystore.properties 放在 android/ 下
    //   storeFile=../my.jks
    //   storePassword=...
    //   keyAlias=...
    //   keyPassword=...
    // 没放就只产出 debug 可直接安装的包。
    val keystoreProps = File(rootProject.projectDir, "keystore.properties")
    if (keystoreProps.exists()) {
        val props = Properties().apply { keystoreProps.inputStream().use { load(it) } }
        signingConfigs {
            create("release") {
                storeFile = file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
        buildTypes.named("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false // 纯 WebView 壳，没必要混淆
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // MainActivity 里用 BuildConfig.DEBUG 决定要不要打开 WebView 远程调试，
    // 显式打开，免得依赖 AGP 的默认值。
    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // 网页资源是构建产物，不在 src/main/assets 下
    sourceSets["main"].assets.srcDir(generatedAssets)

    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }
}

// 任何打包动作之前先把 web 文件同步好
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(syncWebAssets)
}
tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.webkit:webkit:1.10.0")   // WebViewAssetLoader
}
