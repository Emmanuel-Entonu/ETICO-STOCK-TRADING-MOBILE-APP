/* eslint-disable */
// ETICO native customizations, re-expressed as an Expo config plugin so they
// survive `expo prebuild` (the committed android/ used to rot on every SDK bump).
//
// It re-applies everything that used to live as hand edits in android/:
//   1. FLAG_SECURE + a native privacy overlay in MainActivity (screenshot block
//      + blank cover on minimize; the overlay hides the last frame on resume,
//      which FLAG_SECURE alone does not).
//   2. Theme-aware transparent system bars + dark-mode window background
//      (fixes the white nav bar in dark mode under edge-to-edge).
//   3. Release signing wired to android/keystore.properties (gitignored).
//   4. Strip sensitive permissions a dependency might pull in (Play hygiene).
//
// Values must match android.bak (the pre-migration folder) exactly.

const {
  withMainActivity,
  withAppBuildGradle,
  withAndroidManifest,
  withGradleProperties,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// ── 1. MainActivity: FLAG_SECURE + native privacy overlay ───────────────────
const OVERLAY_BLOCK = `
  // --- ETICO privacy overlay (native) -------------------------------------
  // A full-screen cover attached in onPause and removed shortly after onResume.
  // FLAG_SECURE alone does not stop Android showing the last rendered frame
  // during the resume transition; this View does.
  private var privacyOverlay: View? = null
  private val overlayHandler = Handler(Looper.getMainLooper())
  private val removeOverlayRunnable = Runnable {
    if (isFinishing || isDestroyed) return@Runnable
    privacyOverlay?.let { v ->
      (v.parent as? ViewGroup)?.removeView(v)
      privacyOverlay = null
    }
  }

  override fun onPause() {
    super.onPause()
    overlayHandler.removeCallbacks(removeOverlayRunnable)
    if (privacyOverlay == null) {
      val content = findViewById<ViewGroup>(android.R.id.content) ?: return
      val v = View(this).apply {
        setBackgroundColor(Color.parseColor("#131312"))
        elevation = 10_000f
        translationZ = 10_000f
      }
      content.addView(v, ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ))
      privacyOverlay = v
    }
  }

  override fun onResume() {
    super.onResume()
    overlayHandler.removeCallbacks(removeOverlayRunnable)
    overlayHandler.postDelayed(removeOverlayRunnable, 800)
  }

  override fun onDestroy() {
    overlayHandler.removeCallbacks(removeOverlayRunnable)
    super.onDestroy()
  }
`

const withMonetaMainActivity = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('[withEticoNative] MainActivity is not Kotlin — expected .kt')
    }
    let src = config.modResults.contents

    // Imports (idempotent).
    if (!src.includes('android.view.WindowManager')) {
      src = src.replace(
        /^(package .*\n)/m,
        `$1\nimport android.graphics.Color\nimport android.os.Handler\nimport android.os.Looper\nimport android.view.View\nimport android.view.ViewGroup\nimport android.view.WindowManager\n`,
      )
    }

    // FLAG_SECURE right after the splash setTheme(), before super.onCreate().
    if (!src.includes('FLAG_SECURE')) {
      const flag = `setTheme(R.style.AppTheme)\n    window.setFlags(\n      WindowManager.LayoutParams.FLAG_SECURE,\n      WindowManager.LayoutParams.FLAG_SECURE,\n    )`
      if (/setTheme\(R\.style\.AppTheme\);?/.test(src)) {
        src = src.replace(/setTheme\(R\.style\.AppTheme\);?/, flag)
      } else {
        throw new Error('[withEticoNative] could not find setTheme(R.style.AppTheme) anchor in MainActivity')
      }
    }

    // Overlay fields + lifecycle overrides, inserted before the final class brace.
    if (!src.includes('privacyOverlay')) {
      const lastBrace = src.lastIndexOf('}')
      if (lastBrace === -1) throw new Error('[withEticoNative] no closing brace in MainActivity')
      src = src.slice(0, lastBrace) + OVERLAY_BLOCK + '\n}' + src.slice(lastBrace + 1)
    }

    config.modResults.contents = src
    return config
  })

// ── 2. Theme: transparent system bars + dark window bg ──────────────────────
const withMonetaAndroidRes = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const res = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res')

      // styles.xml — add the 5 theme items to AppTheme (idempotent).
      const stylesPath = path.join(res, 'values', 'styles.xml')
      let styles = fs.readFileSync(stylesPath, 'utf8')
      if (!styles.includes('light_system_bars')) {
        const items =
          `    <item name="android:windowBackground">@color/windowBg</item>\n` +
          `    <item name="android:statusBarColor">@android:color/transparent</item>\n` +
          `    <item name="android:navigationBarColor">@android:color/transparent</item>\n` +
          `    <item name="android:windowLightStatusBar">@bool/light_system_bars</item>\n` +
          `    <item name="android:windowLightNavigationBar">@bool/light_system_bars</item>\n`
        const m = styles.match(/(<style name="AppTheme"[\s\S]*?)(\n\s*<\/style>)/)
        if (!m) throw new Error('[withEticoNative] AppTheme style not found in styles.xml')
        styles = styles.replace(m[0], `${m[1]}\n${items}${m[2]}`)
        fs.writeFileSync(stylesPath, styles)
      }

      // colors: windowBg light + dark.
      const setColor = (file, name, value) => {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        let c = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<resources>\n</resources>\n'
        if (c.includes(`name="${name}"`)) {
          c = c.replace(new RegExp(`(<color name="${name}">)[^<]*(</color>)`), `$1${value}$2`)
        } else {
          c = c.replace('</resources>', `  <color name="${name}">${value}</color>\n</resources>`)
        }
        fs.writeFileSync(file, c)
      }
      setColor(path.join(res, 'values', 'colors.xml'), 'windowBg', '#FDFCFA')
      setColor(path.join(res, 'values-night', 'colors.xml'), 'windowBg', '#0B0D0A')

      // bools: light_system_bars true (light) / false (dark).
      const writeBool = (file, val) => {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(
          file,
          `<resources>\n  <bool name="light_system_bars">${val}</bool>\n</resources>\n`,
        )
      }
      writeBool(path.join(res, 'values', 'bools.xml'), 'true')
      writeBool(path.join(res, 'values-night', 'bools.xml'), 'false')

      return config
    },
  ])

// ── 3. Release signing from android/keystore.properties ─────────────────────
// Release lint (lintVitalAnalyzeRelease) OOMs on react-native-screens' generated
// sources; it's not needed for our builds, so switch it off.
const withMonetaLintOff = (config) =>
  withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents
    if (!src.includes('checkReleaseBuilds false') && /\nandroid \{\n/.test(src)) {
      src = src.replace(
        /\nandroid \{\n/,
        `\nandroid {\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }\n`,
      )
    }
    config.modResults.contents = src
    return config
  })

// Bump the Gradle daemon heap/metaspace (the SDK-57 template's 2g/512m OOMs
// during release lint + codegen on this project).
const withMonetaGradleMemory = (config) =>
  withGradleProperties(config, (config) => {
    const KEY = 'org.gradle.jvmargs'
    const VALUE = '-Xmx4096m -XX:MaxMetaspaceSize=2048m'
    const existing = config.modResults.find((p) => p.type === 'property' && p.key === KEY)
    if (existing) existing.value = VALUE
    else config.modResults.push({ type: 'property', key: KEY, value: VALUE })
    return config
  })

const withMonetaSigning = (config) =>
  withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents
    if (src.includes('keystore.properties')) return config // already wired

    const loader = `
// Release signing — credentials in android/keystore.properties (gitignored).
def keystorePropsFile = rootProject.file("keystore.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}
`
    if (/\nandroid \{/.test(src)) {
      src = src.replace(/\nandroid \{/, `\n${loader}\nandroid {`)
    } else {
      throw new Error('[withEticoNative] could not find `android {` in app/build.gradle')
    }

    // Add a release signingConfig next to the debug one.
    src = src.replace(
      /(signingConfigs \{\s*debug \{[\s\S]*?\n\s*\}\n)/,
      `$1        release {\n` +
        `            if (keystorePropsFile.exists()) {\n` +
        `                storeFile file(keystoreProps['RELEASE_STORE_FILE'])\n` +
        `                storePassword keystoreProps['RELEASE_STORE_PASSWORD']\n` +
        `                keyAlias keystoreProps['RELEASE_KEY_ALIAS']\n` +
        `                keyPassword keystoreProps['RELEASE_KEY_PASSWORD']\n` +
        `            }\n` +
        `        }\n`,
    )

    // Point the release buildType at the real key when present. Target it
    // uniquely: the release buildType's `signingConfig signingConfigs.debug` is
    // the one immediately followed by `def enableShrinkResources` (the debug
    // buildType's is followed by `}`).
    if (/signingConfig signingConfigs\.debug\n\s*def enableShrinkResources/.test(src)) {
      src = src.replace(
        /signingConfig signingConfigs\.debug(\n\s*def enableShrinkResources)/,
        `signingConfig keystorePropsFile.exists() ? signingConfigs.release : signingConfigs.debug$1`,
      )
    } else {
      throw new Error('[withEticoNative] could not find release buildType signingConfig anchor')
    }

    config.modResults.contents = src
    return config
  })

// ── 4. Strip sensitive permissions a dependency might inject ────────────────
const REMOVE_PERMS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]
const withMonetaPermissionStrips = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools'
    let perms = manifest['uses-permission'] || []
    // Drop any plain (unqualified) declaration a dependency injected...
    perms = perms.filter(
      (p) => !(REMOVE_PERMS.includes(p.$ && p.$['android:name']) && !(p.$ && p.$['tools:node'] === 'remove')),
    )
    // ...then ensure a tools:node="remove" marker for each so the merger strips it.
    for (const name of REMOVE_PERMS) {
      const hasRemove = perms.some(
        (p) => p.$ && p.$['android:name'] === name && p.$['tools:node'] === 'remove',
      )
      if (!hasRemove) perms.push({ $: { 'android:name': name, 'tools:node': 'remove' } })
    }
    manifest['uses-permission'] = perms
    return config
  })

module.exports = function withEticoNative(config) {
  config = withMonetaMainActivity(config)
  config = withMonetaAndroidRes(config)
  config = withMonetaSigning(config)
  config = withMonetaLintOff(config)
  config = withMonetaGradleMemory(config)
  config = withMonetaPermissionStrips(config)
  return config
}
