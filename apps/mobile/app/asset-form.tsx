import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ASSET_STATUS_LABEL,
  formatBRL,
  parseBRL,
  type AssetStatus,
} from '@quanto/core';
import { useSync } from '@/lib/useSync';
import {
  createAsset,
  getAsset,
  getItem,
  listLocations,
  updateAsset,
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

const STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: 'available', label: ASSET_STATUS_LABEL.available },
  { value: 'in_use', label: ASSET_STATUS_LABEL.in_use },
  { value: 'maintenance', label: ASSET_STATUS_LABEL.maintenance },
  { value: 'lost', label: ASSET_STATUS_LABEL.lost },
  { value: 'disposed', label: ASSET_STATUS_LABEL.disposed },
];

export default function AssetFormScreen() {
  const router = useRouter();
  const sync = useSync({ auto: false });
  const params = useLocalSearchParams<{ id?: string; itemId?: string }>();

  const editingId = typeof params.id === 'string' && params.id ? params.id : null;
  const existing = editingId ? getAsset(editingId) : null;
  const itemId =
    existing?.itemId ?? (typeof params.itemId === 'string' ? params.itemId : '');
  const item = itemId ? getItem(itemId) : null;

  const [locations] = useState(listLocations());
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [serial, setSerial] = useState(existing?.serial ?? '');
  const [locationId, setLocationId] = useState<string | null>(existing?.locationId ?? null);
  const [status, setStatus] = useState<AssetStatus>(existing?.status ?? 'available');
  const [acquiredOn, setAcquiredOn] = useState(existing?.acquiredOn ?? '');
  const [value, setValue] = useState(
    existing?.valueCents ? formatBRL(existing.valueCents).replace('R$', '').trim() : '',
  );
  const [warrantyUntil, setWarrantyUntil] = useState(existing?.warrantyUntil ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  if (!item) {
    return (
      <Screen>
        <AppText variant="title">Bem não encontrado</AppText>
        <Button title="Voltar" onPress={() => router.back()} />
      </Screen>
    );
  }

  const submit = () => {
    if (!isValidDateString(acquiredOn || null)) {
      setError('Data de compra inválida. Use AAAA-MM-DD.');
      return;
    }
    if (!isValidDateString(warrantyUntil || null)) {
      setError('Data de garantia inválida. Use AAAA-MM-DD.');
      return;
    }

    const patch = {
      nickname,
      serial,
      locationId,
      status,
      acquiredOn: acquiredOn || null,
      valueCents: parseBRL(value),
      warrantyUntil: warrantyUntil || null,
      notes,
    };

    if (editingId) updateAsset(editingId, patch);
    else createAsset({ itemId: item.id, ...patch });

    void sync.run();
    router.back();
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{editingId ? 'Editar bem' : 'Nova unidade'}</AppText>
        <AppText variant="caption">{item.name}</AppText>
      </View>

      <Card>
        <Field
          label="Apelido"
          value={nickname ?? ''}
          onChangeText={setNickname}
          placeholder="Furadeira da garagem"
          maxLength={60}
          autoFocus={!editingId}
        />
        <Field
          label="Número de série"
          value={serial ?? ''}
          onChangeText={setSerial}
          placeholder="opcional"
          autoCapitalize="characters"
          maxLength={60}
        />

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Situação</AppText>
          <ChipRow>
            {STATUS_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={status === option.value}
                onPress={() => setStatus(option.value)}
              />
            ))}
          </ChipRow>
        </View>
      </Card>

      <Card>
        <SectionTitle>Onde está</SectionTitle>
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
      </Card>

      <Card>
        <SectionTitle>Compra e garantia</SectionTitle>
        <Field
          label="Comprado em"
          value={acquiredOn ?? ''}
          onChangeText={(text) => setAcquiredOn(maskDateInput(text))}
          placeholder="AAAA-MM-DD"
          keyboardType="number-pad"
          maxLength={10}
        />
        <Field
          label="Valor pago"
          value={value}
          onChangeText={setValue}
          placeholder="0,00"
          keyboardType="decimal-pad"
          hint={parseBRL(value) > 0 ? formatBRL(parseBRL(value)) : undefined}
        />
        <Field
          label="Garantia até"
          value={warrantyUntil ?? ''}
          onChangeText={(text) => setWarrantyUntil(maskDateInput(text))}
          placeholder="AAAA-MM-DD"
          keyboardType="number-pad"
          maxLength={10}
        />
        <Field label="Observações" value={notes ?? ''} onChangeText={setNotes} multiline />
      </Card>

      {error ? (
        <AppText variant="caption" color="#B3261E">
          {error}
        </AppText>
      ) : null}

      <Button title={editingId ? 'Salvar' : 'Adicionar unidade'} onPress={submit} />
      <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
