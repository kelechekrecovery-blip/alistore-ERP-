package kg.alistore.core

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AliStoreApp(role: AppRole, apiBaseUrl: String) {
  var selected by remember { mutableStateOf(0) }
  val labels = when (role) {
    AppRole.CLIENT -> listOf("Каталог", "Корзина", "Кабинет")
    AppRole.STAFF -> listOf("Задачи", "Сканер", "Смена")
    AppRole.COURIER -> listOf("Маршрут", "COD", "Профиль")
    AppRole.POS -> listOf("Продажа", "Офлайн", "Смена")
  }
  MaterialTheme {
    Scaffold(
      bottomBar = {
        NavigationBar {
          labels.forEachIndexed { index, label ->
            NavigationBarItem(
              selected = selected == index,
              onClick = { selected = index },
              icon = { androidx.compose.material3.Icon(if (index == 0) Icons.Default.Home else if (index == 1) Icons.Default.ShoppingCart else Icons.Default.AccountCircle, contentDescription = null) },
              label = { Text(label) },
            )
          }
        }
      },
    ) { padding ->
      when {
        role == AppRole.CLIENT && selected == 0 -> ClientCatalog(apiBaseUrl, Modifier.padding(padding))
        else -> RoleEmptyState(role, labels[selected], Modifier.padding(padding))
      }
    }
  }
}

@Composable
private fun ClientCatalog(apiBaseUrl: String, modifier: Modifier = Modifier) {
  var products by remember { mutableStateOf<List<Product>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(apiBaseUrl) {
    runCatching { ApiClient(apiBaseUrl).catalog() }
      .onSuccess { products = it; error = null }
      .onFailure { error = it.message }
    loading = false
  }
  when {
    loading -> Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator() }
    error != null -> RoleEmptyState(AppRole.CLIENT, "Каталог недоступен", modifier, error)
    products.isEmpty() -> RoleEmptyState(AppRole.CLIENT, "Каталог пока пуст", modifier, "Товары появятся после синхронизации.")
    else -> LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 12.dp)) {
      item { Text("AliStore", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) }
      items(products, key = Product::id) { product ->
        ListItem(headlineContent = { Text(product.name) }, supportingContent = { Text("${product.category} · ${product.availableUnits} шт.") }, trailingContent = { Text("${product.price} сом") })
      }
    }
  }
}

@Composable
private fun RoleEmptyState(role: AppRole, title: String, modifier: Modifier = Modifier, detail: String? = null) {
  Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(title, style = MaterialTheme.typography.headlineSmall)
    Text(detail ?: when (role) {
      AppRole.CLIENT -> "Заказы, бонусы и гарантия"
      AppRole.STAFF -> "Операционные задачи магазина"
      AppRole.COURIER -> "Доставки и сдача наличных"
      AppRole.POS -> "Продажа и offline queue"
    }, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
  }
}
