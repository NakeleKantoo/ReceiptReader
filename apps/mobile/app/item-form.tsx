import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BASE_UNITS,
  type BaseUnitName,
  type ItemKind,
} from '@quanto/core';
import { useSync } from '@/lib/useSync';
import {
  addBarcode,
  createCategory,
  createItem,
  getItem,
  listCategories,
  listLocations,
  updateItem,
} from '@/db/repo';
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

const UNIT_OPTIONS: { value: BaseUnitName; label: string; hint: string }[] = [
  { value: 'un', label: 'un', hint: 'unidades (ferramenta, lata, pacote)' },
  { value: 'g', label: 'g', hint: 'peso (arroz, farinha) — pode digitar kg' },
  { value: 'ml', label: 'ml', hint: 'volume (leite, detergente) — pode digitar L' },
  { value: 'mm', label: 'mm', hint: 'comprimento (cabo, fio)' },
];

export default function ItemFormScreen() {
  const router = useRouter();
  const sync = useSync({ auto: false });
  const params = useLocalSearchParams<{ id?: string; barcode?: string; name?: string; brand?: string }>();
  const editingId = typeof params.id === 'string' && params.id ? params.id : null;
  const existing = editingId ? getItem(editingId) : null;

  const [categories, setCategories] = useState(listCategories());
  const [locations] = useState(listLocations());

  const scannedBarcode = typeof params.barcode === 'string' ? params.barcode : '';

  const [name, setName] = useState(existing?.name ?? (typeof params.name === 'string' ? params.name : ''));
  const [brand, setBrand] = useState(existing?.brand ?? (typeof params.brand === 'string' ? params.brand : ''));
  const [kind, setKind] = useState<ItemKind>(existing?.kind ?? 'consumable');
  const [baseUnit, setBaseUnit] = useState<BaseUnitName>(existing?.baseUnit ?? 'un');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [locationId, setLocationId] = useState<string | null>(existing?.defaultLocationId ?? null);
  const [minQty, setMinQty] = useState(existing?.minQty ? String(existing.minQty) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0;

  const addCategory = () => {
    if (!newCategory.trim()) return;
    createCategory(newCategory);
    const created = listCategories().find(
      (category) => category.name.toLowerCase() === newCategory.trim().toLowerCase(),
    );
    setCategories(listCategories());
    if (created) setCategoryId(created.id);
    setNewCategory('');
    setAddingCategory(false);
    void sync.run();
  };

  const submit = async () => {
    if (!canSave) return;

    const parsedMin = Number.parseInt(minQty.replace(/\D/g, ''), 10);

    try {
      const input = {
        name,
        brand,
        categoryId,
        kind,
        baseUnit,
        minQty: kind === 'consumable' && Number.isFinite(parsedMin) ? parsedMin : 0,
        defaultLocationId: locationId,
        notes,
      };

      if (editingId) {
        updateItem(editingId, input);
      } else {
        const created = createItem(input);
        // código que disparou o cadastro já entra na lista do item
        if (scannedBarcode) addBarcode(created.id, scannedBarcode);
      }

      void sync.run();
      router.back();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="title">{editingId ? 'Editar item' : 'Novo item'}</AppText>
      </View>

      <Card>
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Arroz tipo 1 5 kg"
          maxLength={80}
          autoFocus={!editingId}
        />

        {scannedBarcode ? (
          <AppText variant="caption">cadastrando a partir do código {scannedBarcode}</AppText>
        ) : null}
        <Field label="Marca" value={brand ?? ''} onChangeText={setBrand} placeholder="Tio João" maxLength={60} />

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Tipo</AppText>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'consumable', label: 'Consumível' },
              { value: 'durable', label: 'Durável' },
            ]}
          />
          <AppText variant="caption">
            {kind === 'durable'
              ? 'Cada unidade vira um bem com série, valor e histórico (furadeira, projetor).'
              : 'Some com o uso: controlado por quantidade e validade (arroz, sabão).'}
          </AppText>
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Unidade de controle</AppText>
          <Segmented
            value={baseUnit}
            onChange={setBaseUnit}
            options={BASE_UNITS.map((unit) => ({ value: unit, label: unit }))}
          />
          <AppText variant="caption">
            {UNIT_OPTIONS.find((option) => option.value === baseUnit)?.hint}
          </AppText>
        </View>

        {kind === 'consumable' ? (
          <Field
            label={`Estoque mínimo${baseUnit === 'un' ? '' : ` (em ${baseUnit})`}`}
            value={minQty}
            onChangeText={(value) => setMinQty(value.replace(/\D/g, ''))}
            placeholder="0"
            keyboardType="number-pad"
            hint="Abaixo disso o item entra na lista de compras."
          />
        ) : null}
      </Card>

      <Card>
        <SectionTitle
          action={
            <Button
              title={addingCategory ? 'Cancelar' : '+ nova'}
              variant="ghost"
              onPress={() => setAddingCategory((current) => !current)}
            />
          }
        >
          Categoria
        </SectionTitle>

        {addingCategory ? (
          <View style={{ gap: spacing.sm }}>
            <Field
              label="Nova categoria"
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="Mercearia"
              maxLength={80}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={addCategory}
            />
            <Button title="Criar e selecionar" variant="secondary" onPress={addCategory} />
          </View>
        ) : null}

        <ChipRow>
          <Chip label="nenhuma" active={categoryId === null} onPress={() => setCategoryId(null)} />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              active={categoryId === category.id}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
        </ChipRow>
      </Card>

      <Card>
        <SectionTitle>Onde fica</SectionTitle>
        {locations.length === 0 ? (
          <AppText variant="caption">
            Nenhum local cadastrado ainda — crie em Locais para poder escolher aqui.
          </AppText>
        ) : (
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
        )}
      </Card>

      <Card>
        <Field label="Observações" value={notes ?? ''} onChangeText={setNotes} multiline numberOfLines={3} />
      </Card>

      {error ? <AppText variant="caption" color="#B3261E">{error}</AppText> : null}

      <Button title={editingId ? 'Salvar' : 'Cadastrar'} onPress={() => void submit()} disabled={!canSave} />
      <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
