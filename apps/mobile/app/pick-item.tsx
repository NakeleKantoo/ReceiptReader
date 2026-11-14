import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatQty } from '@quanto/core';
import { useFocusReload } from '@/lib/useFocusReload';
import { listItems, stockFor, type ItemRow } from '@/db/repo';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

/**
 * Passo intermediário das ações rápidas da home: escolher o item e cair no
 * formulário de movimentação com o tipo já definido.
 */
export default function PickItemScreen() {
  const router = useRouter();
  const palette = usePalette();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = typeof params.type === 'string' ? params.type : 'consume';

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setItems(listItems({ query, kind: 'consumable' }));
  }, [query]);

  useFocusReload(() => setTick((value) => value + 1));
  useEffect(reload, [reload, tick]);

  const title = type === 'in' ? 'Dar entrada' : 'Usar item';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{title}</AppText>
          <AppText variant="caption">Escolha o item para registrar a movimentação</AppText>
        </View>
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
          placeholder="arroz, café, sabão"
          placeholderTextColor={palette.textMuted}
          style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: palette.text }}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {items.length === 0 ? (
        <EmptyState
          title={query ? 'Nada encontrado' : 'Nenhum consumível cadastrado'}
          description={
            query
              ? 'Tente outro termo.'
              : 'Só itens consumíveis têm saldo. Cadastre um item com tipo “consumível”.'
          }
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.replace(`/movement-form?itemId=${item.id}&type=${type}`)}
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
              <Ionicons
                name={type === 'in' ? 'add-circle-outline' : 'remove-circle-outline'}
                size={20}
                color={palette.primary}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText numberOfLines={1}>{item.name}</AppText>
                <AppText variant="caption" numberOfLines={1}>
                  {formatQty(stockFor(item.id).quantity, item.baseUnit)}
                  {item.minQty > 0 ? ` · mínimo ${formatQty(item.minQty, item.baseUnit)}` : ''}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      <Card>
        <AppText variant="caption">
          Item durável (ferramenta, eletrônico) não usa esta tela: use “Retirar” e “Devolver” na
          tela do bem.
        </AppText>
      </Card>
    </Screen>
  );
}
