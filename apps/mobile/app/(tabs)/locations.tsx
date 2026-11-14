import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Location } from '@quanto/core';
import { useAuth } from '@/lib/auth';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { createLocation, deleteLocation, listLocations } from '@/db/queries';
import { AppText, Badge, Button, Card, EmptyState, Field, Screen } from '@/components/ui';
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
  const { state } = useAuth();
  const palette = usePalette();
  const sync = useSync();

  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => setLocations(listLocations()), []);
  useFocusReload(reload);
  useEffect(reload, [reload, sync.lastAt]);

  const tree = useMemo(() => buildTree(locations), [locations]);

  const submit = async () => {
    if (!name.trim() || state.status !== 'authenticated') return;

    setSaving(true);
    try {
      createLocation({
        householdId: state.session.user.householdId,
        name,
        parentId,
      });
      setName('');
      setParentId(null);
      reload();
      void sync.run();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (location: Location) => {
    Alert.alert('Apagar local', `Apagar "${location.name}"?`, [
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

      <Card>
        <AppText variant="subtitle">Novo local</AppText>
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Despensa"
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />

        {locations.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">Dentro de</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Chip label="Nada (raiz)" active={parentId === null} onPress={() => setParentId(null)} />
              {tree.map(({ location, depth }) => (
                <Chip
                  key={location.id}
                  label={`${'·'.repeat(depth)}${depth > 0 ? ' ' : ''}${location.name}`}
                  active={parentId === location.id}
                  onPress={() => setParentId(location.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Button
          title="Adicionar"
          onPress={() => void submit()}
          loading={saving}
          disabled={!name.trim()}
        />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="subtitle">Sua casa</AppText>
          <Badge text={`${locations.length}`} />
        </View>

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
                {location.rev === 0 ? (
                  <AppText variant="caption">não sincronizado</AppText>
                ) : null}
              </View>
              <Pressable onPress={() => confirmDelete(location)} hitSlop={12}>
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? palette.primary : palette.border,
        backgroundColor: active ? `${palette.primary}18` : palette.card,
      }}
    >
      <AppText variant="caption" color={active ? palette.primary : palette.text}>
        {label}
      </AppText>
    </Pressable>
  );
}
