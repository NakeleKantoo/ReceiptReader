import { useCallback, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { ASSET_STATUS_LABEL, type Asset } from '@quanto/core';
import { displayDate } from '@/lib/format';
import { useSync } from '@/lib/useSync';
import {
  assetHolderLabel,
  checkinAsset,
  checkoutAsset,
  listAssets,
  listItems,
  openLoanFor,
  returnLoan,
  type LoanRow,
} from '@/db/repo';
import { AppText, Badge, Card, EmptyState, Screen, SectionTitle } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

type Row = {
  asset: Asset;
  itemName: string;
  holder: string | null;
  loan: LoanRow | null;
};

/**
 * Retirar e devolver em um toque. É a ação mais frequente de quem tem
 * ferramenta: pegou a furadeira, devolveu, pegou de novo.
 */
export default function AssetActionsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync({ auto: false });

  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');

  const reload = useCallback(() => {
    const names = new Map(listItems().map((item) => [item.id, item.name]));

    setRows(
      listAssets().map((asset) => ({
        asset,
        itemName: names.get(asset.itemId) ?? '',
        holder: assetHolderLabel(asset),
        loan: openLoanFor(asset.id),
      })),
    );
  }, []);

  useFocusEffect(useCallback(() => reload(), [reload]));

  const out = rows.filter((row) => row.holder !== null);
  const available = rows.filter((row) => row.holder === null);

  const filtered = (list: Row[]) => {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((row) =>
      `${row.asset.nickname ?? ''} ${row.asset.serial ?? ''} ${row.itemName} ${row.holder ?? ''}`
        .toLowerCase()
        .includes(term),
    );
  };

  const retire = (row: Row) => {
    checkoutAsset(row.asset.id);
    reload();
    void sync.run();
  };

  const giveBack = (row: Row) => {
    if (row.loan) returnLoan(row.loan.id);
    else checkinAsset(row.asset.id);
    reload();
    void sync.run();
  };

  const renderRow = (row: Row) => {
    const isOut = row.holder !== null;

    return (
      <View
        key={row.asset.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: isOut ? `${palette.warning}14` : palette.cardAlt,
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.push(`/asset-form?id=${row.asset.id}`)}
          style={{ flex: 1, gap: 1 }}
        >
          <AppText numberOfLines={1}>
            {row.asset.nickname || row.asset.serial || row.itemName}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {isOut
              ? `${row.loan ? 'emprestado para' : 'com'} ${row.holder}${row.loan?.dueOn ? ` · até ${displayDate(row.loan.dueOn)}` : ''}`
              : ASSET_STATUS_LABEL[row.asset.status]}
          </AppText>
        </Pressable>

        <Pressable
          onPress={() =>
            isOut
              ? giveBack(row)
              : Alert.alert('Retirar', `Registrar que você retirou "${row.asset.nickname || row.itemName}"?`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Retirar', onPress: () => retire(row) },
                ])
          }
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: isOut ? palette.primary : palette.card,
            borderWidth: 1,
            borderColor: isOut ? palette.primary : palette.border,
          }}
        >
          <AppText variant="caption" color={isOut ? palette.primaryText : palette.text} style={{ fontWeight: '700' }}>
            {isOut ? 'Devolver' : 'Retirar'}
          </AppText>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title">Retirar e devolver</AppText>
          <AppText variant="caption">Quem está com cada coisa, agora</AppText>
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
          placeholder="furadeira, projetor, alicate"
          placeholderTextColor={palette.textMuted}
          style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: palette.text }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum bem cadastrado"
          description="Cadastre um item durável e adicione unidades para poder retirar e devolver."
        />
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <SectionTitle action={<Badge text={`${out.length}`} tone={out.length > 0 ? 'warning' : 'neutral'} />}>
              Fora / em uso
            </SectionTitle>
            {filtered(out).length === 0 ? (
              <AppText variant="caption">Tudo guardado.</AppText>
            ) : (
              filtered(out).map(renderRow)
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionTitle action={<AppText variant="caption">{available.length}</AppText>}>
              Disponíveis
            </SectionTitle>
            {filtered(available).length === 0 ? (
              <AppText variant="caption">Nada encontrado.</AppText>
            ) : (
              filtered(available).map(renderRow)
            )}
          </View>
        </>
      )}

      <Card>
        <AppText variant="caption">
          Para emprestar para alguém de fora (com prazo), abra o bem e use “Emprestar”.
        </AppText>
      </Card>
    </Screen>
  );
}
