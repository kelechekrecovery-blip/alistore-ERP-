import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '@mobile/api-client';
import { formatSom, shortId } from '@mobile/format';
import { clearStaffSession, getStoredStaffSession, saveStaffSession } from '@mobile/secure-session';
import { radius, theme } from '@mobile/theme';
import { EmptyState, Field, GhostButton, Pill, PrimaryButton, ProductPoster, SectionTitle } from '@mobile/ui';
import type { CatalogProduct, PaymentMethod, PosSaleOutcome, QueueOrder, StaffLoginResult } from '@mobile/types';

type StaffTab = 'pos' | 'orders' | 'kpi';

interface StaffScreenProps {
  products: CatalogProduct[];
  catalogState: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSessionChange?: (session: StaffLoginResult | null) => void;
}

const paymentOptions: Array<{ method: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { method: 'cash', label: 'Наличные', icon: 'cash-outline' },
  { method: 'card', label: 'Карта', icon: 'card-outline' },
  { method: 'qr_mbank', label: 'MBank', icon: 'qr-code-outline' },
  { method: 'qr_odengi', label: 'O!Деньги', icon: 'phone-portrait-outline' },
  { method: 'bakai_pos', label: 'Bakai POS', icon: 'business-outline' },
  { method: 'installment', label: 'Рассрочка', icon: 'calendar-outline' },
];

const discountOptions = [0, 5, 10, 15];

export function StaffScreen({
  products,
  catalogState,
  catalogError,
  refreshing,
  onRefresh,
  onSessionChange,
}: StaffScreenProps) {
  const [session, setSession] = useState<StaffLoginResult | null>(null);
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState('seller');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<StaffTab>('pos');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState('Все');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [discountPct, setDiscountPct] = useState(0);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleResult, setSaleResult] = useState<PosSaleOutcome | null>(null);

  useEffect(() => {
    let mounted = true;
    getStoredStaffSession()
      .then((stored) => {
        if (mounted) {
          setSession(stored);
          onSessionChange?.(stored);
        }
      })
      .finally(() => {
        if (mounted) setBooting(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (session) void loadOrders(session);
  }, [session]);

  const categories = useMemo(() => ['Все', ...Array.from(new Set(products.map((product) => product.category))).slice(0, 8)], [products]);
  const visibleProducts = category === 'Все' ? products : products.filter((product) => product.category === category);
  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((item) => item.id === id);
        return product ? { product, qty } : null;
      })
      .filter((line): line is { product: CatalogProduct; qty: number } => Boolean(line));
  }, [cart, products]);
  const subtotal = cartLines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const total = Math.round(subtotal * (1 - discountPct / 100));

  async function login() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.staffLogin(username.trim(), password);
      await saveStaffSession(next);
      setSession(next);
      onSessionChange?.(next);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await clearStaffSession();
    setSession(null);
    onSessionChange?.(null);
    setOrders([]);
    setSaleResult(null);
  }

  async function loadOrders(current = session) {
    if (!current || ordersBusy) return;
    setOrdersBusy(true);
    setError(null);
    try {
      const queue = await api.fetchOrders('created', current.accessToken);
      setOrders(queue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Очередь заказов недоступна.');
    } finally {
      setOrdersBusy(false);
    }
  }

  function addToTicket(product: CatalogProduct) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setSaleResult(null);
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

  async function completeSale() {
    if (!session || cartLines.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setSaleResult(null);
    try {
      const result = await api.posSale({
        staffId: session.staffId,
        point: 'BISHKEK-1',
        discountPct,
        payments: [{ method, amount: total }],
        clientSaleId: `mobile-${session.staffId}-${Date.now()}`,
        lines: cartLines.map((line) => ({
          productId: line.product.id,
          sku: line.product.sku,
          price: line.product.price,
          qty: line.qty,
        })),
      }, session.accessToken);
      setSaleResult(result);
      if (!result.pendingApproval) {
        setCart({});
        setDiscountPct(0);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Продажа не проведена.');
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.lime} />
        <Text selectable style={styles.mutedText}>Проверяем staff-сессию...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.lime} />}
        contentContainerStyle={styles.loginScroll}
      >
        <View style={styles.loginCard}>
          <View style={styles.loginIcon}>
            <Ionicons name="storefront-outline" size={30} color={theme.lime} />
          </View>
          <Text selectable style={styles.loginTitle}>Вход сотрудника</Text>
          <Text selectable style={styles.loginText}>
            Native staff/POS использует JWT и хранит токен в SecureStore.
          </Text>
          <Field label="Логин" value={username} onChangeText={setUsername} placeholder="seller" />
          <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry placeholder="Пароль сотрудника" />
          {error ? <Text selectable style={styles.formError}>{error}</Text> : null}
          <PrimaryButton
            label={busy ? 'Входим...' : 'Войти'}
            icon="log-in-outline"
            disabled={busy}
            onPress={login}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.staffHeader}>
        <View style={styles.staffIdentity}>
          <View style={styles.avatar}>
            <Text selectable style={styles.avatarText}>{session.username.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.staffCopy}>
            <Text selectable style={styles.staffName}>{session.username}</Text>
            <Text selectable style={styles.mutedText}>{session.role} · {session.totpEnabled ? '2FA включена' : '2FA не включена'}</Text>
          </View>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color={theme.danger} />
        </Pressable>
      </View>

      <View style={styles.tabSwitch}>
        <StaffTabButton active={tab === 'pos'} icon="calculator-outline" label="POS" onPress={() => setTab('pos')} />
        <StaffTabButton active={tab === 'orders'} icon="cube-outline" label="Заказы" onPress={() => setTab('orders')} />
        <StaffTabButton active={tab === 'kpi'} icon="stats-chart-outline" label="KPI" onPress={() => setTab('kpi')} />
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing || ordersBusy} onRefresh={() => {
          onRefresh();
          void loadOrders();
        }} tintColor={theme.lime} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {catalogState === 'error' ? (
          <View style={styles.errorBox}>
            <Ionicons name="cloud-offline-outline" color={theme.danger} size={18} />
            <Text selectable style={styles.errorText}>{catalogError ?? 'Каталог недоступен'}</Text>
          </View>
        ) : null}

        {tab === 'pos' ? (
          <PosTab
            products={visibleProducts}
            categories={categories}
            category={category}
            cartLines={cartLines}
            method={method}
            discountPct={discountPct}
            subtotal={subtotal}
            total={total}
            busy={busy}
            error={error}
            saleResult={saleResult}
            onCategory={setCategory}
            onAdd={addToTicket}
            onQty={changeQty}
            onMethod={setMethod}
            onDiscount={setDiscountPct}
            onComplete={completeSale}
          />
        ) : null}

        {tab === 'orders' ? (
          <OrdersTab orders={orders} busy={ordersBusy} onReload={() => loadOrders()} />
        ) : null}

        {tab === 'kpi' ? (
          <KpiTab orders={orders} subtotal={subtotal} products={products} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function PosTab({
  products,
  categories,
  category,
  cartLines,
  method,
  discountPct,
  subtotal,
  total,
  busy,
  error,
  saleResult,
  onCategory,
  onAdd,
  onQty,
  onMethod,
  onDiscount,
  onComplete,
}: {
  products: CatalogProduct[];
  categories: string[];
  category: string;
  cartLines: Array<{ product: CatalogProduct; qty: number }>;
  method: PaymentMethod;
  discountPct: number;
  subtotal: number;
  total: number;
  busy: boolean;
  error: string | null;
  saleResult: PosSaleOutcome | null;
  onCategory: (next: string) => void;
  onAdd: (product: CatalogProduct) => void;
  onQty: (productId: string, delta: number) => void;
  onMethod: (next: PaymentMethod) => void;
  onDiscount: (next: number) => void;
  onComplete: () => void;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.shiftCard}>
        <Ionicons name="radio-button-on-outline" size={18} color={theme.lime} />
        <View style={styles.shiftCopy}>
          <Text selectable style={styles.shiftTitle}>Смена готова</Text>
          <Text selectable style={styles.mutedText}>Backend автоматически откроет смену при первой продаже.</Text>
        </View>
      </View>

      <SectionTitle title="Каталог POS" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
        {categories.map((item) => (
          <Pill key={item} label={item} active={item === category} onPress={() => onCategory(item)} />
        ))}
      </ScrollView>

      <View style={styles.posGrid}>
        {products.slice(0, 24).map((product) => (
          <Pressable key={product.id} onPress={() => onAdd(product)} style={styles.posProduct}>
            <ProductPoster product={product} compact />
            <Text selectable numberOfLines={2} style={styles.posProductName}>{product.name}</Text>
            <Text selectable style={styles.posProductPrice}>{formatSom(product.price)}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.ticket}>
        <SectionTitle title="Чек" right={<Text selectable style={styles.mutedText}>{cartLines.length} поз.</Text>} />
        {cartLines.length === 0 ? (
          <EmptyState icon="barcode-outline" title="Чек пустой" text="Тапните товар в каталоге или обновите каталог свайпом вниз." />
        ) : (
          <View style={styles.ticketLines}>
            {cartLines.map((line) => (
              <View key={line.product.id} style={styles.ticketLine}>
                <View style={styles.ticketCopy}>
                  <Text selectable numberOfLines={2} style={styles.ticketName}>{line.product.name}</Text>
                  <Text selectable style={styles.mutedText}>{line.product.sku}</Text>
                </View>
                <View style={styles.qtyControl}>
                  <QtyButton icon="remove" onPress={() => onQty(line.product.id, -1)} />
                  <Text selectable style={styles.qtyText}>{line.qty}</Text>
                  <QtyButton icon="add" onPress={() => onQty(line.product.id, 1)} />
                </View>
                <Text selectable style={styles.ticketTotal}>{formatSom(line.product.price * line.qty)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text selectable style={styles.caption}>Скидка</Text>
        <View style={styles.discountRail}>
          {discountOptions.map((pct) => (
            <Pill
              key={pct}
              label={`${pct}%`}
              active={pct === discountPct}
              tone={pct > 10 ? 'warn' : 'default'}
              onPress={() => onDiscount(pct)}
            />
          ))}
        </View>

        <Text selectable style={styles.caption}>Оплата</Text>
        <View style={styles.paymentGrid}>
          {paymentOptions.map((option) => (
            <Pressable
              key={option.method}
              onPress={() => onMethod(option.method)}
              style={[styles.paymentButton, { borderColor: method === option.method ? theme.lime : theme.border }]}
            >
              <Ionicons name={option.icon} size={18} color={method === option.method ? theme.lime : theme.textSoft} />
              <Text selectable numberOfLines={1} style={styles.paymentText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.totalBox}>
          <TotalRow label="Сумма" value={formatSom(subtotal)} />
          <TotalRow label="Скидка" value={`${discountPct}%`} accent={discountPct > 0} />
          <View style={styles.totalDivider} />
          <TotalRow label="Итого" value={formatSom(total)} strong />
        </View>

        {saleResult ? <SaleResultBox result={saleResult} /> : null}
        {error ? <Text selectable style={styles.formError}>{error}</Text> : null}
        <PrimaryButton
          label={busy ? 'Проводим...' : 'Провести продажу'}
          icon="checkmark-done-outline"
          disabled={busy || cartLines.length === 0}
          onPress={onComplete}
        />
      </View>
    </View>
  );
}

function OrdersTab({ orders, busy, onReload }: { orders: QueueOrder[]; busy: boolean; onReload: () => void }) {
  return (
    <View style={styles.block}>
      <SectionTitle title="Очередь заказов" right={<GhostButton label="Обновить" icon="refresh-outline" onPress={onReload} />} />
      {busy ? (
        <View style={styles.centerInline}>
          <ActivityIndicator color={theme.lime} />
          <Text selectable style={styles.mutedText}>Загружаем заказы...</Text>
        </View>
      ) : null}
      {orders.length === 0 && !busy ? (
        <EmptyState icon="cube-outline" title="Очередь пустая" text="Новые mobile/web заказы появятся здесь после checkout." />
      ) : null}
      {orders.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <Text selectable style={styles.orderTitle}>#{shortId(order.id)}</Text>
            <Text selectable style={styles.statusPill}>{order.status}</Text>
          </View>
          <Text selectable style={styles.mutedText}>{order.customer?.phone ?? 'Клиент без телефона'} · {order.channel}</Text>
          <Text selectable style={styles.orderTotal}>{formatSom(order.total)}</Text>
          <View style={styles.orderLines}>
            {order.items.slice(0, 3).map((item) => (
              <Text selectable key={`${order.id}-${item.sku}`} style={styles.orderLineText}>
                {item.qty} x {item.sku}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function KpiTab({ orders, subtotal, products }: { orders: QueueOrder[]; subtotal: number; products: CatalogProduct[] }) {
  const stock = products.reduce((sum, product) => sum + product.availableUnits, 0);
  return (
    <View style={styles.block}>
      <SectionTitle title="Задачи и KPI" />
      <View style={styles.kpiGrid}>
        <KpiCard icon="cube-outline" label="Новые заказы" value={String(orders.length)} />
        <KpiCard icon="cash-outline" label="Текущий чек" value={formatSom(subtotal)} />
        <KpiCard icon="layers-outline" label="Доступный остаток" value={`${stock} шт.`} />
        <KpiCard icon="shield-checkmark-outline" label="RBAC" value="server-side" />
      </View>
      <View style={styles.taskCard}>
        <Text selectable style={styles.taskTitle}>Операционные задачи</Text>
        {['Проверить новые заказы', 'Сверить оплату QR', 'Подготовить выдачу', 'Сделать фото закрытия смены'].map((task, index) => (
          <View key={task} style={styles.taskRow}>
            <View style={[styles.taskDot, { backgroundColor: index === 0 ? theme.lime : theme.borderStrong }]} />
            <Text selectable style={styles.taskText}>{task}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SaleResultBox({ result }: { result: PosSaleOutcome }) {
  if (result.pendingApproval) {
    return (
      <View style={[styles.resultBox, { borderColor: theme.warn }]}>
        <Ionicons name="alert-circle-outline" color={theme.warn} size={22} />
        <View style={styles.resultCopy}>
          <Text selectable style={styles.resultTitle}>Требуется approval</Text>
          <Text selectable style={styles.mutedText}>ID: {result.approvalId}</Text>
          <Text selectable style={styles.mutedText}>Причина: {result.reason ?? 'discount'}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.resultBox, { borderColor: theme.lime }]}>
      <Ionicons name="checkmark-circle-outline" color={theme.lime} size={22} />
      <View style={styles.resultCopy}>
        <Text selectable style={styles.resultTitle}>Продажа проведена</Text>
        <Text selectable style={styles.mutedText}>{result.receiptNo} · {result.status}</Text>
        <Text selectable style={styles.resultTotal}>{formatSom(result.total)}</Text>
      </View>
    </View>
  );
}

function StaffTabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.staffTab, { backgroundColor: active ? theme.lime : theme.card, borderColor: active ? theme.lime : theme.border }]}
    >
      <Ionicons name={icon} size={17} color={active ? theme.limeInk : theme.textSoft} />
      <Text selectable style={[styles.staffTabText, { color: active ? theme.limeInk : theme.textSoft }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function QtyButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.qtyButton}>
      <Ionicons name={icon} size={15} color={theme.text} />
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

function KpiCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Ionicons name={icon} size={18} color={theme.lime} />
      <Text selectable style={styles.kpiLabel}>{label}</Text>
      <Text selectable style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loginScroll: {
    paddingBottom: 42,
    paddingHorizontal: 16,
  },
  loginCard: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  loginIcon: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  loginTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
  },
  loginText: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  staffHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  staffIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    minWidth: 0,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: theme.coral,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarText: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
  },
  staffCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  staffName: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  staffTab: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 42,
  },
  staffTabText: {
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  block: {
    gap: 16,
  },
  shiftCard: {
    alignItems: 'center',
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  shiftCopy: {
    flex: 1,
    gap: 3,
  },
  shiftTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
  },
  chipRail: {
    gap: 8,
    paddingRight: 16,
  },
  posGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  posProduct: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    padding: 10,
    width: '31.5%',
  },
  posProductName: {
    color: theme.text,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    minHeight: 31,
  },
  posProductPrice: {
    color: theme.lime,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  ticket: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 13,
    padding: 15,
  },
  ticketLines: {
    gap: 10,
  },
  ticketLine: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    padding: 11,
  },
  ticketCopy: {
    gap: 3,
  },
  ticketName: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  qtyControl: {
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
    fontWeight: '900',
    minWidth: 22,
    textAlign: 'center',
  },
  ticketTotal: {
    color: theme.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    textAlign: 'right',
  },
  caption: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  discountRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    paddingHorizontal: 11,
    width: '48%',
  },
  paymentText: {
    color: theme.textSoft,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
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
  resultBox: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 12,
  },
  resultCopy: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
  },
  resultTotal: {
    color: theme.lime,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  orderCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  orderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
  },
  statusPill: {
    backgroundColor: 'rgba(198,255,61,0.12)',
    borderRadius: radius.sm,
    color: theme.lime,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  orderTotal: {
    color: theme.text,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  orderLines: {
    gap: 4,
  },
  orderLineText: {
    color: theme.muted,
    fontSize: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    minHeight: 106,
    padding: 13,
    width: '48%',
  },
  kpiLabel: {
    color: theme.muted,
    fontSize: 12,
  },
  kpiValue: {
    color: theme.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  taskCard: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  taskTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
  },
  taskRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  taskDot: {
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  taskText: {
    color: theme.textSoft,
    flex: 1,
    fontSize: 13,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  centerInline: {
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
  formError: {
    color: theme.danger,
    fontSize: 12,
    lineHeight: 18,
  },
});
