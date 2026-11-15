import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { formatQty } from '@quanto/core';
import { useSync } from '@/lib/useSync';
import {
  addShopping,
  deleteShopping,
  listShopping,
  markPurchased,
  setShoppingDone,
  shoppingSuggestions,
  type ShoppingRow,
} from '@/db/repo';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

export default function ShoppingScreen() {
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync({ auto: false });

  const [rows, setRows] = useState<ShoppingRow[]>(listShopping);
  const [suggestions, setSuggestions] = useState(shoppingSuggestions);
  const [manual, setManual] = useState('');

  const reload = useCallback(() => {
    setRows(listShopping());
    setSuggestions(shoppingSuggestions());
  }, []);

  useFocusEffect(useCallback(() => reload(), [reload]));

  const checked = rows.filter((row) => row.doneAt !== null).length;

  const push = (action: () => void) => {
    action();
    reload();
    void sync.run();
  };

  const purchase = (row: ShoppingRow) => {
    if (!row.itemId) return;

    Alert.alert(
      'Comprei',
      `Dar entrada de ${row.qty > 0 ? formatQty(row.qty, row.unit) : '1'} em "${row.label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sim', onPress: () => push(() => markPurchased(row)) },
      ],
    );
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title">Lista de compras</AppText>
          <AppText variant="caption">
            {rows.length === 0
              ? 'lista vazia'
              : `${checked} de ${rows.length} marcados · ${rows.length - checked} para pegar`}
          </AppText>
        </View>
      </View>

      {suggestions.length > 0 ? (
        <Card>
          <SectionTitle action={<Badge text="abaixo do mínimo" tone="warning" />}>Faltando</SectionTitle>
          {suggestions.map((suggestion) => (
            <View
              key={suggestion.itemId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}
            >
              <Ionicons name="alert-circle-outline" size={16} color={palette.warning} />
              <View style={{ flex: 1 }}>
                <AppText numberOfLines={1}>{suggestion.name}</AppText>
                <AppText variant="caption">
                  faltam {formatQty(suggestion.missing, suggestion.unit)}
                </AppText>
              </View>
              <Chip
                label="adicionar"
                onPress={() =>
                  push(() =>
                    addShopping({ itemId: suggestion.itemId, qty: suggestion.missing }),
                  )
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Para comprar</SectionTitle>

        {rows.length === 0 ? (
          <EmptyState title="Lista vazia" description="Adicione um item ou use as sugestões acima." />
        ) : (
          rows.map((row) => {
            const isDone = row.doneAt !== null;

            return (
              <View
                key={row.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: isDone ? 'transparent' : palette.cardAlt,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  opacity: isDone ? 0.55 : 1,
                }}
              >
                {/* marcar é só estético: a linha continua na lista */}
                <Pressable onPress={() => push(() => setShoppingDone(row.id, !isDone))} hitSlop={8}>
                  <Ionicons
                    name={isDone ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={isDone ? palette.primary : palette.textMuted}
                  />
                </Pressable>

                <View style={{ flex: 1, gap: 1 }}>
                  <AppText
                    numberOfLines={1}
                    style={isDone ? { textDecorationLine: 'line-through' } : undefined}
                  >
                    {row.label}
                  </AppText>
                  {row.qty > 0 ? (
                    <AppText variant="caption">{formatQty(row.qty, row.unit)}</AppText>
                  ) : null}
                </View>

                {row.itemId && !isDone ? <Chip label="comprei" onPress={() => purchase(row)} /> : null}

                <Pressable onPress={() => push(() => deleteShopping(row.id))} hitSlop={8}>
                  <Ionicons name="close" size={18} color={palette.textMuted} />
                </Pressable>
              </View>
            );
          })
        )}

        <Divider />

        <Field
          label="Adicionar à mão"
          value={manual}
          onChangeText={setManual}
          placeholder="papel alumínio"
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!manual.trim()) return;
            push(() => addShopping({ label: manual }));
            setManual('');
          }}
        />
        <Button
          title="Adicionar"
          variant="secondary"
          disabled={!manual.trim()}
          onPress={() => {
            push(() => addShopping({ label: manual }));
            setManual('');
          }}
        />
      </Card>

      <Button title="Voltar" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
