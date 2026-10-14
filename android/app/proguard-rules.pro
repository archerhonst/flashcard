# 纯 WebView 壳，没有反射/序列化，无需额外 keep 规则。
# 如果以后把 isMinifyEnabled 打开，保留 JS 桥方法名：
-keepclassmembers class com.example.flashcards.MainActivity$NativeBridge {
    public *;
}
