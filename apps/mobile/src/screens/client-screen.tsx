import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError, api } from '@mobile/api-client';
import { formatSom, shortId } from '@mobile/format';
import { clearCustomerSession, getStoredCustomerSession, saveCustomerSession } from '@mobile/secure-session';
import { radius, theme } from '@mobile/theme';
import { EmptyState, Field, GhostButton, MetricCard, Pill, PrimaryButton, ProductPoster, SectionTitle } from '@mobile/ui';
import type {
  CatalogProduct,
  CreatedOrder,
  CustomerOrder,
  CustomerSession,
  MyDevice,
  OnlinePaymentMethod,
  PaymentIntent,
  SupportPriority,
  SupportTicket,
} from '@mobile/types';

type ClientTab = 'home' | 'catalog' | 'favorites' | 'cart' | 'account';
type ClientPayment = 'cash' | OnlinePaymentMethod;

interface ClientScreenProps {
  products: CatalogProduct[];
  catalogState: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSessionChange?: (session: CustomerSession | null) => void;
}

interface CheckoutResult {
  order: CreatedOrder;
  intent?: PaymentIntent;
  paid?: boolean;
}

const paymentOptions: Array<{ method: ClientPayment; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { method: 'cash', label: 'При получении', icon: 'cash-outline' },
  { method: 'card', label: 'Карта', icon: 'card-outline' },
  { method: 'qr_mbank', label: 'MBank QR', icon: 'qr-code-outline' },
  { method: 'qr_odengi', label: 'O!Деньги QR', icon: 'phone-portrait-outline' },
  { method: 'installment', label: 'Рассрочка', icon: 'calendar-outline' },
];

export function ClientScreen({
  products,
  catalogState,
  catalogError,
  refreshing,
  onRefresh,
  onSessionChange,
}: ClientScreenProps) {
  const [tab, setTab] = useState<ClientTab>('home');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [favorites, setFavorites] = useState<Record<string, true>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState(false);
  const [bonus, setBonus] = useState(false);
  const [name, setName] = useState('Гость AliStore');
  const [phone, setPhone] = useState('+996 ');
  const [payment, setPayment] = useState<ClientPayment>('cash');
  const [delivery, setDelivery] = useState<'pickup' | 'courier'>('pickup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MyDevice[]>([]);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsBusy, setTicketsBusy] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportPriority, setSupportPriority] = useState<SupportPriority>('normal');
  const [supportBusy, setSupportBusy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState<boolean | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [warrantyDraftImei, setWarrantyDraftImei] = useState<string | null>(null);
  const [warrantyProblem, setWarrantyProblem] = useState('');
  const [warrantyBusy, setWarrantyBusy] = useState(false);
  const [warrantyError, setWarrantyError] = useState<string | null>(null);

  const categories = useMemo(() => ['Все', ...Array.from(new Set(products.map((product) => product.category))).slice(0, 10)], [products]);
  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((item) => item.id === id);
        return product ? { product, qty } : null;
      })
      .filter((line): line is { product: CatalogProduct; qty: number } => Boolean(line));
  }, [cart, products]);

  const cartCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = cartLines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const promoDiscount = promo ? Math.min(5000, subtotal) : 0;
  const bonusDiscount = bonus ? Math.min(4820, Math.max(0, subtotal - promoDiscount)) : 0;
  const deliveryFee = delivery === 'courier' && cartCount > 0 ? 250 : 0;
  const total = Math.max(0, subtotal - promoDiscount - bonusDiscount + deliveryFee);

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = category === 'Все' || product.category === category;
      const queryMatch = !normalized
        || product.name.toLowerCase().includes(normalized)
        || product.sku.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [category, products, query]);

  const favoriteProducts = products.filter((product) => favorites[product.id]);
  const hits = products.slice(0, 6);

  useEffect(() => {
    let alive = true;
    getStoredCustomerSession()
      .then((stored) => (stored ? restoreCustomerSession(stored) : null))
      .then((stored) => {
        if (!alive) return;
        setCustomerSession(stored);
        onSessionChange?.(stored);
        if (stored?.phone) setPhone(stored.phone);
      })
      .catch(() => {
        if (!alive) return;
        onSessionChange?.(null);
      })
      .finally(() => {
        if (alive) setSessionLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [onSessionChange]);

  useEffect(() => {
    if (!customerSession) {
      setOrders([]);
      setOrdersError(null);
      setDevices([]);
      setDevicesError(null);
      setTickets([]);
      setTicketsError(null);
      setMarketingConsent(null);
      setConsentError(null);
      setWarrantyDraftImei(null);
      setWarrantyProblem('');
      setWarrantyError(null);
      return;
    }
    void loadAccountData(customerSession);
  }, [customerSession?.accessToken]);

  function addToCart(product: CatalogProduct) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setTab('cart');
  }

  function changeQty(productId: string, delta: number) {
    setCart((current) => {
      const nextQty = (current[productId] ?? 0) + delta;
      const next = { ...current };
      if (nextQty <= 0) delete next[productId];
      else next[productId] = nextQty;
      return next;
    });
  }

  function toggleFavorite(productId: string) {
    setFavorites((current) => {
      const next = { ...current };
      if (next[productId]) delete next[productId];
      else next[productId] = true;
      return next;
    });
  }

  async function requestCustomerOtp() {
    if (authBusy) return;
    const nextPhone = normalizePhone(phone);
    if (phoneDigitCount(nextPhone) < 9) {
      setAuthError('Укажите телефон в международном формате.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const challenge = await api.requestOtp(nextPhone);
      setPhone(nextPhone);
      setOtpSent(true);
      setOtpDevCode(challenge.devCode ?? null);
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Код не отправлен.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyCustomerOtp() {
    if (authBusy) return;
    const nextPhone = normalizePhone(phone);
    const code = otpCode.replace(/\D/g, '');
    if (code.length !== 6) {
      setAuthError('Введите 6 цифр из SMS.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const tokens = await api.verifyOtp({ phone: nextPhone, code });
      const principal = await api.authMe(tokens.accessToken);
      const session: CustomerSession = {
        ...tokens,
        customerId: principal.customerId,
        phone: principal.phone ?? nextPhone,
      };
      await saveCustomerSession(session);
      setCustomerSession(session);
      onSessionChange?.(session);
      setPhone(session.phone);
      setOtpCode('');
      setOtpSent(false);
      setOtpDevCode(null);
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Вход не выполнен.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function logoutCustomer() {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (customerSession?.refreshToken) {
        await api.logoutCustomer(customerSession.refreshToken).catch(() => undefined);
      }
      await clearCustomerSession();
      setCustomerSession(null);
      onSessionChange?.(null);
      setOtpCode('');
      setOtpSent(false);
      setOtpDevCode(null);
      setOrders([]);
      setOrdersError(null);
      setDevices([]);
      setDevicesError(null);
      setTickets([]);
      setTicketsError(null);
      setSupportSubject('');
      setSupportBody('');
      setSupportPriority('normal');
      setMarketingConsent(null);
      setConsentError(null);
      setWarrantyDraftImei(null);
      setWarrantyProblem('');
      setWarrantyError(null);
    } finally {
      setAuthBusy(false);
    }
  }

  async function prepareCustomerSession(session: CustomerSession): Promise<CustomerSession | null> {
    const readySession = await restoreCustomerSession(session);
    if (!readySession) {
      setCustomerSession(null);
      onSessionChange?.(null);
      setOrders([]);
      setDevices([]);
      setTickets([]);
      setMarketingConsent(null);
      return null;
    }
    if (readySession.accessToken !== session.accessToken || readySession.refreshToken !== session.refreshToken) {
      setCustomerSession(readySession);
      onSessionChange?.(readySession);
    }
    return readySession;
  }

  async function loadAccountData(session = customerSession) {
    if (!session || ordersBusy || devicesBusy || ticketsBusy || consentBusy) return;
    setOrdersBusy(true);
    setDevicesBusy(true);
    setTicketsBusy(true);
    setOrdersError(null);
    setDevicesError(null);
    setTicketsError(null);
    setConsentError(null);
    try {
      const readySession = await prepareCustomerSession(session);
      if (!readySession) return;
      const [profileResult, ordersResult, devicesResult, ticketsResult] = await Promise.allSettled([
        api.getCustomer(readySession.customerId, readySession.accessToken),
        api.fetchMyOrders(readySession.accessToken),
        api.fetchMyDevices(readySession.accessToken),
        api.fetchSupportTickets({ customerId: readySession.customerId }, readySession.accessToken),
      ]);
      if (profileResult.status === 'fulfilled') setMarketingConsent(profileResult.value.consent);
      else setConsentError(profileResult.reason instanceof Error ? profileResult.reason.message : 'Согласие не загружено.');
      if (ordersResult.status === 'fulfilled') setOrders(ordersResult.value);
      else setOrdersError(ordersResult.reason instanceof Error ? ordersResult.reason.message : 'Заказы не загружены.');
      if (devicesResult.status === 'fulfilled') setDevices(devicesResult.value);
      else setDevicesError(devicesResult.reason instanceof Error ? devicesResult.reason.message : 'Устройства не загружены.');
      if (ticketsResult.status === 'fulfilled') setTickets(ticketsResult.value);
      else setTicketsError(ticketsResult.reason instanceof Error ? ticketsResult.reason.message : 'Тикеты не загружены.');
    } finally {
      setOrdersBusy(false);
      setDevicesBusy(false);
      setTicketsBusy(false);
    }
  }

  async function loadCustomerOrders(session = customerSession) {
    if (!session || ordersBusy || devicesBusy || ticketsBusy || consentBusy) return;
    setOrdersBusy(true);
    setOrdersError(null);
    try {
      const readySession = await prepareCustomerSession(session);
      if (!readySession) return;
      const mine = await api.fetchMyOrders(readySession.accessToken);
      setOrders(mine);
    } catch (cause) {
      setOrdersError(cause instanceof Error ? cause.message : 'Заказы не загружены.');
    } finally {
      setOrdersBusy(false);
    }
  }

  async function loadCustomerDevices(session = customerSession) {
    if (!session || ordersBusy || devicesBusy || ticketsBusy || consentBusy) return;
    setDevicesBusy(true);
    setDevicesError(null);
    try {
      const readySession = await prepareCustomerSession(session);
      if (!readySession) return;
      const mine = await api.fetchMyDevices(readySession.accessToken);
      setDevices(mine);
    } catch (cause) {
      setDevicesError(cause instanceof Error ? cause.message : 'Устройства не загружены.');
    } finally {
      setDevicesBusy(false);
    }
  }

  async function loadSupportTickets(session = customerSession) {
    if (!session || ordersBusy || devicesBusy || ticketsBusy || consentBusy) return;
    setTicketsBusy(true);
    setTicketsError(null);
    try {
      const readySession = await prepareCustomerSession(session);
      if (!readySession) return;
      const mine = await api.fetchSupportTickets({ customerId: readySession.customerId }, readySession.accessToken);
      setTickets(mine);
    } catch (cause) {
      setTicketsError(cause instanceof Error ? cause.message : 'Тикеты не загружены.');
    } finally {
      setTicketsBusy(false);
    }
  }

  async function openSupportTicket() {
    if (!customerSession || supportBusy) return;
    const subject = supportSubject.trim();
    if (subject.length < 3) {
      setTicketsError('Коротко опишите вопрос.');
      return;
    }
    setSupportBusy(true);
    setTicketsError(null);
    try {
      const readySession = await prepareCustomerSession(customerSession);
      if (!readySession) return;
      const ticket = await api.openSupportTicket({
        customerId: readySession.customerId,
        subject,
        body: supportBody.trim() || undefined,
        priority: supportPriority,
      }, readySession.accessToken);
      setTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)]);
      setSupportSubject('');
      setSupportBody('');
      setSupportPriority('normal');
    } catch (cause) {
      setTicketsError(cause instanceof Error ? cause.message : 'Тикет не создан.');
    } finally {
      setSupportBusy(false);
    }
  }

  async function openWarrantyCase(imei: string) {
    if (!customerSession || warrantyBusy) return;
    const problem = warrantyProblem.trim();
    if (problem.length < 3) {
      setWarrantyError('Опишите проблему устройства.');
      return;
    }
    setWarrantyBusy(true);
    setWarrantyError(null);
    try {
      const readySession = await prepareCustomerSession(customerSession);
      if (!readySession) return;
      const warranty = await api.openWarranty({
        imei,
        customerId: readySession.customerId,
        problem,
      }, readySession.accessToken);
      setDevices((current) => current.map((device) => (
        device.imei === imei
          ? { ...device, warranty: { id: warranty.id, status: warranty.status, sla: warranty.sla } }
          : device
      )));
      setWarrantyDraftImei(null);
      setWarrantyProblem('');
      void loadCustomerDevices(readySession);
    } catch (cause) {
      setWarrantyError(cause instanceof Error ? cause.message : 'Гарантия не создана.');
    } finally {
      setWarrantyBusy(false);
    }
  }

  async function toggleMarketingConsent() {
    if (!customerSession || consentBusy || marketingConsent === null) return;
    const next = !marketingConsent;
    setConsentBusy(true);
    setConsentError(null);
    setMarketingConsent(next);
    try {
      const readySession = await prepareCustomerSession(customerSession);
      if (!readySession) return;
      const updated = await api.setCustomerConsent({
        customerId: readySession.customerId,
        consent: next,
      }, readySession.accessToken);
      setMarketingConsent(updated.consent);
    } catch (cause) {
      setMarketingConsent(!next);
      setConsentError(cause instanceof Error ? cause.message : 'Согласие не сохранено.');
    } finally {
      setConsentBusy(false);
    }
  }

  async function placeOrder() {
    if (cartLines.length === 0 || busy) return;
    const checkoutPhone = normalizePhone(customerSession?.phone ?? phone);
    if (!customerSession && phoneDigitCount(checkoutPhone) < 9) {
      setError('Укажите телефон для оформления заказа.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const customerId = customerSession?.customerId
        ?? (await api.createCustomer({ phone: checkoutPhone, name: name.trim() || undefined })).id;
      const order = await api.createOrder({
        customerId,
        channel: 'mobile',
        total,
        items: cartLines.map((line) => ({ sku: line.product.sku, qty: line.qty, price: line.product.price })),
      });

      if (payment === 'cash') {
        setCheckoutResult({ order });
        setCart({});
        if (customerSession) void loadCustomerOrders(customerSession);
        setTab('account');
        return;
      }

      const intent = await api.createPaymentIntent({
        orderId: order.id,
        method: payment,
        amount: total,
        actor: 'mobile_checkout',
      });
      setCheckoutResult({ order: { ...order, status: intent.orderStatus }, intent });
      setCart({});
      if (customerSession) void loadCustomerOrders(customerSession);
      setTab('account');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось оформить заказ.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSandboxPayment() {
    if (!checkoutResult?.intent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await api.confirmSandboxPayment({
        orderId: checkoutResult.intent.orderId,
        method: checkoutResult.intent.method,
        amount: checkoutResult.intent.amount,
        txnId: checkoutResult.intent.txnId,
      });
      setCheckoutResult({
        ...checkoutResult,
        order: {
          ...checkoutResult.order,
          status: confirmed.order?.status ?? 'paid',
        },
        paid: true,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Платёж не подтверждён.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.lime} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {catalogState === 'error' ? (
          <View style={styles.errorBox}>
            <Ionicons name="cloud-offline-outline" color={theme.danger} size={18} />
            <Text selectable style={styles.errorText}>{catalogError ?? 'Каталог недоступен'}</Text>
          </View>
        ) : null}

        {tab === 'home' ? (
          <HomeTab
            products={hits}
            cartCount={cartCount}
            favoritesCount={favoriteProducts.length}
            onOpenCatalog={() => setTab('catalog')}
            onAddToCart={addToCart}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
          />
        ) : null}

        {tab === 'catalog' ? (
          <CatalogTab
            products={visibleProducts}
            categories={categories}
            category={category}
            query={query}
            onQuery={setQuery}
            onCategory={setCategory}
            onAddToCart={addToCart}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
            loading={catalogState === 'loading'}
          />
        ) : null}

        {tab === 'favorites' ? (
          <FavoritesTab
            products={favoriteProducts}
            onOpenCatalog={() => setTab('catalog')}
            onAddToCart={addToCart}
            onToggleFavorite={toggleFavorite}
          />
        ) : null}

        {tab === 'cart' ? (
          <CartTab
            lines={cartLines}
            subtotal={subtotal}
            total={total}
            promo={promo}
            bonus={bonus}
            delivery={delivery}
            payment={payment}
            busy={busy}
            error={error}
            name={name}
            phone={phone}
            onChangeQty={changeQty}
            onPromo={() => setPromo((value) => !value)}
            onBonus={() => setBonus((value) => !value)}
            onDelivery={setDelivery}
            onPayment={setPayment}
            onName={setName}
            onPhone={setPhone}
            onPlaceOrder={placeOrder}
            onOpenCatalog={() => setTab('catalog')}
          />
        ) : null}

        {tab === 'account' ? (
          <AccountTab
            result={checkoutResult}
            busy={busy}
            authBusy={authBusy}
            sessionLoading={sessionLoading}
            session={customerSession}
            error={error}
            authError={authError}
            orders={orders}
            ordersBusy={ordersBusy}
            ordersError={ordersError}
            devices={devices}
            devicesBusy={devicesBusy}
            devicesError={devicesError}
            warrantyDraftImei={warrantyDraftImei}
            warrantyProblem={warrantyProblem}
            warrantyBusy={warrantyBusy}
            warrantyError={warrantyError}
            tickets={tickets}
            ticketsBusy={ticketsBusy}
            ticketsError={ticketsError}
            marketingConsent={marketingConsent}
            consentBusy={consentBusy}
            consentError={consentError}
            supportSubject={supportSubject}
            supportBody={supportBody}
            supportPriority={supportPriority}
            supportBusy={supportBusy}
            phone={phone}
            otpCode={otpCode}
            otpSent={otpSent}
            otpDevCode={otpDevCode}
            onPhone={setPhone}
            onOtpCode={setOtpCode}
            onRequestOtp={requestCustomerOtp}
            onVerifyOtp={verifyCustomerOtp}
            onLogout={logoutCustomer}
            onReloadOrders={() => loadCustomerOrders()}
            onReloadDevices={() => loadCustomerDevices()}
            onStartWarranty={setWarrantyDraftImei}
            onWarrantyProblem={setWarrantyProblem}
            onCancelWarranty={() => {
              setWarrantyDraftImei(null);
              setWarrantyProblem('');
              setWarrantyError(null);
            }}
            onOpenWarranty={openWarrantyCase}
            onReloadTickets={() => loadSupportTickets()}
            onSupportSubject={setSupportSubject}
            onSupportBody={setSupportBody}
            onSupportPriority={setSupportPriority}
            onOpenSupportTicket={openSupportTicket}
            onToggleMarketingConsent={toggleMarketingConsent}
            onConfirmPayment={confirmSandboxPayment}
            onOpenCatalog={() => setTab('catalog')}
          />
        ) : null}
      </ScrollView>

      <ClientTabs active={tab} cartCount={cartCount} favCount={favoriteProducts.length} onChange={setTab} />
    </View>
  );
}

function HomeTab({
  products,
  cartCount,
  favoritesCount,
  onOpenCatalog,
  onAddToCart,
  onToggleFavorite,
  favorites,
}: {
  products: CatalogProduct[];
  cartCount: number;
  favoritesCount: number;
  onOpenCatalog: () => void;
  onAddToCart: (product: CatalogProduct) => void;
  onToggleFavorite: (id: string) => void;
  favorites: Record<string, true>;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text selectable style={styles.heroKicker}>AliStore App 2.0</Text>
          <Text selectable style={styles.heroTitle}>Каталог, бонусы, оплата и заказы в native iOS/Android.</Text>
        </View>
        <PrimaryButton label="В каталог" icon="grid-outline" onPress={onOpenCatalog} />
      </View>

      <View style={styles.metrics}>
        <MetricCard label="В корзине" value={`${cartCount} шт.`} icon="cart-outline" />
        <MetricCard label="Избранное" value={`${favoritesCount} SKU`} icon="heart-outline" />
      </View>

      <SectionTitle
        title="Хиты продаж"
        right={<GhostButton label="Все" icon="arrow-forward-outline" onPress={onOpenCatalog} />}
      />
      <View style={styles.productGrid}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            favorite={Boolean(favorites[product.id])}
            onAdd={() => onAddToCart(product)}
            onFavorite={() => onToggleFavorite(product.id)}
          />
        ))}
      </View>
    </View>
  );
}

function CatalogTab({
  products,
  categories,
  category,
  query,
  onQuery,
  onCategory,
  onAddToCart,
  onToggleFavorite,
  favorites,
  loading,
}: {
  products: CatalogProduct[];
  categories: string[];
  category: string;
  query: string;
  onQuery: (next: string) => void;
  onCategory: (next: string) => void;
  onAddToCart: (product: CatalogProduct) => void;
  onToggleFavorite: (id: string) => void;
  favorites: Record<string, true>;
  loading: boolean;
}) {
  return (
    <View style={styles.block}>
      <SectionTitle title="Каталог" />
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" color={theme.muted2} size={18} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Поиск по названию или SKU"
          placeholderTextColor={theme.muted2}
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
        {categories.map((item) => (
          <Pill key={item} label={item} active={item === category} onPress={() => onCategory(item)} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.lime} />
          <Text selectable style={styles.mutedText}>Загружаем каталог...</Text>
        </View>
      ) : null}

      {products.length === 0 && !loading ? (
        <EmptyState icon="search-outline" title="Ничего не найдено" text="Измените запрос или категорию." />
      ) : (
        <View style={styles.productGrid}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              favorite={Boolean(favorites[product.id])}
              onAdd={() => onAddToCart(product)}
              onFavorite={() => onToggleFavorite(product.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function FavoritesTab({
  products,
  onOpenCatalog,
  onAddToCart,
  onToggleFavorite,
}: {
  products: CatalogProduct[];
  onOpenCatalog: () => void;
  onAddToCart: (product: CatalogProduct) => void;
  onToggleFavorite: (id: string) => void;
}) {
  if (products.length === 0) {
    return (
      <View style={styles.block}>
        <EmptyState icon="heart-outline" title="Избранное пустое" text="Добавьте товары из каталога, чтобы быстро вернуться к ним." />
        <PrimaryButton label="Открыть каталог" icon="grid-outline" onPress={onOpenCatalog} />
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <SectionTitle title="Избранное" />
      {products.map((product) => (
        <ListProduct
          key={product.id}
          product={product}
          onAdd={() => onAddToCart(product)}
          onRemove={() => onToggleFavorite(product.id)}
        />
      ))}
    </View>
  );
}

function CartTab({
  lines,
  subtotal,
  total,
  promo,
  bonus,
  delivery,
  payment,
  busy,
  error,
  name,
  phone,
  onChangeQty,
  onPromo,
  onBonus,
  onDelivery,
  onPayment,
  onName,
  onPhone,
  onPlaceOrder,
  onOpenCatalog,
}: {
  lines: Array<{ product: CatalogProduct; qty: number }>;
  subtotal: number;
  total: number;
  promo: boolean;
  bonus: boolean;
  delivery: 'pickup' | 'courier';
  payment: ClientPayment;
  busy: boolean;
  error: string | null;
  name: string;
  phone: string;
  onChangeQty: (productId: string, delta: number) => void;
  onPromo: () => void;
  onBonus: () => void;
  onDelivery: (next: 'pickup' | 'courier') => void;
  onPayment: (next: ClientPayment) => void;
  onName: (next: string) => void;
  onPhone: (next: string) => void;
  onPlaceOrder: () => void;
  onOpenCatalog: () => void;
}) {
  if (lines.length === 0) {
    return (
      <View style={styles.block}>
        <EmptyState icon="cart-outline" title="Корзина пустая" text="Добавьте товар из каталога, native cart останется в памяти приложения." />
        <PrimaryButton label="В каталог" icon="grid-outline" onPress={onOpenCatalog} />
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <SectionTitle title="Корзина" />
      {lines.map((line) => (
        <View key={line.product.id} style={styles.cartLine}>
          <ProductPoster product={line.product} compact />
          <View style={styles.cartLineCopy}>
            <Text selectable numberOfLines={2} style={styles.cartLineTitle}>{line.product.name}</Text>
            <Text selectable style={styles.mutedText}>{line.product.sku}</Text>
            <View style={styles.qtyRow}>
              <QtyButton icon="remove" onPress={() => onChangeQty(line.product.id, -1)} />
              <Text selectable style={styles.qtyText}>{line.qty}</Text>
              <QtyButton icon="add" onPress={() => onChangeQty(line.product.id, 1)} />
              <Text selectable style={styles.lineTotal}>{formatSom(line.product.price * line.qty)}</Text>
            </View>
          </View>
        </View>
      ))}

      <View style={styles.checkoutPanel}>
        <SectionTitle title="Оформление" />
        <View style={styles.duo}>
          <GhostButton label="Самовывоз" icon="storefront-outline" active={delivery === 'pickup'} onPress={() => onDelivery('pickup')} />
          <GhostButton label="Курьер" icon="car-outline" active={delivery === 'courier'} onPress={() => onDelivery('courier')} />
        </View>
        <View style={styles.duo}>
          <GhostButton label={promo ? 'SALE5000 применён' : 'Промокод'} icon="pricetag-outline" active={promo} onPress={onPromo} />
          <GhostButton label={bonus ? 'Бонусы списаны' : '4 820 бонусов'} icon="sparkles-outline" active={bonus} onPress={onBonus} />
        </View>
        <Field label="Имя" value={name} onChangeText={onName} placeholder="Ваше имя" />
        <Field label="Телефон" value={phone} onChangeText={onPhone} keyboardType="phone-pad" placeholder="+996 700 12 34 56" />

        <Text selectable style={styles.fieldCaption}>Оплата</Text>
        <View style={styles.paymentGrid}>
          {paymentOptions.map((option) => (
            <Pressable
              key={option.method}
              onPress={() => onPayment(option.method)}
              style={[styles.paymentButton, { borderColor: payment === option.method ? theme.lime : theme.border }]}
            >
              <Ionicons name={option.icon} size={18} color={payment === option.method ? theme.lime : theme.textSoft} />
              <Text selectable style={styles.paymentText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.totalBox}>
          <TotalRow label="Товары" value={formatSom(subtotal)} />
          <TotalRow label="Доставка" value={delivery === 'courier' ? '250 сом' : '0 сом'} />
          <TotalRow label="Скидки" value={formatSom(Math.max(0, subtotal - total + (delivery === 'courier' ? 250 : 0)))} accent />
          <View style={styles.totalDivider} />
          <TotalRow label="Итого" value={formatSom(total)} strong />
        </View>

        {error ? <Text selectable style={styles.formError}>{error}</Text> : null}
        <PrimaryButton
          label={busy ? 'Оформляем...' : 'Создать заказ'}
          icon="checkmark-circle-outline"
          disabled={busy}
          onPress={onPlaceOrder}
        />
      </View>
    </View>
  );
}

function AccountTab({
  result,
  busy,
  authBusy,
  sessionLoading,
  session,
  error,
  authError,
  orders,
  ordersBusy,
  ordersError,
  devices,
  devicesBusy,
  devicesError,
  warrantyDraftImei,
  warrantyProblem,
  warrantyBusy,
  warrantyError,
  tickets,
  ticketsBusy,
  ticketsError,
  marketingConsent,
  consentBusy,
  consentError,
  supportSubject,
  supportBody,
  supportPriority,
  supportBusy,
  phone,
  otpCode,
  otpSent,
  otpDevCode,
  onPhone,
  onOtpCode,
  onRequestOtp,
  onVerifyOtp,
  onLogout,
  onReloadOrders,
  onReloadDevices,
  onStartWarranty,
  onWarrantyProblem,
  onCancelWarranty,
  onOpenWarranty,
  onReloadTickets,
  onSupportSubject,
  onSupportBody,
  onSupportPriority,
  onOpenSupportTicket,
  onToggleMarketingConsent,
  onConfirmPayment,
  onOpenCatalog,
}: {
  result: CheckoutResult | null;
  busy: boolean;
  authBusy: boolean;
  sessionLoading: boolean;
  session: CustomerSession | null;
  error: string | null;
  authError: string | null;
  orders: CustomerOrder[];
  ordersBusy: boolean;
  ordersError: string | null;
  devices: MyDevice[];
  devicesBusy: boolean;
  devicesError: string | null;
  warrantyDraftImei: string | null;
  warrantyProblem: string;
  warrantyBusy: boolean;
  warrantyError: string | null;
  tickets: SupportTicket[];
  ticketsBusy: boolean;
  ticketsError: string | null;
  marketingConsent: boolean | null;
  consentBusy: boolean;
  consentError: string | null;
  supportSubject: string;
  supportBody: string;
  supportPriority: SupportPriority;
  supportBusy: boolean;
  phone: string;
  otpCode: string;
  otpSent: boolean;
  otpDevCode: string | null;
  onPhone: (next: string) => void;
  onOtpCode: (next: string) => void;
  onRequestOtp: () => void;
  onVerifyOtp: () => void;
  onLogout: () => void;
  onReloadOrders: () => void;
  onReloadDevices: () => void;
  onStartWarranty: (imei: string) => void;
  onWarrantyProblem: (next: string) => void;
  onCancelWarranty: () => void;
  onOpenWarranty: (imei: string) => void;
  onReloadTickets: () => void;
  onSupportSubject: (next: string) => void;
  onSupportBody: (next: string) => void;
  onSupportPriority: (next: SupportPriority) => void;
  onOpenSupportTicket: () => void;
  onToggleMarketingConsent: () => void;
  onConfirmPayment: () => void;
  onOpenCatalog: () => void;
}) {
  return (
    <View style={styles.block}>
      <SectionTitle title="Кабинет" />
      <View style={styles.accountCard}>
        <Ionicons name={session ? 'person-circle' : 'person-circle-outline'} size={32} color={theme.lime} />
        <View style={styles.accountCopy}>
          <Text selectable style={styles.accountTitle}>{session ? 'Аккаунт AliStore' : 'Гость AliStore'}</Text>
          <Text selectable style={styles.mutedText}>
            {session ? `${session.phone} · ${shortId(session.customerId)}` : 'Войдите по OTP для заказов, бонусов и push.'}
          </Text>
        </View>
        {session ? <Pill label="Активен" active /> : null}
      </View>

      <View style={styles.authPanel}>
        {sessionLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.lime} />
            <Text selectable style={styles.mutedText}>Проверяем сессию...</Text>
          </View>
        ) : session ? (
          <>
            <View style={styles.profileGrid}>
              <ProfileValue label="Телефон" value={session.phone} />
              <ProfileValue label="Customer ID" value={shortId(session.customerId)} />
              <ProfileValue label="Access TTL" value={session.expiresIn} />
            </View>
            {authError ? <Text selectable style={styles.formError}>{authError}</Text> : null}
            <PrimaryButton
              label={authBusy ? 'Выходим...' : 'Выйти'}
              icon="log-out-outline"
              danger
              disabled={authBusy}
              onPress={onLogout}
            />
          </>
        ) : (
          <>
            <Field label="Телефон" value={phone} onChangeText={onPhone} keyboardType="phone-pad" placeholder="+996700123456" />
            {otpSent ? (
              <Field label="Код из SMS" value={otpCode} onChangeText={onOtpCode} keyboardType="number-pad" placeholder="000000" />
            ) : null}
            {otpDevCode ? <Text selectable style={styles.devCodeText}>DEV OTP: {otpDevCode}</Text> : null}
            {authError ? <Text selectable style={styles.formError}>{authError}</Text> : null}
            <View style={styles.duo}>
              <PrimaryButton
                label={authBusy ? 'Подождите...' : otpSent ? 'Войти' : 'Получить код'}
                icon={otpSent ? 'checkmark-circle-outline' : 'chatbubble-ellipses-outline'}
                disabled={authBusy}
                onPress={otpSent ? onVerifyOtp : onRequestOtp}
              />
              {otpSent ? (
                <GhostButton label="Заново" icon="refresh-outline" onPress={authBusy ? undefined : onRequestOtp} />
              ) : null}
            </View>
          </>
        )}
      </View>

      {result ? (
        <View style={styles.orderCard}>
          <Text selectable style={styles.orderTitle}>Заказ #{shortId(result.order.id)}</Text>
          <Text selectable style={styles.mutedText}>Статус: {result.paid ? 'paid' : result.order.status}</Text>
          <Text selectable style={styles.orderTotal}>{formatSom(result.order.total)}</Text>
          {result.intent ? (
            <View style={styles.intentBox}>
              <Text selectable style={styles.intentTitle}>{result.intent.provider.toUpperCase()} · {result.intent.method}</Text>
              <Text selectable style={styles.intentUrl}>{result.intent.paymentUrl}</Text>
              {result.intent.qrPayload ? <Text selectable style={styles.intentUrl}>{result.intent.qrPayload}</Text> : null}
              <PrimaryButton
                label={busy ? 'Подтверждаем...' : 'Подтвердить sandbox оплату'}
                icon="shield-checkmark-outline"
                disabled={busy || result.paid}
                onPress={onConfirmPayment}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState icon="receipt-outline" title="Активных заказов нет" text="После checkout заказ появится здесь со статусом и оплатой." />
      )}

      {session ? (
        <View style={styles.historyPanel}>
          <SectionTitle title="Уведомления" />
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text selectable style={styles.preferenceTitle}>Маркетинговое согласие</Text>
              <Text selectable style={styles.mutedText}>Промо, подборки и персональные кампании.</Text>
            </View>
            <Pressable
              onPress={marketingConsent === null || consentBusy ? undefined : onToggleMarketingConsent}
              style={[
                styles.toggleTrack,
                { backgroundColor: marketingConsent ? theme.lime : theme.cardAlt, borderColor: marketingConsent ? theme.lime : theme.border },
              ]}
            >
              <View style={[styles.toggleThumb, marketingConsent ? styles.toggleThumbOn : null]} />
              <Text selectable style={[styles.toggleText, { color: marketingConsent ? theme.limeInk : theme.muted }]}>
                {consentBusy ? '...' : marketingConsent ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
          {consentError ? <Text selectable style={styles.formError}>{consentError}</Text> : null}
        </View>
      ) : null}

      {session ? (
        <View style={styles.historyPanel}>
          <SectionTitle
            title="Мои заказы"
            right={<GhostButton label="Обновить" icon="refresh-outline" onPress={ordersBusy ? undefined : onReloadOrders} />}
          />
          {ordersBusy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.lime} />
              <Text selectable style={styles.mutedText}>Загружаем заказы...</Text>
            </View>
          ) : null}
          {ordersError ? <Text selectable style={styles.formError}>{ordersError}</Text> : null}
          {orders.length === 0 && !ordersBusy ? (
            <EmptyState icon="bag-check-outline" title="История пустая" text="Оформленные из аккаунта заказы появятся здесь." />
          ) : (
            orders.slice(0, 8).map((order) => <OrderHistoryCard key={order.id} order={order} />)
          )}
        </View>
      ) : null}

      {session ? (
        <View style={styles.historyPanel}>
          <SectionTitle
            title="Мои устройства"
            right={<GhostButton label="Обновить" icon="refresh-outline" onPress={devicesBusy ? undefined : onReloadDevices} />}
          />
          {devicesBusy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.lime} />
              <Text selectable style={styles.mutedText}>Загружаем устройства...</Text>
            </View>
          ) : null}
          {devicesError ? <Text selectable style={styles.formError}>{devicesError}</Text> : null}
          {warrantyError ? <Text selectable style={styles.formError}>{warrantyError}</Text> : null}
          {devices.length === 0 && !devicesBusy ? (
            <EmptyState icon="phone-portrait-outline" title="Устройств пока нет" text="Купленная техника появится здесь с гарантией." />
          ) : (
            devices.slice(0, 8).map((device) => (
              <DeviceCard
                key={device.imei}
                device={device}
                warrantyDraftActive={warrantyDraftImei === device.imei}
                warrantyProblem={warrantyProblem}
                warrantyBusy={warrantyBusy}
                onStartWarranty={() => onStartWarranty(device.imei)}
                onWarrantyProblem={onWarrantyProblem}
                onCancelWarranty={onCancelWarranty}
                onOpenWarranty={() => onOpenWarranty(device.imei)}
              />
            ))
          )}
        </View>
      ) : null}

      {session ? (
        <View style={styles.historyPanel}>
          <SectionTitle
            title="Поддержка"
            right={<GhostButton label="Обновить" icon="refresh-outline" onPress={ticketsBusy ? undefined : onReloadTickets} />}
          />
          <Field label="Тема" value={supportSubject} onChangeText={onSupportSubject} placeholder="Например: вопрос по заказу" />
          <Field label="Описание" value={supportBody} onChangeText={onSupportBody} placeholder="Детали обращения" />
          <View style={styles.priorityRail}>
            <GhostButton label="Обычный" icon="ellipse-outline" active={supportPriority === 'normal'} onPress={() => onSupportPriority('normal')} />
            <GhostButton label="Высокий" icon="alert-circle-outline" active={supportPriority === 'high'} onPress={() => onSupportPriority('high')} />
            <GhostButton label="Срочный" icon="flash-outline" active={supportPriority === 'urgent'} onPress={() => onSupportPriority('urgent')} />
          </View>
          {ticketsError ? <Text selectable style={styles.formError}>{ticketsError}</Text> : null}
          <PrimaryButton
            label={supportBusy ? 'Создаём...' : 'Создать тикет'}
            icon="chatbubble-ellipses-outline"
            disabled={supportBusy}
            onPress={onOpenSupportTicket}
          />
          {ticketsBusy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.lime} />
              <Text selectable style={styles.mutedText}>Загружаем тикеты...</Text>
            </View>
          ) : null}
          {tickets.length === 0 && !ticketsBusy ? (
            <EmptyState icon="chatbubbles-outline" title="Обращений нет" text="Создайте тикет, и он появится здесь со SLA." />
          ) : (
            tickets.slice(0, 8).map((ticket) => <SupportTicketCard key={ticket.id} ticket={ticket} />)
          )}
        </View>
      ) : null}

      {error ? <Text selectable style={styles.formError}>{error}</Text> : null}
      <View style={styles.accountMenu}>
        <GhostButton label="Бонусы" icon="gift-outline" />
        <GhostButton label="Адреса" icon="location-outline" />
        <GhostButton label="Поддержка" icon="chatbubbles-outline" />
      </View>
      <PrimaryButton label="Продолжить покупки" icon="grid-outline" onPress={onOpenCatalog} />
    </View>
  );
}

function OrderHistoryCard({ order }: { order: CustomerOrder }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const items = order.items.slice(0, 3).map((item) => item.sku).join(', ');
  return (
    <View style={styles.orderHistoryCard}>
      <View style={styles.orderHistoryHeader}>
        <View style={styles.orderHistoryTitleWrap}>
          <Text selectable style={styles.orderHistoryTitle}>#{shortId(order.id)}</Text>
          <Text selectable style={styles.orderHistoryDate}>{formatOrderDate(order.createdAt)}</Text>
        </View>
        <View style={styles.orderStatusPill}>
          <Text selectable numberOfLines={1} style={styles.orderStatusText}>{order.status}</Text>
        </View>
      </View>
      <Text selectable numberOfLines={2} style={styles.orderItemsText}>
        {items || 'Без товарных строк'} · {itemCount} шт.
      </Text>
      <View style={styles.orderHistoryFooter}>
        <Text selectable style={styles.orderChannelText}>{order.channel}</Text>
        <Text selectable style={styles.orderHistoryTotal}>{formatSom(order.total)}</Text>
      </View>
    </View>
  );
}

function DeviceCard({
  device,
  warrantyDraftActive,
  warrantyProblem,
  warrantyBusy,
  onStartWarranty,
  onWarrantyProblem,
  onCancelWarranty,
  onOpenWarranty,
}: {
  device: MyDevice;
  warrantyDraftActive: boolean;
  warrantyProblem: string;
  warrantyBusy: boolean;
  onStartWarranty: () => void;
  onWarrantyProblem: (next: string) => void;
  onCancelWarranty: () => void;
  onOpenWarranty: () => void;
}) {
  const warrantyLabel = device.warranty
    ? warrantyStatusLabel(device.warranty.status)
    : device.daysLeft != null
      ? `Гарантия · ${device.daysLeft} дн`
      : 'Гарантия';
  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceRow}>
        <View style={styles.deviceIcon}>
          <Ionicons name="phone-portrait-outline" size={22} color={theme.lime} />
        </View>
        <View style={styles.deviceCopy}>
          <Text selectable numberOfLines={2} style={styles.deviceTitle}>{device.product}</Text>
          <Text selectable numberOfLines={1} style={styles.deviceMeta}>IMEI {device.imei}</Text>
          <View style={styles.deviceFooter}>
            <Text selectable style={styles.deviceStatus}>{device.status}</Text>
            <Text selectable style={styles.deviceWarranty}>
              {device.warranty
                ? `SLA ${formatShortDate(device.warranty.sla)}`
                : device.warrantyUntil
                  ? `до ${formatShortDate(device.warrantyUntil)}`
                  : 'срок не задан'}
            </Text>
          </View>
        </View>
        <View style={[styles.warrantyPill, { borderColor: device.warranty ? theme.warn : theme.lime }]}>
          <Text selectable numberOfLines={1} style={[styles.warrantyPillText, { color: device.warranty ? theme.warn : theme.lime }]}>
            {warrantyLabel}
          </Text>
        </View>
      </View>
      {!device.warranty && !warrantyDraftActive ? (
        <GhostButton label="Заявить гарантию" icon="shield-checkmark-outline" onPress={onStartWarranty} />
      ) : null}
      {!device.warranty && warrantyDraftActive ? (
        <View style={styles.warrantyForm}>
          <Field label="Проблема" value={warrantyProblem} onChangeText={onWarrantyProblem} placeholder="Например: не держит зарядку" />
          <View style={styles.duo}>
            <PrimaryButton
              label={warrantyBusy ? 'Отправляем...' : 'Отправить'}
              icon="send-outline"
              disabled={warrantyBusy}
              onPress={onOpenWarranty}
            />
            <GhostButton label="Отмена" icon="close-outline" onPress={warrantyBusy ? undefined : onCancelWarranty} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SupportTicketCard({ ticket }: { ticket: SupportTicket }) {
  return (
    <View style={styles.ticketCard}>
      <View style={styles.orderHistoryHeader}>
        <View style={styles.orderHistoryTitleWrap}>
          <Text selectable numberOfLines={2} style={styles.ticketTitle}>{ticket.subject}</Text>
          <Text selectable style={styles.orderHistoryDate}>#{shortId(ticket.id)} · {formatShortDate(ticket.createdAt)}</Text>
        </View>
        <View style={[styles.warrantyPill, { borderColor: priorityColor(ticket.priority) }]}>
          <Text selectable numberOfLines={1} style={[styles.warrantyPillText, { color: priorityColor(ticket.priority) }]}>
            {priorityLabel(ticket.priority)}
          </Text>
        </View>
      </View>
      {ticket.body ? <Text selectable numberOfLines={2} style={styles.ticketBody}>{ticket.body}</Text> : null}
      <View style={styles.orderHistoryFooter}>
        <Text selectable style={styles.orderChannelText}>{ticket.status}</Text>
        <Text selectable style={styles.deviceWarranty}>SLA {formatShortDate(ticket.sla)}</Text>
      </View>
    </View>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileValue}>
      <Text selectable style={styles.profileLabel}>{label}</Text>
      <Text selectable numberOfLines={1} style={styles.profileText}>{value}</Text>
    </View>
  );
}

function ProductCard({
  product,
  favorite,
  onAdd,
  onFavorite,
}: {
  product: CatalogProduct;
  favorite: boolean;
  onAdd: () => void;
  onFavorite: () => void;
}) {
  return (
    <View style={styles.productCard}>
      <ProductPoster product={product} />
      <View style={styles.productCopy}>
        <Text selectable numberOfLines={2} style={styles.productName}>{product.name}</Text>
        <Text selectable style={styles.productStock}>{product.availableUnits > 0 ? `${product.availableUnits} в наличии` : 'Под заказ'}</Text>
        <Text selectable style={styles.productPrice}>{formatSom(product.price)}</Text>
      </View>
      <View style={styles.productActions}>
        <Pressable onPress={onFavorite} style={styles.iconButton}>
          <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={18} color={favorite ? theme.danger : theme.textSoft} />
        </Pressable>
        <Pressable onPress={onAdd} style={[styles.iconButton, styles.addButton]}>
          <Ionicons name="add" size={19} color={theme.limeInk} />
        </Pressable>
      </View>
    </View>
  );
}

function ListProduct({
  product,
  onAdd,
  onRemove,
}: {
  product: CatalogProduct;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.listProduct}>
      <ProductPoster product={product} compact />
      <View style={styles.listProductCopy}>
        <Text selectable numberOfLines={2} style={styles.cartLineTitle}>{product.name}</Text>
        <Text selectable style={styles.productPrice}>{formatSom(product.price)}</Text>
      </View>
      <View style={styles.listActions}>
        <Pressable onPress={onRemove} style={styles.iconButton}>
          <Ionicons name="heart" size={18} color={theme.danger} />
        </Pressable>
        <Pressable onPress={onAdd} style={[styles.iconButton, styles.addButton]}>
          <Ionicons name="add" size={18} color={theme.limeInk} />
        </Pressable>
      </View>
    </View>
  );
}

function ClientTabs({
  active,
  cartCount,
  favCount,
  onChange,
}: {
  active: ClientTab;
  cartCount: number;
  favCount: number;
  onChange: (next: ClientTab) => void;
}) {
  const tabs: Array<{ key: ClientTab; label: string; icon: keyof typeof Ionicons.glyphMap; badge?: number }> = [
    { key: 'home', label: 'Главная', icon: 'home-outline' },
    { key: 'catalog', label: 'Каталог', icon: 'grid-outline' },
    { key: 'favorites', label: 'Избранное', icon: 'heart-outline', badge: favCount },
    { key: 'cart', label: 'Корзина', icon: 'cart-outline', badge: cartCount },
    { key: 'account', label: 'Кабинет', icon: 'person-outline' },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable key={item.key} onPress={() => onChange(item.key)} style={styles.tabButton}>
            <View>
              <Ionicons name={item.icon} size={20} color={selected ? theme.lime : theme.muted} />
              {item.badge ? (
                <View style={styles.badge}>
                  <Text selectable style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text selectable numberOfLines={1} style={[styles.tabText, { color: selected ? theme.lime : theme.muted }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function QtyButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.qtyButton}>
      <Ionicons name={icon} color={theme.text} size={16} />
    </Pressable>
  );
}

function TotalRow({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text selectable style={[styles.totalLabel, strong ? styles.totalStrong : null]}>{label}</Text>
      <Text selectable style={[styles.totalValue, strong ? styles.totalStrong : null, accent ? styles.totalAccent : null]}>
        {value}
      </Text>
    </View>
  );
}

function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function phoneDigitCount(input: string): number {
  return input.replace(/\D/g, '').length;
}

function formatOrderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
}

function warrantyStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: 'Ремонт одобрен',
    closed: 'Закрыто',
    created: 'Обращение',
    diagnostics: 'Диагностика',
    received: 'В сервисе',
    rejected: 'Отклонено',
    repaired: 'Отремонтировано',
    replaced: 'Замена',
    waiting_supplier: 'Ждём поставщика',
  };
  return labels[status] ?? status;
}

function priorityLabel(priority: SupportPriority): string {
  if (priority === 'urgent') return 'Срочный';
  if (priority === 'high') return 'Высокий';
  return 'Обычный';
}

function priorityColor(priority: SupportPriority): string {
  if (priority === 'urgent') return theme.danger;
  if (priority === 'high') return theme.warn;
  return theme.lime;
}

async function restoreCustomerSession(stored: CustomerSession): Promise<CustomerSession | null> {
  try {
    const principal = await api.authMe(stored.accessToken);
    return {
      ...stored,
      customerId: principal.customerId,
      phone: principal.phone ?? stored.phone,
    };
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 401) return stored;
  }

  try {
    const tokens = await api.refreshCustomerSession(stored.refreshToken);
    const principal = await api.authMe(tokens.accessToken);
    const refreshed: CustomerSession = {
      ...tokens,
      customerId: principal.customerId,
      phone: principal.phone ?? stored.phone,
    };
    await saveCustomerSession(refreshed);
    return refreshed;
  } catch (cause) {
    if (cause instanceof ApiError && (cause.status === 400 || cause.status === 401)) {
      await clearCustomerSession();
      return null;
    }
    return stored;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 106,
    paddingHorizontal: 16,
  },
  block: {
    gap: 16,
  },
  hero: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 18,
    overflow: 'hidden',
    padding: 18,
  },
  heroCopy: {
    gap: 8,
  },
  heroKicker: {
    color: theme.lime,
    fontSize: 12,
    fontWeight: '800',
  },
  heroTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 10,
    width: '48%',
  },
  productCopy: {
    gap: 5,
    minHeight: 84,
  },
  productName: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  productStock: {
    color: theme.ok,
    fontSize: 11,
  },
  productPrice: {
    color: theme.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  productActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.cardAlt,
    borderColor: theme.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  addButton: {
    backgroundColor: theme.lime,
    borderColor: theme.lime,
    flex: 1,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  searchInput: {
    color: theme.text,
    flex: 1,
    fontSize: 15,
  },
  chipRail: {
    gap: 8,
    paddingRight: 16,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  mutedText: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: '#2B1613',
    borderColor: '#5B2A22',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  errorText: {
    color: theme.danger,
    flex: 1,
    fontSize: 12,
  },
  listProduct: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 11,
  },
  listProductCopy: {
    flex: 1,
    gap: 5,
  },
  listActions: {
    gap: 8,
  },
  cartLine: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 11,
  },
  cartLineCopy: {
    flex: 1,
    gap: 7,
  },
  cartLineTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  qtyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  qtyButton: {
    alignItems: 'center',
    backgroundColor: theme.cardAlt,
    borderColor: theme.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  qtyText: {
    color: theme.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    minWidth: 22,
    textAlign: 'center',
  },
  lineTotal: {
    color: theme.text,
    flex: 1,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    textAlign: 'right',
  },
  checkoutPanel: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 13,
    padding: 15,
  },
  duo: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldCaption: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentButton: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    width: '48%',
  },
  paymentText: {
    color: theme.textSoft,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  totalBox: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
    padding: 13,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: theme.muted,
    fontSize: 13,
  },
  totalValue: {
    color: theme.textSoft,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  totalStrong: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
  },
  totalAccent: {
    color: theme.lime,
  },
  totalDivider: {
    backgroundColor: theme.border,
    height: 1,
  },
  formError: {
    color: theme.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  accountCard: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  accountCopy: {
    flex: 1,
    gap: 4,
  },
  accountTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
  },
  authPanel: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 13,
    padding: 15,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  profileValue: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
    minWidth: '30%',
    padding: 11,
  },
  profileLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  profileText: {
    color: theme.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  devCodeText: {
    color: theme.warn,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  orderCard: {
    backgroundColor: theme.panel,
    borderColor: theme.lime,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  orderTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
  },
  orderTotal: {
    color: theme.lime,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  intentBox: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  intentTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '900',
  },
  intentUrl: {
    color: theme.blue,
    fontSize: 11,
    lineHeight: 16,
  },
  historyPanel: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  preferenceRow: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  preferenceCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  preferenceTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
  },
  toggleTrack: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 7,
    width: 78,
  },
  toggleThumb: {
    backgroundColor: theme.muted,
    borderRadius: radius.pill,
    height: 20,
    width: 20,
  },
  toggleThumbOn: {
    backgroundColor: theme.limeInk,
  },
  toggleText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  orderHistoryCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  orderHistoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  orderHistoryTitleWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  orderHistoryTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
  },
  orderHistoryDate: {
    color: theme.muted,
    fontSize: 11,
  },
  orderStatusPill: {
    backgroundColor: theme.cardAlt,
    borderColor: theme.lime,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 120,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  orderStatusText: {
    color: theme.lime,
    fontSize: 10,
    fontWeight: '900',
  },
  orderItemsText: {
    color: theme.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  orderHistoryFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderChannelText: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  orderHistoryTotal: {
    color: theme.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  deviceCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  deviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  deviceIcon: {
    alignItems: 'center',
    backgroundColor: theme.cardAlt,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  deviceCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  deviceTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  deviceMeta: {
    color: theme.muted,
    fontSize: 11,
  },
  deviceFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deviceStatus: {
    color: theme.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  deviceWarranty: {
    color: theme.muted,
    fontSize: 11,
  },
  warrantyPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 108,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  warrantyPillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  warrantyForm: {
    gap: 10,
  },
  priorityRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ticketCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  ticketTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  ticketBody: {
    color: theme.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  accountMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  tabs: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    bottom: 8,
    flexDirection: 'row',
    gap: 2,
    left: 12,
    padding: 8,
    position: 'absolute',
    right: 12,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    minHeight: 50,
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.coral,
    borderRadius: radius.pill,
    minWidth: 17,
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: 'absolute',
    right: -9,
    top: -7,
  },
  badgeText: {
    color: theme.text,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
});
