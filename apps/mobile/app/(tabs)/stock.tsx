import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatQty, type ItemKind } from '@quanto/core';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { listItems, type ItemRow } from '@/db/repo';
import { AppText, Badge, Button, Chip, ChipRow, EmptyState, Screen, Segmented } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

export default function StockScreen() {
  const palette = usePalette();
  const router = useRouter();
  const sync = useSync();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ItemKind | 'all'>('all');

  const reload = useCallback(
    () => setItems(listItems({ query, kind: kind === 'all' ? null : kind })),
    [query, kind],
  );

  useFocusReload(reload);
  useEffect(reload, [reload, sync.lastAt]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Screen padded>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="title">Estoque</AppText>
          <Pressable onPress={() => void sync.run()} hitSlop={12}>
            <Ionicons
              name={sync.running ? 'sync' : 'cloud-upload-outline'}
              size={22}
              color={sync.offline ? palette.warning : palette.primary}
            />
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: palette.card,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: palette.border,
            paddingHorizontal: spacing.md,
          }}
        >
          <Ionicons name="search-outline" size={18} color={palette.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar item, marca, categoria"
            placeholderTextColor={palette.textMuted}
            style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: palette.text }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Tudo' },
            { value: 'consumable', label: 'Consumível' },
            { value: 'durable', label: 'Durável' },
          ]}
        />

        {items.length === 0 ? (
          <View style={{ gap: spacing.md, paddingTop: spacing.xl }}>
            <EmptyState
              title={query ? 'Nada encontrado' : 'Catálogo vazio'}
              description={
                query
                  ? 'Tente outro termo ou limpe a busca.'
                  : 'Cadastre o primeiro item: arroz, furadeira, sabão, projetor...'
              }
            />
            {!query ? (
              <Button title="Cadastrar item" onPress={() => router.push('/item-form')} />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption">
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </AppText>

            {items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/item/${item.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  backgroundColor: palette.card,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: palette.border,
                  padding: spacing.md,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${palette.primary}18`,
                  }}
                >
                  <Ionicons
                    name={item.kind === 'durable' ? 'construct-outline' : 'cube-outline'}
                    size={18}
                    color={palette.primary}
                  />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <AppText>{item.name}</AppText>
                  <AppText variant="caption" numberOfLines={1}>
                    {[item.brand, item.categoryName, item.locationName].filter(Boolean).join(' · ') ||
                      'sem categoria'}
                  </AppText>
                </View>

                {item.kind === 'durable' ? (
                  <Badge
                    text={`${item.assetCount} ${item.assetCount === 1 ? 'un' : 'un'}`}
                    tone={item.assetCount > 0 ? 'neutral' : 'warning'}
                  />
                ) : (
                  <AppText variant="caption">
                    {item.minQty > 0 ? `mín ${formatQty(item.minQty, item.baseUnit)}` : '—'}
                  </AppText>
                )}

                <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        <ChipRow>
          <Chip label="Gerenciar categorias" onPress={() => router.push('/categories')} />
        </ChipRow>
      </Screen>

      <Pressable
        onPress={() => router.push('/item-form')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: spacing.lg,
          bottom: spacing.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.primary,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="add" size={28} color={palette.primaryText} />
      </Pressable>
    </View>
  );
}
