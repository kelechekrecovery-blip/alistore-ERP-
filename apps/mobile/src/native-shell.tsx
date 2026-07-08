import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE, api } from '@mobile/api-client';
import { ClientScreen } from '@mobile/screens/client-screen';
import { StaffScreen } from '@mobile/screens/staff-screen';
import { BrandMark, GhostButton } from '@mobile/ui';
import { radius, theme } from '@mobile/theme';
import type { CatalogProduct } from '@mobile/types';

type Mode = 'client' | 'staff';

export function NativeShell() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('client');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => {
    const available = products.reduce((sum, product) => sum + product.availableUnits, 0);
    const categories = new Set(products.map((product) => product.category)).size;
    return { available, categories };
  }, [products]);

  async function loadCatalog(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    setCatalogError(null);
    try {
      const catalog = await api.catalog({ limit: 100 });
      setProducts(catalog.items);
      setCatalogState('ready');
    } catch (error) {
      setCatalogState('error');
      setCatalogError(error instanceof Error ? error.message : 'Каталог недоступен');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  const activeScreen = mode === 'client'
    ? (
      <ClientScreen
        products={products}
        catalogState={catalogState}
        catalogError={catalogError}
        refreshing={refreshing}
        onRefresh={() => loadCatalog(true)}
      />
    )
    : (
      <StaffScreen
        products={products}
        catalogState={catalogState}
        catalogError={catalogError}
        refreshing={refreshing}
        onRefresh={() => loadCatalog(true)}
      />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <BrandMark />
          <View style={styles.brandCopy}>
            <Text selectable style={styles.title}>AliStore Native</Text>
            <Text selectable numberOfLines={1} style={styles.subtitle}>
              iOS / Android · {products.length} SKU · {stats.available} шт.
            </Text>
          </View>
        </View>
        <View style={styles.apiPill}>
          {catalogState === 'loading' ? (
            <ActivityIndicator color={theme.lime} size="small" />
          ) : (
            <Ionicons
              name={catalogState === 'ready' ? 'checkmark-circle' : 'alert-circle'}
              size={15}
              color={catalogState === 'ready' ? theme.lime : theme.danger}
            />
          )}
          <Text selectable numberOfLines={1} style={styles.apiText}>
            {API_BASE.replace(/^https?:\/\//, '')}
          </Text>
        </View>
      </View>

      <View style={styles.modeSwitch}>
        <ModeButton
          label="Клиент"
          icon="phone-portrait-outline"
          active={mode === 'client'}
          onPress={() => setMode('client')}
        />
        <ModeButton
          label="Сотрудник POS"
          icon="storefront-outline"
          active={mode === 'staff'}
          onPress={() => setMode('staff')}
        />
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.signalRail}
        contentContainerStyle={styles.signalRailContent}
      >
        <GhostButton label={`${stats.categories || 0} категорий`} icon="grid-outline" />
        <GhostButton label="Native fetch" icon="cloud-done-outline" />
        <GhostButton label="Secure staff token" icon="shield-checkmark-outline" />
      </ScrollView>

      <View style={styles.screenWrap}>{activeScreen}</View>
    </View>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeButton, { backgroundColor: active ? theme.lime : theme.card, borderColor: active ? theme.lime : theme.border }]}
    >
      <Ionicons name={icon} size={18} color={active ? theme.limeInk : theme.textSoft} />
      <Text selectable style={[styles.modeButtonText, { color: active ? theme.limeInk : theme.textSoft }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.bg,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  brandRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    minWidth: 0,
  },
  brandCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    color: theme.text,
    fontSize: 19,
    fontWeight: '900',
  },
  subtitle: {
    color: theme.muted,
    fontSize: 12,
  },
  apiPill: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 142,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  apiText: {
    color: theme.textSoft,
    flexShrink: 1,
    fontSize: 10,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  signalRail: {
    flexGrow: 0,
    maxHeight: 48,
    paddingTop: 10,
  },
  signalRailContent: {
    gap: 8,
    paddingHorizontal: 16,
  },
  screenWrap: {
    flex: 1,
    paddingTop: 10,
  },
});
