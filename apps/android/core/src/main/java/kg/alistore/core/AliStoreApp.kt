package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Ink = Color(0xFF16130F)
private val Surface = Color(0xFF221E19)
private val Line = Color(0xFF342E28)
private val Muted = Color(0xFFA79C92)
private val Coral = Color(0xFFFF6B57)
private val Lime = Color(0xFFC8F04B)

private data class ClientTab(val label: String, val icon: ImageVector)

@Composable
fun AliStoreApp(
  role: AppRole,
  apiBaseUrl: String,
  deepLinkUrl: String? = null,
  deepLinkRevision: Long = 0,
  staffPushRegistrar: StaffPushRegistrar? = null,
) {
  if (role == AppRole.CLIENT) {
    ClientApp(apiBaseUrl, deepLinkUrl, deepLinkRevision)
    return
  }
  if (role == AppRole.STAFF) {
    StaffApp(apiBaseUrl, deepLinkUrl, deepLinkRevision, staffPushRegistrar)
    return
  }
  if (role == AppRole.COURIER) {
    CourierApp(apiBaseUrl, deepLinkUrl, deepLinkRevision, staffPushRegistrar)
    return
  }
  if (role == AppRole.POS) {
    PosApp(apiBaseUrl)
    return
  }
  RoleApp(role)
}

@Composable
private fun ClientApp(apiBaseUrl: String, deepLinkUrl: String?, deepLinkRevision: Long) {
  val context = LocalContext.current.applicationContext
  var selected by remember { mutableStateOf(0) }
  var products by remember { mutableStateOf<List<Product>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var favorites by remember { mutableStateOf(setOf<String>()) }
  var cart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
  var authState by remember { mutableStateOf<AuthState>(AuthState.Restoring) }
  var accountRoute by remember { mutableStateOf<String?>(null) }
  var orderRefreshRevision by remember { mutableStateOf(0) }
  val authManager = remember(apiBaseUrl) {
    AuthSessionManager(ApiClient(apiBaseUrl), SecureTokenStore(context, "alistore-session"))
  }
  val addToCart: (String) -> Unit = { id ->
    products.firstOrNull { it.id == id }?.let { product ->
      val current = cart[id] ?: 0
      if (product.availableUnits > current) cart = cart + (id to current + 1)
    }
  }
  val tabs = listOf(
    ClientTab("Главная", Icons.Default.Home),
    ClientTab("Каталог", Icons.Default.Search),
    ClientTab("Избранное", Icons.Default.FavoriteBorder),
    ClientTab("Корзина", Icons.Default.ShoppingCart),
    ClientTab("Кабинет", Icons.Default.AccountCircle),
  )

  LaunchedEffect(apiBaseUrl) {
    runCatching { ApiClient(apiBaseUrl).catalog() }
      .onSuccess { products = it; error = null }
      .onFailure { error = it.message }
    loading = false
  }
  LaunchedEffect(authManager) { authState = authManager.restore() }
  LaunchedEffect(deepLinkUrl, deepLinkRevision) {
    if (deepLinkUrl?.startsWith("alistore://payment-return") == true) {
      selected = 4
      accountRoute = "orders"
      orderRefreshRevision += 1
    }
  }

  MaterialTheme {
    Scaffold(
      containerColor = Ink,
      bottomBar = {
        NavigationBar(containerColor = Surface) {
          tabs.forEachIndexed { index, tab ->
            NavigationBarItem(
              selected = selected == index,
              onClick = { selected = index },
              icon = { Icon(tab.icon, contentDescription = tab.label, modifier = Modifier.size(21.dp)) },
              label = { Text(tab.label, fontSize = 9.sp, maxLines = 1) },
            )
          }
        }
      },
    ) { padding ->
      when {
        loading -> Loading(Modifier.padding(padding))
        error != null -> ClientMessage("Каталог недоступен", error, Modifier.padding(padding))
        selected == 0 -> ClientHome(products, favorites, cart.keys, { favorites = favorites.toggle(it) }, addToCart, Modifier.padding(padding))
        selected == 1 -> ClientCatalogScreen(products, favorites, cart.keys, { favorites = favorites.toggle(it) }, addToCart, Modifier.padding(padding))
        selected == 2 -> ProductGrid("Избранное", products.filter { it.id in favorites }, favorites, cart.keys, { favorites = favorites.toggle(it) }, addToCart, Modifier.padding(padding))
        selected == 3 -> ClientCheckout(
          apiBaseUrl = apiBaseUrl,
          products = products,
          cart = cart,
          authState = authState,
          onQuantity = { id, quantity -> cart = if (quantity <= 0) cart - id else cart + (id to quantity) },
          onClear = { cart = emptyMap() },
          onLogin = { selected = 4 },
          modifier = Modifier.padding(padding),
          authManager = authManager,
          onAuthState = { authState = it },
        )
        else -> ClientAccount(
          authState,
          authManager,
          { authState = it },
          favorites.size,
          cart.values.sum(),
          Modifier.padding(padding),
          apiBaseUrl = apiBaseUrl,
          route = accountRoute,
          onRoute = { accountRoute = it },
          orderRefreshRevision = orderRefreshRevision,
        )
      }
    }
  }
}

@Composable
private fun ClientHome(
  products: List<Product>,
  favorites: Set<String>,
  cart: Set<String>,
  onFavorite: (String) -> Unit,
  onCart: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
    item {
      Row(Modifier.fillMaxWidth().padding(18.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          Text("AliStore", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
          Text("Техника и сервис в одном приложении", color = Muted, fontSize = 12.sp)
        }
        Box(Modifier.size(38.dp).background(Coral, CircleShape), contentAlignment = Alignment.Center) {
          Text("A", color = Color.White, fontWeight = FontWeight.Black)
        }
      }
    }
    item {
      Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ServiceTile("Trade-in", "Оценка за 30 сек", Coral, Modifier.weight(1f))
        ServiceTile("Рассрочка", "0% до 12 мес", Lime, Modifier.weight(1f), Ink)
      }
    }
    item {
      Text("Категории", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(16.dp, 22.dp, 16.dp, 10.dp))
      LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        items(listOf("Смартфоны", "Ноутбуки", "Планшеты", "Аудио", "Аксессуары")) { category ->
          Text(category, color = Color.White, fontSize = 12.sp, modifier = Modifier.background(Surface, RoundedCornerShape(8.dp)).padding(12.dp, 9.dp))
        }
      }
    }
    item {
      Box(Modifier.fillMaxWidth().padding(16.dp).height(150.dp).background(Color(0xFF2C2926), RoundedCornerShape(8.dp))) {
        Column(Modifier.padding(18.dp).align(Alignment.CenterStart)) {
          Text("iPhone для каждого", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Black)
          Text("Проверенная техника с гарантией", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
          Text("Выбрать", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).background(Lime, RoundedCornerShape(6.dp)).padding(14.dp, 8.dp))
        }
        Box(Modifier.size(68.dp, 116.dp).align(Alignment.CenterEnd).padding(end = 18.dp).background(Coral, RoundedCornerShape(18.dp)))
      }
    }
    item { Text("Популярное", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(16.dp, 8.dp)) }
    items(products.take(6).chunked(2)) { row ->
      Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        row.forEach { product -> ProductCard(product, product.id in favorites, product.id in cart, onFavorite, onCart, Modifier.weight(1f)) }
        if (row.size == 1) Spacer(Modifier.weight(1f))
      }
    }
  }
}

@Composable
private fun ProductGrid(
  title: String,
  products: List<Product>,
  favorites: Set<String>,
  cart: Set<String>,
  onFavorite: (String) -> Unit,
  onCart: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  if (products.isEmpty()) {
    ClientMessage(title, "Здесь пока ничего нет", modifier)
    return
  }
  LazyVerticalGrid(
    columns = GridCells.Fixed(2),
    modifier = modifier.fillMaxSize(),
    contentPadding = PaddingValues(12.dp, 16.dp, 12.dp, 24.dp),
    horizontalArrangement = Arrangement.spacedBy(10.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
      Text(title, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(4.dp, 2.dp, 4.dp, 10.dp))
    }
    items(products, key = Product::id) { product -> ProductCard(product, product.id in favorites, product.id in cart, onFavorite, onCart) }
  }
}

@Composable
internal fun ProductCard(
  product: Product,
  favorite: Boolean,
  inCart: Boolean,
  onFavorite: (String) -> Unit,
  onCart: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  Column(modifier.testTag("product-${product.id}").background(Surface, RoundedCornerShape(8.dp)).padding(10.dp)) {
    Box(Modifier.fillMaxWidth().aspectRatio(1.15f).background(Color(0xFFF2EFEB), RoundedCornerShape(6.dp))) {
      Box(Modifier.size(46.dp, 82.dp).align(Alignment.Center).background(Coral, RoundedCornerShape(13.dp)))
      IconButton(onClick = { onFavorite(product.id) }, modifier = Modifier.align(Alignment.TopEnd).size(34.dp)) {
        Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, contentDescription = "Избранное", tint = if (favorite) Coral else Ink)
      }
    }
    Text(product.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, modifier = Modifier.padding(top = 10.dp))
    Text("${product.price} сом", color = Lime, fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 6.dp))
    Text(if (inCart) "В корзине" else "В корзину", color = if (inCart) Lime else Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth().padding(top = 9.dp).background(if (inCart) Line else Lime, RoundedCornerShape(6.dp)).clickable { onCart(product.id) }.padding(10.dp),)
  }
}

@Composable
private fun ServiceTile(title: String, detail: String, color: Color, modifier: Modifier = Modifier, content: Color = Color.White) {
  Column(modifier.background(color, RoundedCornerShape(8.dp)).padding(14.dp)) {
    Text(title, color = content, fontSize = 17.sp, fontWeight = FontWeight.Black)
    Text(detail, color = content.copy(alpha = .76f), fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
  }
}

@Composable
private fun Loading(modifier: Modifier = Modifier) {
  Box(modifier.fillMaxSize().background(Ink), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lime) }
}

@Composable
private fun ClientMessage(title: String, detail: String?, modifier: Modifier = Modifier) {
  Column(modifier.fillMaxSize().background(Ink).padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(title, color = Color.White, style = MaterialTheme.typography.headlineSmall)
    Text(detail ?: "", color = Muted, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
  }
}

@Composable
private fun RoleApp(role: AppRole) {
  var selected by remember { mutableStateOf(0) }
  val labels = when (role) {
    AppRole.STAFF -> listOf("Задачи", "Сканер", "Смена")
    AppRole.COURIER -> listOf("Маршрут", "COD", "Профиль")
    AppRole.POS -> listOf("Продажа", "Офлайн", "Смена")
    AppRole.CLIENT -> emptyList()
  }
  MaterialTheme {
    Scaffold(bottomBar = {
      NavigationBar {
        labels.forEachIndexed { index, label ->
          NavigationBarItem(selected == index, { selected = index }, { Icon(if (index == 0) Icons.Default.Home else if (index == 1) Icons.Default.ShoppingCart else Icons.Default.AccountCircle, null) }, label = { Text(label) })
        }
      }
    }) { padding -> RoleEmptyState(role, labels[selected], Modifier.padding(padding)) }
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

private fun Set<String>.toggle(id: String): Set<String> = if (id in this) this - id else this + id
