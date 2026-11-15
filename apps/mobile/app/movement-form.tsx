import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DISPLAY_UNITS,
  MOVEMENT_LABEL,
  formatQty,
  parseDecimal,
  toBaseQty,
  type BaseUnitName,
} from '@quanto/core';
import { useSync } from '@/lib/useSync';
import {
  adjustStock,
  getItem,
  listLocations,
  registerEntryWithLot,
  registerMovement,
  stockFor,
  transferStock,
  type MovementType,
} from '@/db/repo';
import { isValidDateString, maskDateInput } from '@/lib/format';
import {
  AppText,
  Button,
  Card,
  Chip,
  ChipRow,
  Field,
  Screen,
  SectionTitle,
  Segmented,
} from '@/components/ui';
import { spacing } from '@/theme';

type ActionType = 'in' | 'consume' | 'adjust' | 'discard' | 'transfer';

const ACTIONS: { value: ActionType; label: string }[] = [
  { value: 'in', label: 'Entrada' },
  { value: 'consume', label: 'Consumo' },
  { value: 'adjust', label: 'Ajuste' },
  { value: 'discard', label: 'Descarte' },
  { value: 'transfer', label: 'Transferir' },
];

export default function MovementFormScreen() {
  const router = useRouter();
  const sync = useSync({ auto: false });
  const params = useLocalSearchParams<{ itemId?: string; type?: string; assetId?: string }>();

  const itemId = String(params.itemId ?? '');
  const item = getItem(itemId);
  const assetId = typeof params.assetId === 'string' ? params.assetId : null;

  const initialType = ACTIONS.find((action) => action.value === params.type)?.value ?? 'in';
  const [action, setAction] = useState<ActionType>(initialType);
  const [amountText, setAmountText] = useState('');
  const [suffix, setSuffix] = useState<string>('');
  const [locationId, setLocationId] = useState<string | null>(item?.defaultLocationId ?? null);
  const [targetLocationId, setTargetLocationId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const locations = useMemo(() => listLocations(), []);
  const stock = useMemo(() => (item ? stockFor(item.id) : null), [item]);

  if (!item || !stock) {
    return (
      <Screen>
        <AppText variant="title">Item não encontrado</AppText>
        <Button title="Voltar" onPress={() => router.back()} />
      </Screen>
    );
  }

  const unit: BaseUnitName = item.baseUnit;
  const options = DISPLAY_UNITS[unit];
  const activeSuffix = suffix || options[0]!.suffix;
  const isCount = unit === 'un';
  const amount = toBaseQty(parseDecimal(amountText), unit, activeSuffix);

  const adjustDelta = action === 'adjust' ? amount - stock.quantity : 0;
  const needsTarget = action === 'transfer';

  const canSubmit =
    amountText.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    item.kind === 'consumable' &&
    (!needsTarget || (targetLocationId !== null && targetLocationId !== locationId));

  const submit = () => {
    try {
      if (action === 'adjust') {
        adjustStock({ itemId: item.id, counted: amount, locationId, note });
      } else if (action === 'transfer') {
        if (!locationId || !targetLocationId) throw new Error('Escolha origem e destino');
        transferStock({
          itemId: item.id,
          amount,
          fromLocationId: locationId,
          toLocationId: targetLocationId,
          note,
        });
      } else if (action === 'in') {
        if (expiresOn && !isValidDateString(expiresOn)) throw new Error('Validade inválida. Use AAAA-MM-DD.');
        registerEntryWithLot({ itemId: item.id, amount, expiresOn: expiresOn || null, locationId, note });
      } else {
        registerMovement({
          itemId: item.id,
          type: action as MovementType,
          amount,
          locationId,
          assetId,
          note,
        });
      }

      void sync.run();
      router.back();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{MOVEMENT_LABEL[action]}</AppText>
        <AppText variant="caption">{item.name}</AppText>
      </View>

      {item.kind === 'durable' ? (
        <Card>
          <AppText variant="subtitle">Bens não usam saldo</AppText>
          <AppText variant="caption">
            Cada unidade é um bem. Use “Retirar” e “Devolver” na tela do bem para registrar quem
            está com ele.
          </AppText>
          <Button title="Voltar" variant="secondary" onPress={() => router.back()} />
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>O que aconteceu</SectionTitle>
            <Segmented
              value={action}
              onChange={(value) => {
                setAction(value);
                setAmountText('');
                setError(null);
              }}
              options={ACTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />

            <AppText variant="caption">
              {action === 'in'
                ? 'Comprou ou ganhou: soma ao saldo.'
                : action === 'consume'
                  ? 'Usou: sai do saldo.'
                  : action === 'discard'
                    ? 'Jogou fora ou venceu: sai do saldo.'
                    : action === 'adjust'
                      ? 'Conte o que existe de verdade: o app calcula a diferença.'
                      : 'Move de um local para outro sem mudar o total.'}
            </AppText>
          </Card>

          <Card>
            <SectionTitle>
              {action === 'adjust' ? 'Quanto existe de verdade' : 'Quantidade'}
            </SectionTitle>

            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={action === 'adjust' ? 'Contado' : 'Quanto'}
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>

              {options.length > 1 ? (
                <View style={{ flexDirection: 'row', gap: spacing.xs, paddingBottom: 4 }}>
                  {options.map((option) => (
                    <Chip
                      key={option.suffix}
                      label={option.suffix}
                      active={activeSuffix === option.suffix}
                      onPress={() => setSuffix(option.suffix)}
                    />
                  ))}
                </View>
              ) : (
                <AppText variant="caption" style={{ paddingBottom: 14 }}>
                  {isCount ? 'un' : unit}
                </AppText>
              )}
            </View>

            <AppText variant="caption">
              saldo atual: {formatQty(stock.quantity, unit)}
              {action === 'adjust' && amountText
                ? ` · ajuste de ${adjustDelta >= 0 ? '+' : '−'}${formatQty(Math.abs(adjustDelta), unit)}`
                : ''}
            </AppText>
            {action === 'adjust' && adjustDelta === 0 ? (
              <AppText variant="caption">nada a ajustar</AppText>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>{needsTarget ? 'De onde para onde' : 'Onde'}</SectionTitle>
            <ChipRow>
              <Chip label="não definido" active={locationId === null} onPress={() => setLocationId(null)} />
              {locations.map((location) => (
                <Chip
                  key={location.id}
                  label={location.name}
                  active={locationId === location.id}
                  onPress={() => setLocationId(location.id)}
                />
              ))}
            </ChipRow>

            {needsTarget ? (
              <>
                <AppText variant="label">Para</AppText>
                <ChipRow>
                  {locations
                    .filter((location) => location.id !== locationId)
                    .map((location) => (
                      <Chip
                        key={location.id}
                        label={location.name}
                        active={targetLocationId === location.id}
                        onPress={() => setTargetLocationId(location.id)}
                      />
                    ))}
                </ChipRow>
                {locations.length < 2 ? (
                  <AppText variant="caption">Cadastre um segundo local para transferir.</AppText>
                ) : null}
              </>
            ) : null}
          </Card>

          {action === 'in' ? (
            <Card>
              <SectionTitle>Validade</SectionTitle>
              <Field
                label="Vence em (opcional)"
                value={expiresOn}
                onChangeText={(text) => setExpiresOn(maskDateInput(text))}
                placeholder="AAAA-MM-DD"
                keyboardType="number-pad"
                maxLength={10}
                hint="Com validade, a entrada vira um lote e o consumo segue a ordem de vencimento."
              />
            </Card>
          ) : null}

          <Card>
            <Field
              label="Observação"
              value={note}
              onChangeText={setNote}
              placeholder="mercado, presente, venceu..."
              maxLength={140}
            />
          </Card>

          {error ? (
            <AppText variant="caption" color="#B3261E">
              {error}
            </AppText>
          ) : null}

          <Button title="Registrar" onPress={submit} disabled={!canSubmit || (action === 'adjust' && adjustDelta === 0)} />
          <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
