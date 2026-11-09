package com.sandwichsudokupuzzle.app

import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.*
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.modules.core.DeviceEventManagerModule

class RemoveAdsBillingPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RemoveAdsBillingModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class RemoveAdsBillingModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val productId = "remove_ads"
  private val prefs = context.getSharedPreferences("play_entitlements", 0)
  private val handler = Handler(Looper.getMainLooper())
  private var buying: Promise? = null
  private var connecting = false
  private val waiting = mutableListOf<Pair<Promise, () -> Unit>>()
  private val client: BillingClient = BillingClient.newBuilder(context)
    .setListener { result, purchases -> UiThreadUtil.runOnUiThread {
      val promise = buying; buying = null
      when (result.responseCode) {
        BillingClient.BillingResponseCode.OK -> {
          val owned = purchases.orEmpty().firstOrNull { productId in it.products && it.purchaseState == Purchase.PurchaseState.PURCHASED }
          if (owned != null) acknowledge(owned, promise)
          else promise?.resolve(state("pending"))
        }
        BillingClient.BillingResponseCode.USER_CANCELED -> promise?.resolve(state("cancelled"))
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> { if (promise != null) restore(promise) }
        else -> if (promise != null) fail(promise, result)
      }
      notifyChanged()
    } }
    .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
    .enableAutoServiceReconnection().build()

  override fun getName() = "RemoveAdsBilling"
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
  private fun state(status: String) = Arguments.createMap().apply {
    putBoolean("owned", prefs.getBoolean("remove_ads", false)); putString("status", status)
  }
  private fun notifyChanged() {
    if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("RemoveAdsUpdated", null)
  }
  @ReactMethod fun cached(promise: Promise) { promise.resolve(state("cached")) }
  private fun fail(promise: Promise, result: BillingResult) {
    promise.reject("PLAY_${result.responseCode}", when (result.responseCode) {
      BillingClient.BillingResponseCode.BILLING_UNAVAILABLE -> "Google Play purchases are unavailable. Sign in to the Play Store and try again."
      BillingClient.BillingResponseCode.ITEM_UNAVAILABLE -> "Remove ads is not available for this Play account yet. Install the internal test version from Google Play."
      else -> "Google Play could not complete the request. Please try again."
    })
  }
  private fun connected(promise: Promise, action: () -> Unit) { UiThreadUtil.runOnUiThread {
    if (client.isReady) action() else {
      val task = promise to action; waiting.add(task)
      handler.postDelayed({ if (waiting.remove(task)) promise.reject("PLAY_TIMEOUT", "Google Play took too long to connect. Please try again.") }, 15000)
      if (!connecting) {
        connecting = true
        client.startConnection(object : BillingClientStateListener {
          override fun onBillingSetupFinished(result: BillingResult) { UiThreadUtil.runOnUiThread {
            connecting = false
            val tasks = waiting.toList(); waiting.clear()
            tasks.forEach { (pending, action) -> if (result.responseCode == BillingClient.BillingResponseCode.OK) action() else fail(pending, result) }
          } }
          override fun onBillingServiceDisconnected() { connecting = false }
        })
      }
    }
  } }
  private fun params() = QueryProductDetailsParams.newBuilder().setProductList(listOf(
    QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build()
  )).build()
  private fun offer(product: ProductDetails): ProductDetails.OneTimePurchaseOfferDetails? {
    val ordinary = product.oneTimePurchaseOfferDetailsList.orEmpty().ifEmpty { listOfNotNull(product.oneTimePurchaseOfferDetails) }.filter {
      it.offerId.isNullOrEmpty() && it.rentalDetails == null && it.preorderDetails == null && it.limitedQuantityInfo == null
    }
    return ordinary.firstOrNull { it.purchaseOptionId == "buy" } ?: ordinary.firstOrNull()
  }
  @ReactMethod fun product(promise: Promise) = connected(promise) {
    client.queryProductDetailsAsync(params()) { result, details ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) fail(promise, result)
      else {
        val price = details.productDetailsList.firstOrNull { it.productId == productId }?.let { offer(it) }
        promise.resolve(if (price == null) null else Arguments.createMap().apply { putString("price", price.formattedPrice) })
      }
    }
  }
  private fun acknowledge(purchase: Purchase, promise: Promise?) {
    val grant: () -> Unit = {
      // This product is permanent: acknowledge it, never consume it.
      val changed = !prefs.getBoolean("remove_ads", false)
      prefs.edit().putBoolean("remove_ads", true).commit()
      promise?.resolve(state("purchased")); if (changed) notifyChanged()
    }
    if (purchase.isAcknowledged) grant() else client.acknowledgePurchase(
      AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
    ) { result -> if (result.responseCode == BillingClient.BillingResponseCode.OK) grant() else if (promise != null) fail(promise, result) }
  }
  @ReactMethod fun restore(promise: Promise) = connected(promise) {
    client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()) { result, purchases ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) fail(promise, result)
      else {
        val purchase = purchases.firstOrNull { productId in it.products && it.purchaseState == Purchase.PurchaseState.PURCHASED }
        if (purchase != null) acknowledge(purchase, promise) else {
          prefs.edit().putBoolean("remove_ads", false).commit()
          promise.resolve(state(if (purchases.any { productId in it.products && it.purchaseState == Purchase.PurchaseState.PENDING }) "pending" else "not_owned"))
        }
      }
    }
  }
  @ReactMethod fun buy(promise: Promise) = connected(promise) {
    if (buying != null) { promise.reject("BUSY", "A purchase is already in progress."); return@connected }
    buying = promise
    val timeout = Runnable { if (buying === promise) { buying = null; promise.reject("PLAY_TIMEOUT", "Google Play took too long to load the product. Please try again.") } }
    handler.postDelayed(timeout, 15000)
    client.queryProductDetailsAsync(params()) { result, details -> UiThreadUtil.runOnUiThread {
      if (buying !== promise) return@runOnUiThread
      handler.removeCallbacks(timeout)
      if (result.responseCode != BillingClient.BillingResponseCode.OK) { buying = null; fail(promise, result); return@runOnUiThread }
      val product = details.productDetailsList.firstOrNull { it.productId == productId }
      val selected = product?.let { offer(it) }
      val activity = context.currentActivity
      if (product == null || selected == null || activity == null) {
        buying = null; promise.reject("UNAVAILABLE", "Remove ads is not available yet. Install the game from the Google Play internal testing link and try again."); return@runOnUiThread
      }
      val item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).apply { selected.offerToken?.let { setOfferToken(it) } }.build()
      val launched = client.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(item)).build())
      if (launched.responseCode != BillingClient.BillingResponseCode.OK) { buying = null; fail(promise, launched) }
    } }
  }
  override fun invalidate() {
    buying?.reject("CLOSED", "Purchase interrupted. Restore purchases when you reopen the game."); buying = null
    waiting.forEach { it.first.reject("CLOSED", "Store closed.") }; waiting.clear()
    client.endConnection(); super.invalidate()
  }
}
