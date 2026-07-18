package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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

internal enum class CatalogSort { DEFAULT, PRICE_ASCENDING, PRICE_DESCENDING }

internal data class CatalogFilter(
  val query: String = "",
  val category: String? = null,
  val inStockOnly: Boolean = false,
  val sort: CatalogSort = CatalogSort.DEFAULT,
)

internal fun filterCatalog(products: List<Product>, filter: CatalogFilter): List<Product> {
  val query = filter.query.trim()
  val filtered = products.filter { product ->
    (filter.category == null || product.category.equals(filter.category, ignoreCase = true)) &&
      (!filter.inStockOnly || product.availableUnits > 0) &&
      (query.isEmpty() || product.name.contains(query, ignoreCase = true) ||
        product.sku.contains(query, ignoreCase = true) || product.category.contains(query, ignoreCase = true))
  }
  return when (filter.sort) {
    CatalogSort.DEFAULT -> filtered
    CatalogSort.PRICE_ASCENDING -> filtered.sortedBy(Product::price)
    CatalogSort.PRICE_DESCENDING -> filtered.sortedByDescending(Product::price)
  }
}

private val CatalogInk = Color(0xFF201B17)
private val CatalogSurface = Color(0xFF2A231D)
private val CatalogLine = Color(0xFF463C31)
private val CatalogMuted = Color(0xFFA79C92)
private val CatalogLime = Color(0xFFC6FF3D)

@Composable
internal fun ClientCatalogScreen(
  products: List<Product>,
  favorites: Set<String>,
  cart: Set<String>,
  onFavorite: (String) -> Unit,
  onCart: (String) -> Unit,
  onOpenProduct: (String) -> Unit = {},
  modifier: Modifier = Modifier,
  apiBaseUrl: String = "",
) {
  var filter by remember { mutableStateOf(CatalogFilter()) }
  val categories = remember(products) { products.map(Product::category).filter(String::isNotBlank).distinct() }
  val visibleProducts = remember(products, filter) { filterCatalog(products, filter) }

  Column(modifier.fillMaxSize().background(CatalogInk)) {
    OutlinedTextField(
      value = filter.query,
      onValueChange = { filter = filter.copy(query = it.take(80)) },
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp).testTag("catalog-search"),
      placeholder = { Text("Поиск техники, брендов…") },
      leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
      singleLine = true,
      colors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        focusedBorderColor = CatalogLime,
        unfocusedBorderColor = CatalogLine,
        focusedLeadingIconColor = CatalogLime,
        unfocusedLeadingIconColor = CatalogMuted,
        focusedPlaceholderColor = CatalogMuted,
        unfocusedPlaceholderColor = CatalogMuted,
      ),
      shape = RoundedCornerShape(13.dp),
    )
    LazyRow(
      contentPadding = PaddingValues(horizontal = 16.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      items(listOf<String?>(null) + categories, key = { it ?: "all" }) { category ->
        FilterChip(
          selected = filter.category == category,
          onClick = { filter = filter.copy(category = category) },
          label = { Text(category?.catalogLabel() ?: "Все") },
          modifier = Modifier.testTag("catalog-category-${category ?: "all"}"),
        )
      }
    }
    Row(
      Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      OutlinedButton(
        onClick = {
          filter = filter.copy(sort = when (filter.sort) {
            CatalogSort.DEFAULT -> CatalogSort.PRICE_ASCENDING
            CatalogSort.PRICE_ASCENDING -> CatalogSort.PRICE_DESCENDING
            CatalogSort.PRICE_DESCENDING -> CatalogSort.DEFAULT
          })
        },
        modifier = Modifier.weight(1f).testTag("catalog-sort"),
      ) {
        Text(when (filter.sort) {
          CatalogSort.DEFAULT -> "↕ По цене"
          CatalogSort.PRICE_ASCENDING -> "Цена: сначала ниже"
          CatalogSort.PRICE_DESCENDING -> "Цена: сначала выше"
        }, maxLines = 1, fontSize = 11.sp)
      }
      FilterChip(
        selected = filter.inStockOnly,
        onClick = { filter = filter.copy(inStockOnly = !filter.inStockOnly) },
        label = { Text("В наличии", maxLines = 1, fontSize = 11.sp) },
        modifier = Modifier.weight(1f).testTag("catalog-stock"),
      )
    }

    if (visibleProducts.isEmpty()) {
      Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        Text("Ничего не найдено", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text("Попробуйте изменить фильтры", color = CatalogMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        Button(
          onClick = { filter = CatalogFilter() },
          modifier = Modifier.padding(top = 16.dp).testTag("catalog-reset"),
          colors = ButtonDefaults.buttonColors(containerColor = CatalogSurface, contentColor = CatalogLime),
        ) { Text("Сбросить фильтры") }
      }
    } else {
      LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.weight(1f),
        contentPadding = PaddingValues(12.dp, 8.dp, 12.dp, 24.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        item(span = { GridItemSpan(2) }) {
          Row(Modifier.fillMaxWidth().padding(4.dp, 2.dp, 4.dp, 4.dp), verticalAlignment = Alignment.Bottom) {
            Text("Каталог", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
            Text("${visibleProducts.size} товаров", color = CatalogMuted, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp, bottom = 3.dp).testTag("catalog-count"))
          }
        }
        items(visibleProducts, key = Product::id) { product ->
          ProductCard(product, apiBaseUrl, product.id in favorites, product.id in cart, onFavorite, onCart, onOpen = onOpenProduct)
        }
      }
    }
  }
}

private fun String.catalogLabel(): String = when (lowercase()) {
  "phone", "phones", "smartphone", "smartphones" -> "Смартфоны"
  "laptop", "laptops", "notebook", "notebooks" -> "Ноутбуки"
  "tablet", "tablets" -> "Планшеты"
  "audio", "headphones" -> "Аудио"
  "watch", "watches", "wearables" -> "Часы"
  "accessory", "accessories" -> "Аксессуары"
  else -> replaceFirstChar(Char::uppercase)
}
