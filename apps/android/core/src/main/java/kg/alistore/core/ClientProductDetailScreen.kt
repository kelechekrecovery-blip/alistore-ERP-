package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val DetailInk = Design3.screen
private val DetailSurface = Design3.surface
private val DetailMuted = Design3.textMuted
private val DetailCoral = Design3.orange
private val DetailLime = Design3.lime

@Composable
internal fun ClientProductDetailScreen(
  productId: String,
  initialProduct: Product?,
  apiBaseUrl: String,
  favorite: Boolean,
  inCart: Boolean,
  onFavorite: (String) -> Unit,
  onCart: (String) -> Unit,
  onBack: () -> Unit,
  onOpenProduct: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  var detail by remember(productId, initialProduct) {
    mutableStateOf(initialProduct?.let { CatalogProductDetail(it) })
  }
  var loading by remember(productId) { mutableStateOf(true) }
  var error by remember(productId) { mutableStateOf<String?>(null) }

  LaunchedEffect(productId, apiBaseUrl) {
    loading = true
    runCatching { ApiClient(apiBaseUrl).catalogProduct(productId) }
      .onSuccess { detail = it; error = null }
      .onFailure { error = it.message ?: "Не удалось загрузить товар" }
    loading = false
  }

  val current = detail
  when {
    loading && current == null -> ClientProductDetailMessage("Загружаем товар…", null, modifier)
    current == null -> ClientProductDetailMessage("Товар недоступен", error, modifier, onBack)
    else -> ClientProductDetailContent(
      detail = current,
      favorite = favorite,
      inCart = inCart,
      onFavorite = onFavorite,
      onCart = onCart,
      onBack = onBack,
      onOpenProduct = onOpenProduct,
      modifier = modifier,
      staleError = error,
      apiBaseUrl = apiBaseUrl,
    )
  }
}

@Composable
internal fun ClientProductDetailContent(
  detail: CatalogProductDetail,
  favorite: Boolean,
  inCart: Boolean,
  onFavorite: (String) -> Unit,
  onCart: (String) -> Unit,
  onBack: () -> Unit,
  onOpenProduct: (String) -> Unit,
  modifier: Modifier = Modifier,
  staleError: String? = null,
  apiBaseUrl: String = "",
) {
  val product = detail.product
  LazyColumn(
    modifier.fillMaxSize().background(DetailInk),
    contentPadding = PaddingValues(bottom = 28.dp),
  ) {
    item {
      Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack, modifier = Modifier.testTag("product-detail-back")) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад", tint = Color.White)
        }
        Text("Товар", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
      }
    }
    item {
      Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).aspectRatio(1.05f)) {
        ProductMediaImage(product, apiBaseUrl, Modifier.fillMaxSize(), 0.dp)
        IconButton(onClick = { onFavorite(product.id) }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).background(Color.White, androidx.compose.foundation.shape.CircleShape)) {
          Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, contentDescription = "Избранное", tint = if (favorite) DetailCoral else DetailInk)
        }
      }
    }
    item {
      Column(Modifier.padding(horizontal = 18.dp, vertical = 18.dp)) {
        Text(product.category, color = DetailLime, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Text(product.name, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 6.dp).testTag("product-detail-title"))
        Text(product.sku, color = DetailMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
        Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
          Text("${product.price} сом", color = DetailLime, fontSize = 24.sp, fontWeight = FontWeight.Black)
          Text(if (product.availableUnits > 0) "В наличии · ${product.availableUnits}" else "Нет в наличии", color = if (product.availableUnits > 0) DetailLime else DetailCoral, fontSize = 12.sp)
        }
        if (staleError != null) Text("Показаны сохранённые данные · $staleError", color = DetailMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp))
        Button(
          onClick = { onCart(product.id) },
          enabled = product.availableUnits > 0 && !inCart,
          modifier = Modifier.fillMaxWidth().padding(top = 16.dp).testTag("product-detail-cart"),
          colors = ButtonDefaults.buttonColors(containerColor = if (inCart) DetailSurface else DetailLime, contentColor = if (inCart) Color.White else DetailInk),
        ) { Text(if (inCart) "В корзине" else "Добавить в корзину", fontWeight = FontWeight.Bold) }
      }
    }
    if (detail.variants.isNotEmpty()) {
      item {
        Column(Modifier.padding(horizontal = 18.dp)) {
          Text("Варианты", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
          Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            detail.variants.forEach { variant ->
              OutlinedButton(onClick = { onOpenProduct(variant.id) }, modifier = Modifier.testTag("product-variant-${variant.id}")) { Text(variant.name, maxLines = 1, fontSize = 11.sp) }
            }
          }
        }
      }
    }
    item {
      Column(Modifier.padding(horizontal = 18.dp, vertical = 20.dp)) {
        Text("Доставка и гарантия", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text("Самовывоз из магазина или доставка курьером. Гарантия AliStore действует с момента покупки.", color = DetailMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
      }
    }
    if (detail.related.isNotEmpty()) {
      item { Text("Похожие товары", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 18.dp, vertical = 4.dp)) }
      items(detail.related, key = Product::id) { related ->
        Row(
          Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 5.dp).background(DetailSurface, androidx.compose.foundation.shape.RoundedCornerShape(8.dp)).clickable { onOpenProduct(related.id) }.padding(12.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Box(Modifier.size(52.dp).background(Color(0xFFF2EFEB), androidx.compose.foundation.shape.RoundedCornerShape(6.dp)))
          Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(related.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
            Text("${related.price} сом", color = DetailLime, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
          }
        }
      }
    }
  }
}

@Composable
private fun ClientProductDetailMessage(title: String, detail: String?, modifier: Modifier = Modifier, onBack: (() -> Unit)? = null) {
  Column(modifier.fillMaxSize().background(DetailInk).padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(title, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    if (!detail.isNullOrBlank()) Text(detail, color = DetailMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
    if (onBack != null) OutlinedButton(onClick = onBack, modifier = Modifier.padding(top = 16.dp)) { Text("Назад") }
  }
}
