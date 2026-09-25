package ng.moneta.capital

import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme)
    // Screenshots are allowed (FLAG_SECURE removed). Privacy when minimised is
    // kept without blocking screenshots: on Android 13+ the recents/app-switcher
    // preview is suppressed, and on every version the native cover below is
    // drawn in onPause.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      setRecentsScreenshotEnabled(false)
    }
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }

  // --- ETICO privacy overlay (native) -------------------------------------
  // A full-screen cover attached in onPause and removed shortly after onResume.
  // The recents flag alone does not stop Android showing the last rendered frame
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

}
