import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ASSET_STATUS_LABEL,
  MOVEMENT_LABEL,
  expiryLabel,
  expiryTone,
  formatBRL,
  formatQty,
  type Asset,
} from '@quanto/core';
import { useSync } from '@/lib/useSync';
import {
  addAlias,
  addBarcode,
  deleteAsset,
  deleteItem,
  getItem,
  listAliases,
  listAssets,
  listBarcodes,
  listLocations,
  listLots,
  listMovements,
  lastPaidPrice,
  removeAlias,
  removeBarcode,
  revertMovement,
  registerMovement,
  stockFor,
  type AliasRow,
  type BarcodeRow,
  type ItemRow,
  type LotRow,
  type MovementRow,
} from '@/db/repo';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Divider,
  EmptyState,
  Field,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { MovementList } from '@/components/movements';
import { displayDate } from '@/lib/format';
import { radius, spacing, usePalette } from '@/theme';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="caption" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = String(id ?? '');
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync({ auto: false });

  const [item, setItem] = useState<ItemRow | null>(() => getItem(itemId));
  const [barcodes, setBarcodes] = useState<BarcodeRow[]>(() => listBarcodes(itemId));
  const [aliases, setAliases] = useState<AliasRow[]>(() => listAliases(itemId));
  const [assets, setAssets] = useState<Asset[]>(() => listAssets(itemId));
  const [movements, setMovements] = useState<MovementRow[]>(() => listMovements({ itemId, limit: 30 }));
  const [lots, setLots] = useState<LotRow[]>(() => listLots(itemId));
  const [locations] = useState(listLocations());
  const [newBarcode, setNewBarcode] = useState('');
  const [newAlias, setNewAlias] = useState('');

  const reload = useCallback(() => {
    setItem(getItem(itemId));
    setBarcodes(listBarcodes(itemId));
    setAliases(listAliases(itemId));
    setAssets(listAssets(itemId));
    setMovements(listMovements({ itemId, limit: 30 }));
    setLots(listLots(itemId));
  }, [itemId]);

  useFocusEffect(useCallback(() => reload(), [reload]));

  if (!item) {
    return (
      <Screen>
        <EmptyState title="Item não encontrado" description="Ele pode ter sido apagado em outro aparelho." />
        <Button title="Voltar" onPress={() => router.back()} />
      </Screen>
    );
  }

  const stock = stockFor(itemId);
  const paid = lastPaidPrice(itemId);
  const locationName = locations.find((location) => location.id === item.defaultLocationId)?.name ?? '—';
  const lowStock = item.kind === 'consumable' && item.minQty > 0 && stock.quantity <= item.minQty;

  const pushAndReload = (action: () => void) => {
    action();
    reload();
    void sync.run();
  };

  const confirmDelete = () => {
    Alert.alert('Apagar item', `Apagar "${item.name}" e seus bens?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deleteItem(item.id);
          void sync.run();
          router.back();
        },
      },
    ]);
  };

  const confirmRevert = (movement: MovementRow) => {
    Alert.alert(
      'Desfazer movimentação',
      `${MOVEMENT_LABEL[movement.type]} de ${formatQty(Math.abs(movement.delta), item.baseUnit)}. O histórico guarda as duas linhas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desfazer',
          style: 'destructive',
          onPress: () => {
            try {
              revertMovement(movement.id);
              reload();
              void sync.run();
            } catch (error) {
              Alert.alert('Não deu', (error as Error).message);
            }
          },
        },
      ],
    );
  };

  const goMovement = (type: string) =>
    router.push(`/movement-form?itemId=${item.id}&type=${type}`);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={2}>
            {item.name}
          </AppText>
          <AppText variant="caption">
            {[item.brand, item.categoryName].filter(Boolean).join(' · ') || 'sem marca'}
          </AppText>
        </View>
        <Badge
          text={item.kind === 'durable' ? 'durável' : 'consumível'}
          tone={item.kind === 'durable' ? 'success' : 'neutral'}
        />
      </View>

      <Card>
        <SectionTitle
          action={
            lowStock ? <Badge text="abaixo do mínimo" tone="warning" /> : <AppText variant="caption">{locationName}</AppText>
          }
        >
          {item.kind === 'durable' ? 'Unidades' : 'Saldo'}
        </SectionTitle>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <AppText variant="title">
            {item.kind === 'durable' ? String(stock.quantity) : formatQty(stock.quantity, item.baseUnit)}
          </AppText>
          {item.kind === 'durable' ? <AppText variant="caption">bens</AppText> : null}
        </View>

        {item.kind === 'consumable' && item.minQty > 0 ? (
          <AppText variant="caption">mínimo {formatQty(item.minQty, item.baseUnit)}</AppText>
        ) : null}

        {stock.byLocation.length > 1 ? (
          <View style={{ gap: 2 }}>
            {stock.byLocation.map((entry) => (
              <InfoRow
                key={entry.locationId ?? 'sem-local'}
                label={entry.locationName ?? 'sem local'}
                value={
                  item.kind === 'durable'
                    ? `${entry.quantity}`
                    : formatQty(entry.quantity, item.baseUnit)
                }
              />
            ))}
          </View>
        ) : null}

        {item.kind === 'consumable' ? (
          <ChipRow>
            <Chip label="+ entrada" onPress={() => goMovement('in')} />
            <Chip label="− consumo" onPress={() => goMovement('consume')} />
            <Chip label="ajustar" onPress={() => goMovement('adjust')} />
            <Chip label="descartar" onPress={() => goMovement('discard')} />
            <Chip label="transferir" onPress={() => goMovement('transfer')} />
          </ChipRow>
        ) : (
          <Button
            title="Adicionar unidade"
            variant="secondary"
            onPress={() => router.push(`/asset-form?itemId=${item.id}`)}
          />
        )}
      </Card>

      <Card>
        <SectionTitle>Resumo</SectionTitle>
        <InfoRow label="Unidade" value={item.baseUnit} />
        <InfoRow label="Local padrão" value={locationName} />
        <InfoRow label="Código" value={item.publicId} />
        <InfoRow
          label="Valor dos bens"
          value={formatBRL(assets.reduce((total, asset) => total + asset.valueCents, 0))}
        />
        {paid ? (
          <InfoRow label="Último preço pago" value={formatBRL(paid.priceCents)} />
        ) : null}
        {item.notes ? <InfoRow label="Observações" value={item.notes} /> : null}
        {item.rev === 0 ? <AppText variant="caption">alterações não sincronizadas</AppText> : null}
      </Card>

      {item.kind === 'consumable' ? (
        <Card>
          <SectionTitle
            action={
              <Button
                title="+ com validade"
                variant="ghost"
                onPress={() => goMovement('in')}
              />
            }
          >
            Lotes e validade
          </SectionTitle>

          {lots.filter((lot) => lot.remaining > 0).length === 0 ? (
            <AppText variant="caption">
              Nenhum lote com saldo. Uma entrada com validade cria um lote, e o consumo passa a
              sair primeiro do que vence antes.
            </AppText>
          ) : (
            lots
              .filter((lot) => lot.remaining > 0)
              .map((lot) => {
                const tone = expiryTone(lot.expiresOn);
                return (
                  <View
                    key={lot.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      backgroundColor: palette.cardAlt,
                      borderRadius: radius.md,
                      padding: spacing.md,
                    }}
                  >
                    <Ionicons
                      name={tone === 'expired' ? 'alert-circle' : 'time-outline'}
                      size={16}
                      color={
                        tone === 'expired'
                          ? palette.danger
                          : tone === 'soon'
                            ? palette.warning
                            : palette.textMuted
                      }
                    />
                    <View style={{ flex: 1, gap: 1 }}>
                      <AppText variant="caption" style={{ fontWeight: '700' }}>
                        {expiryLabel(lot.expiresOn)}
                        {lot.expiresOn ? ` · ${displayDate(lot.expiresOn)}` : ''}
                      </AppText>
                      <AppText variant="caption">
                        restam {formatQty(lot.remaining, item.baseUnit)}
                      </AppText>
                    </View>
                    {tone === 'expired' ? (
                      <Chip
                        label="descartar"
                        onPress={() =>
                          Alert.alert(
                            'Descartar lote',
                            `Baixar ${formatQty(lot.remaining, item.baseUnit)} de "${item.name}"?`,
                            [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Descartar',
                                style: 'destructive',
                                onPress: () =>
                                  pushAndReload(() =>
                                    registerMovement({
                                      itemId: item.id,
                                      type: 'discard',
                                      amount: lot.remaining,
                                      lotId: lot.id,
                                      note: 'lote vencido',
                                    }),
                                  ),
                              },
                            ],
                          )
                        }
                      />
                    ) : null}
                  </View>
                );
              })
          )}
        </Card>
      ) : null}

      <Card>
        <SectionTitle action={<AppText variant="caption">{movements.length}</AppText>}>
          Histórico
        </SectionTitle>
        <MovementList
          movements={movements}
          unit={item.baseUnit}
          onRevert={confirmRevert}
          emptyText="Sem movimentações. Registre a primeira entrada para começar o saldo."
        />
      </Card>

      {item.kind === 'durable' ? (
        <Card>
          <SectionTitle
            action={
              <Button
                title="+ unidade"
                variant="ghost"
                onPress={() => router.push(`/asset-form?itemId=${item.id}`)}
              />
            }
          >
            Bens ({assets.length})
          </SectionTitle>

          {assets.length === 0 ? (
            <AppText variant="caption">
              Nenhuma unidade cadastrada. Cada furadeira, projetor ou chave é um bem separado, com
              série, valor e histórico próprios.
            </AppText>
          ) : (
            assets.map((asset) => (
              <Pressable
                key={asset.id}
                onPress={() => router.push(`/asset-form?id=${asset.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: palette.cardAlt,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="construct-outline" size={16} color={palette.textMuted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText numberOfLines={1}>
                    {asset.nickname || asset.serial || `Bem ${asset.publicId}`}
                  </AppText>
                  <AppText variant="caption">
                    {ASSET_STATUS_LABEL[asset.status]}
                    {asset.valueCents > 0 ? ` · ${formatBRL(asset.valueCents)}` : ''}
                  </AppText>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert('Apagar bem', 'Remover esta unidade?', [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Apagar',
                        style: 'destructive',
                        onPress: () => pushAndReload(() => deleteAsset(asset.id)),
                      },
                    ])
                  }
                  hitSlop={10}
                >
                  <Ionicons name="trash-outline" size={16} color={palette.textMuted} />
                </Pressable>
                <Ionicons name="chevron-forward" size={14} color={palette.textMuted} />
              </Pressable>
            ))
          )}
        </Card>
      ) : null}

      <Card>
        <SectionTitle action={<AppText variant="caption">{barcodes.length}</AppText>}>
          Códigos de barras
        </SectionTitle>
        {barcodes.length === 0 ? (
          <AppText variant="caption">Nenhum código. Use a aba Escanear para ler a embalagem.</AppText>
        ) : (
          barcodes.map((barcode) => (
            <View key={barcode.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="barcode-outline" size={16} color={palette.textMuted} />
              <AppText variant="mono" style={{ flex: 1, fontSize: 13 }} selectable>
                {barcode.barcode}
              </AppText>
              <Pressable onPress={() => pushAndReload(() => removeBarcode(barcode.id))} hitSlop={10}>
                <Ionicons name="close-circle-outline" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ))
        )}

        <Divider />
        <Field
          label="Adicionar código"
          value={newBarcode}
          onChangeText={setNewBarcode}
          placeholder="7891000315507"
          keyboardType="number-pad"
          autoCapitalize="none"
          maxLength={32}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!newBarcode.trim()) return;
            pushAndReload(() => addBarcode(item.id, newBarcode));
            setNewBarcode('');
          }}
        />
        <Button
          title="Adicionar"
          variant="secondary"
          disabled={!newBarcode.trim()}
          onPress={() => {
            pushAndReload(() => addBarcode(item.id, newBarcode));
            setNewBarcode('');
          }}
        />
      </Card>

      <Card>
        <SectionTitle>Nomes alternativos</SectionTitle>
        <AppText variant="caption">
          Como você chama esse item na vida real — a busca encontra por aqui também.
        </AppText>
        {aliases.map((alias) => (
          <View key={alias.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText style={{ flex: 1 }}>{alias.alias}</AppText>
            <Pressable onPress={() => pushAndReload(() => removeAlias(alias.id))} hitSlop={10}>
              <Ionicons name="close-circle-outline" size={18} color={palette.textMuted} />
            </Pressable>
          </View>
        ))}
        <Field
          label="Novo nome"
          value={newAlias}
          onChangeText={setNewAlias}
          placeholder="arroz branco"
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!newAlias.trim()) return;
            pushAndReload(() => addAlias(item.id, newAlias));
            setNewAlias('');
          }}
        />
        <Button
          title="Adicionar nome"
          variant="secondary"
          disabled={!newAlias.trim()}
          onPress={() => {
            pushAndReload(() => addAlias(item.id, newAlias));
            setNewAlias('');
          }}
        />
      </Card>

      <Button
        title="Mostrar etiqueta QR"
        variant="secondary"
        onPress={() => router.push(`/qr?type=item&id=${item.id}`)}
      />
      <Button title="Editar item" variant="secondary" onPress={() => router.push(`/item-form?id=${item.id}`)} />
      <Button title="Apagar item" variant="ghost" onPress={confirmDelete} />
    </Screen>
  );
}
