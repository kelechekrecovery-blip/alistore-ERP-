import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { productInitial } from '@mobile/format';
import { radius, theme } from '@mobile/theme';
import type { CatalogProduct } from '@mobile/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <View style={[styles.brandMark, { width: size, height: size, borderRadius: Math.round(size * 0.28) }]}>
      <Text style={[styles.brandText, { fontSize: Math.round(size * 0.5) }]}>A</Text>
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text selectable style={styles.sectionTitleText}>{title}</Text>
      {right}
    </View>
  );
}

export function Pill({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'danger' | 'warn';
}) {
  const color = tone === 'danger' ? theme.danger : tone === 'warn' ? theme.warn : theme.lime;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: active ? color : theme.border,
          backgroundColor: active ? color : theme.card,
        },
      ]}
    >
      <Text selectable style={[styles.pillText, { color: active ? theme.limeInk : theme.textSoft }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  danger,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: IconName;
  danger?: boolean;
}) {
  const activeColor = danger ? theme.danger : theme.lime;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.primaryButton,
        {
          backgroundColor: disabled ? theme.borderStrong : activeColor,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={disabled ? theme.muted2 : theme.limeInk} /> : null}
      <Text selectable style={[styles.primaryButtonText, { color: disabled ? theme.muted2 : theme.limeInk }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  icon,
  active,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.ghostButton, { borderColor: active ? theme.lime : theme.border }]}
    >
      {icon ? <Ionicons name={icon} size={17} color={active ? theme.lime : theme.textSoft} /> : null}
      <Text selectable style={[styles.ghostButtonText, { color: active ? theme.lime : theme.textSoft }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: ComponentProps<typeof TextInput>['keyboardType'];
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text selectable style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted2}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={styles.fieldInput}
      />
    </View>
  );
}

export function MetricCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={theme.lime} />
      <Text selectable style={styles.metricLabel}>{label}</Text>
      <Text selectable style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function ProductPoster({ product, compact }: { product: CatalogProduct; compact?: boolean }) {
  const palette = gradientFor(product.category);
  return (
    <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[
      styles.poster,
      { height: compact ? 72 : 118 },
    ]}>
      <View style={styles.posterBadge}>
        <Text selectable style={styles.posterBadgeText}>{product.category}</Text>
      </View>
      <Text selectable style={[styles.posterInitial, { fontSize: compact ? 28 : 46 }]}>
        {productInitial(product.name)}
      </Text>
    </LinearGradient>
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={30} color={theme.lime} />
      <Text selectable style={styles.emptyTitle}>{title}</Text>
      <Text selectable style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function gradientFor(category: string): [string, string] {
  const key = category.toLowerCase();
  if (key.includes('iphone') || key.includes('смартф')) return ['#393D42', '#16130F'];
  if (key.includes('audio') || key.includes('аудио')) return ['#3A2B36', '#16130F'];
  if (key.includes('watch') || key.includes('час')) return ['#223B35', '#16130F'];
  if (key.includes('laptop') || key.includes('ноут')) return ['#2A3446', '#16130F'];
  if (key.includes('acc') || key.includes('акс')) return ['#3D3025', '#16130F'];
  return ['#2A2A2E', '#16130F'];
}

const styles = StyleSheet.create({
  brandMark: {
    alignItems: 'center',
    backgroundColor: theme.coral,
    justifyContent: 'center',
  },
  brandText: {
    color: theme.text,
    fontWeight: '900',
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitleText: {
    color: theme.text,
    fontSize: 19,
    fontWeight: '800',
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  ghostButton: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ghostButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldWrap: {
    gap: 7,
  },
  fieldLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  fieldInput: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: theme.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  metric: {
    backgroundColor: theme.cardAlt,
    borderColor: theme.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 104,
    padding: 14,
  },
  metricLabel: {
    color: theme.muted,
    fontSize: 12,
  },
  metricValue: {
    color: theme.text,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  poster: {
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 11,
  },
  posterBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(14, 12, 10, 0.55)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  posterBadgeText: {
    color: theme.textSoft,
    fontSize: 10,
    fontWeight: '700',
  },
  posterInitial: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 9,
    padding: 24,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
