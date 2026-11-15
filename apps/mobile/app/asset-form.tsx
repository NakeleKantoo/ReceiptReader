import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ASSET_STATUS_LABEL,
  daysUntil,
  expiryLabel,
  formatBRL,
  parseBRL,
  type AssetStatus,
} from '@quanto/core';
import { useSync } from '@/lib/useSync';
import {
  checkinAsset,
  checkoutAsset,
  createAsset,
  createLoan,
  createMaintenance,
  deleteMaintenance,
  getAsset,
  getItem,
  listLocations,
  listMaintenance,
  listMembers,
  listMovements,
  openLoanFor,
  returnLoan,
  revertMovement,
  updateAsset,
  type MaintenanceRow,
  type MovementRow,
} from '@/db/repo';
import { MovementList } from '@/components/movements';
import { displayDate, isValidDateString, maskDateInput } from '@/lib/format';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Divider,
  Field,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { spacing, usePalette } from '@/theme';

const STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: 'available', label: ASSET_STATUS_LABEL.available },
  { value: 'in_use', label: ASSET_STATUS_LABEL.in_use },
  { value: 'maintenance', label: ASSET_STATUS_LABEL.maintenance },
  { value: 'lost', label: ASSET_STATUS_LABEL.lost },
  { value: 'disposed', label: ASSET_STATUS_LABEL.disposed },
];

export default function AssetFormScreen() {
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync({ auto: false });
  const params = useLocalSearchParams<{ id?: string; itemId?: string }>();

  const editingId = typeof params.id === 'string' && params.id ? params.id : null;
  const existing = editingId ? getAsset(editingId) : null;
  const itemId = existing?.itemId ?? (typeof params.itemId === 'string' ? params.itemId : '');
  const item = itemId ? getItem(itemId) : null;

  const [locations] = useState(listLocations());
  const [members] = useState(listMembers);

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

  const [movements, setMovements] = useState<MovementRow[]>(() =>
    existing ? listMovements({ assetId: existing.id, limit: 20 }) : [],
  );
  const [maintenanceRows, setMaintenanceRows] = useState<MaintenanceRow[]>(() =>
    existing ? listMaintenance(existing.id) : [],
  );
  const loan = existing ? openLoanFor(existing.id) : null;

  // empréstimo
  const [borrowerUserId, setBorrowerUserId] = useState<string | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [dueOn, setDueOn] = useState('');

  // manutenção
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintenanceKind, setMaintenanceKind] = useState('');
  const [maintenanceDone, setMaintenanceDone] = useState('');
  const [maintenanceNext, setMaintenanceNext] = useState('');
  const [maintenanceCost, setMaintenanceCost] = useState('');
  const [maintenanceProvider, setMaintenanceProvider] = useState('');

  const reloadDetails = () => {
    if (!existing) return;
    setMovements(listMovements({ assetId: existing.id, limit: 20 }));
    setMaintenanceRows(listMaintenance(existing.id));
  };

  if (!item) {
    return (
      <Screen>
        <AppText variant="title">Bem não encontrado</AppText>
        <Button title="Voltar" onPress={() => router.back()} />
      </Screen>
    );
  }

  const warrantyDays = daysUntil(warrantyUntil || null);
  const warrantyWarn = warrantyDays !== null && warrantyDays <= 30;

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

  const lend = () => {
    if (!editingId) return;
    if (!borrowerUserId && !borrowerName.trim()) {
      Alert.alert('Para quem?', 'Escolha uma pessoa da casa ou digite um nome.');
      return;
    }
    if (dueOn && !isValidDateString(dueOn)) {
      Alert.alert('Data inválida', 'Use AAAA-MM-DD para a devolução prevista.');
      return;
    }

    try {
      createLoan({
        assetId: editingId,
        borrowerUserId,
        borrowerName: borrowerUserId ? null : borrowerName.trim(),
        dueOn: dueOn || null,
      });
      reloadDetails();
      setStatus('loaned');
      setBorrowerName('');
      setBorrowerUserId(null);
      setDueOn('');
      void sync.run();
    } catch (caught) {
      Alert.alert('Não deu', (caught as Error).message);
    }
  };

  const addMaintenance = () => {
    if (!editingId) return;
    if (maintenanceNext && !isValidDateString(maintenanceNext)) {
      Alert.alert('Data inválida', 'Use AAAA-MM-DD na próxima manutenção.');
      return;
    }

    createMaintenance({
      assetId: editingId,
      kind: maintenanceKind,
      doneOn: maintenanceDone || null,
      nextOn: maintenanceNext || null,
      costCents: parseBRL(maintenanceCost),
      provider: maintenanceProvider,
    });

    reloadDetails();
    setShowMaintenance(false);
    setMaintenanceKind('');
    setMaintenanceDone('');
    setMaintenanceNext('');
    setMaintenanceCost('');
    setMaintenanceProvider('');
    void sync.run();
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{editingId ? 'Editar bem' : 'Nova unidade'}</AppText>
        <AppText variant="caption">{item.name}</AppText>
      </View>

      {existing ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          <Badge text={ASSET_STATUS_LABEL[status]} tone={status === 'available' ? 'success' : 'warning'} />
          {loan ? <Badge text={`com ${loan.borrowerLabel}`} tone="warning" /> : null}
          {warrantyWarn ? (
            <Badge
              text={expiryLabel(warrantyUntil || null)}
              tone={warrantyDays !== null && warrantyDays < 0 ? 'danger' : 'warning'}
            />
          ) : null}
        </View>
      ) : null}

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
          hint={warrantyWarn ? expiryLabel(warrantyUntil || null) : undefined}
        />
        <Field label="Observações" value={notes ?? ''} onChangeText={setNotes} multiline />
      </Card>

      {editingId ? (
        <>
          <Card>
            <SectionTitle>Empréstimo</SectionTitle>

            {loan ? (
              <View style={{ gap: spacing.sm }}>
                <AppText>
                  Emprestado para <AppText style={{ fontWeight: '700' }}>{loan.borrowerLabel}</AppText>
                </AppText>
                <AppText variant="caption">
                  {loan.dueOn
                    ? `devolução prevista ${displayDate(loan.dueOn)} · ${expiryLabel(loan.dueOn)}`
                    : 'sem prazo definido'}
                </AppText>
                <Button
                  title="Devolvido"
                  onPress={() => {
                    returnLoan(loan.id);
                    reloadDetails();
                    setStatus('available');
                    void sync.run();
                  }}
                />
              </View>
            ) : (
              <>
                <AppText variant="label">Para quem</AppText>
                <ChipRow>
                  {members.map((member) => (
                    <Chip
                      key={member.id}
                      label={member.name}
                      active={borrowerUserId === member.id}
                      onPress={() => {
                        setBorrowerUserId(borrowerUserId === member.id ? null : member.id);
                        setBorrowerName('');
                      }}
                    />
                  ))}
                  <Chip
                    label="outra pessoa"
                    active={borrowerUserId === null && borrowerName.length > 0}
                    onPress={() => setBorrowerUserId(null)}
                  />
                </ChipRow>

                {borrowerUserId === null ? (
                  <Field
                    label="Nome de quem levou"
                    value={borrowerName}
                    onChangeText={setBorrowerName}
                    placeholder="vizinho, irmã..."
                    maxLength={60}
                  />
                ) : null}

                <Field
                  label="Devolver até"
                  value={dueOn}
                  onChangeText={(text) => setDueOn(maskDateInput(text))}
                  placeholder="AAAA-MM-DD"
                  keyboardType="number-pad"
                  maxLength={10}
                  hint={dueOn ? expiryLabel(dueOn) : 'opcional'}
                />

                <Button title="Emprestar" onPress={lend} />
              </>
            )}
          </Card>

          <Card>
            <SectionTitle
              action={
                <Button
                  title={showMaintenance ? 'Cancelar' : '+ registrar'}
                  variant="ghost"
                  onPress={() => setShowMaintenance((current) => !current)}
                />
              }
            >
              Manutenção
            </SectionTitle>

            {maintenanceRows.length === 0 ? (
              <AppText variant="caption">Nenhuma manutenção registrada.</AppText>
            ) : (
              maintenanceRows.map((row) => (
                <View
                  key={row.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}
                >
                  <Ionicons name="build-outline" size={16} color={palette.textMuted} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={{ fontWeight: '700' }}>
                      {row.kind || 'manutenção'} · {displayDate(row.doneOn)}
                    </AppText>
                    <AppText variant="caption">
                      {row.costCents > 0 ? formatBRL(row.costCents) : 'sem custo'}
                      {row.nextOn ? ` · próxima ${displayDate(row.nextOn)} (${expiryLabel(row.nextOn)})` : ''}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert('Apagar', 'Remover este registro de manutenção?', [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Apagar',
                          style: 'destructive',
                          onPress: () => {
                            deleteMaintenance(row.id);
                            reloadDetails();
                            void sync.run();
                          },
                        },
                      ])
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color={palette.textMuted} />
                  </Pressable>
                </View>
              ))
            )}

            {showMaintenance ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <Divider />
                <Field
                  label="O que foi feito"
                  value={maintenanceKind}
                  onChangeText={setMaintenanceKind}
                  placeholder="troca de escova"
                  maxLength={60}
                />
                <Field
                  label="Feito em"
                  value={maintenanceDone}
                  onChangeText={(text) => setMaintenanceDone(maskDateInput(text))}
                  placeholder="AAAA-MM-DD (hoje)"
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <Field
                  label="Próxima em"
                  value={maintenanceNext}
                  onChangeText={(text) => setMaintenanceNext(maskDateInput(text))}
                  placeholder="AAAA-MM-DD"
                  keyboardType="number-pad"
                  maxLength={10}
                  hint="O app avisa quando chegar perto."
                />
                <Field
                  label="Custo"
                  value={maintenanceCost}
                  onChangeText={setMaintenanceCost}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Quem fez"
                  value={maintenanceProvider}
                  onChangeText={setMaintenanceProvider}
                  placeholder="oficina, eu mesmo"
                  maxLength={60}
                />
                <Button title="Registrar manutenção" variant="secondary" onPress={addMaintenance} />
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>Quem está com ele agora</SectionTitle>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                title="Retirar"
                style={{ flex: 1 }}
                variant={status === 'in_use' ? 'ghost' : 'primary'}
                onPress={() => {
                  checkoutAsset(editingId);
                  reloadDetails();
                  setStatus('in_use');
                  void sync.run();
                }}
              />
              <Button
                title="Devolver"
                style={{ flex: 1 }}
                variant="secondary"
                onPress={() => {
                  if (loan) returnLoan(loan.id);
                  else checkinAsset(editingId, locationId);
                  reloadDetails();
                  setStatus('available');
                  void sync.run();
                }}
              />
            </View>

            <Divider />
            <SectionTitle>Histórico do bem</SectionTitle>
            <MovementList
              movements={movements}
              unit="un"
              emptyText="Sem retiradas registradas."
              onRevert={(movement) => {
                revertMovement(movement.id);
                reloadDetails();
                void sync.run();
              }}
            />
          </Card>
        </>
      ) : null}

      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : null}

      <Button title={editingId ? 'Salvar' : 'Adicionar unidade'} onPress={submit} />
      <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
