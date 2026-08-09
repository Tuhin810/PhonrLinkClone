package com.phonelinkclone

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PhoneLinkPackage : ReactPackage {

  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> =
    listOf(
      NotificationBridgeModule(reactContext),
      SecureStoreModule(reactContext),
      ClipboardModule(reactContext),
      CallStateModule(reactContext),
      FileTransferModule(reactContext),
      ScreenCaptureModule(reactContext),
    )

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
