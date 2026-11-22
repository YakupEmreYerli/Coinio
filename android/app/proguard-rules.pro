# kotlinx.serialization keeps its generated serializers through its own rules; keep our payload classes' names readable in crash logs.
-keepattributes *Annotation*, InnerClasses
# Please add these rules to your existing keep rules in order to suppress warnings.
# This is generated automatically by the Android Gradle plugin.
-dontwarn com.google.errorprone.annotations.Immutable