import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Location } from '@quanto/core';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { createLocation, deleteLocation, listLocations, renameLocation } from '@/db/repo';
import { AppText, Button, Card, Chip, ChipRow, EmptyState, Field, Screen, SectionTitle, Segmented } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

type TreeRow = { location: Location; depth: number };

function buildTree(locations: Location[]): TreeRow[] {
  const byParent = new Map<string | null, Location[]>();
  for (const location of locations) {
    const key = location.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), location]);
  }

  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const location of byParent.get(parentId) ?? []) {
      rows.push({ location, depth });
      walk(location.id, depth + 1);
    }
  };

  walk(null, 0);

  // órfãos (pai apagado) aparecem no fim, para não sumirem silenciosamente
  const seen = new Set(rows.map((row) => row.location.id));
  for (const location of locations) {
    if (!seen.has(location.id)) rows.push({ location, depth: 0 });
  }

  return rows;
}

export default function LocationsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const sync = useSync();

  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => setLocations(listLocations()), []);
  useFocusReload(reload);
  useEffect(reload, [reload, sync.lastAt]);

  const tree = useMemo(() => buildTree(locations), [locations]);

  const resetForm = () => {
    setName('');
    setParentId(null);
    setEditingId(null);
    setShowForm(false);
  };

  const submit = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editingId) {
        renameLocation(editingId, name);
      } else {
        createLocation({ name, parentId });
      }
      resetForm();
      reload();
      void sync.run();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (location: Location) => {
    setName(location.name);
    setParentId(location.parentId);
    setEditingId(location.id);
    setShowForm(true);
  };

  const confirmDelete = (location: Location) => {
    Alert.alert('Apagar local', `Apagar "${location.name}"? Os itens continuam existindo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deleteLocation(location.id);
          reload();
          void sync.run();
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="title">Locais</AppText>
        <Pressable onPress={() => void sync.run()} hitSlop={12}>
          <Ionicons
            name={sync.running ? 'sync' : 'cloud-upload-outline'}
            size={22}
            color={sync.offline ? palette.warning : palette.primary}
          />
        </Pressable>
      </View>

      {!showForm ? (
        <Button
          title="Novo local"
          onPress={() => {
            resetForm();
            setShowForm(true);
          }}
        />
      ) : (
        <Card>
          <SectionTitle>{editingId ? 'Renomear local' : 'Novo local'}</SectionTitle>

          <Field
            label="Nome"
            value={name}
            onChangeText={setName}
            placeholder="Despensa"
            maxLength={80}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />

          {!editingId && tree.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label">Dentro de</AppText>
              <ChipRow>
                <Chip label="Nada (raiz)" active={parentId === null} onPress={() => setParentId(null)} />
                {tree.map(({ location, depth }) => (
                  <Chip
                    key={location.id}
                    label={`${'·'.repeat(depth)}${depth > 0 ? ' ' : ''}${location.name}`}
                    active={parentId === location.id}
                    onPress={() => setParentId(location.id)}
                  />
                ))}
              </ChipRow>
            </View>
          ) : null}

          <Button
            title={editingId ? 'Salvar' : 'Adicionar'}
            onPress={() => void submit()}
            loading={saving}
            disabled={!name.trim()}
          />
          <Button title="Cancelar" variant="ghost" onPress={resetForm} />
        </Card>
      )}

      <View style={{ gap: spacing.sm }}>
        <SectionTitle action={<AppText variant="caption">{locations.length}</AppText>}>
          Sua casa
        </SectionTitle>

        {tree.length === 0 ? (
          <EmptyState
            title="Nenhum local ainda"
            description="Comece pela despensa, cozinha, garagem ou caixa de ferramentas."
          />
        ) : (
          tree.map(({ location, depth }) => (
            <View
              key={location.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                backgroundColor: palette.card,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: palette.border,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                marginLeft: depth * spacing.lg,
              }}
            >
              <Ionicons name="location-outline" size={18} color={palette.textMuted} />
              <View style={{ flex: 1 }}>
                <AppText>{location.name}</AppText>
                {location.rev === 0 ? <AppText variant="caption">não sincronizado</AppText> : null}
              </View>
              <Pressable
                onPress={() => router.push(`/qr?type=location&id=${location.id}`)}
                hitSlop={10}
              >
                <Ionicons name="qr-code-outline" size={18} color={palette.textMuted} />
              </Pressable>
              <Pressable onPress={() => startEdit(location)} hitSlop={10}>
                <Ionicons name="create-outline" size={18} color={palette.textMuted} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(location)} hitSlop={10}>
                <Ionicons name="trash-outline" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      {sync.offline ? (
        <AppText variant="caption" color={palette.warning}>
          Sem conexão: as alterações ficam no aparelho e sobem no próximo sync.
        </AppText>
      ) : null}
    </Screen>
  );
}
