import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Category } from '@quanto/core';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from '@/db/repo';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Field,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync({ auto: false });

  const [categories, setCategories] = useState<Category[]>(listCategories);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(() => setCategories(listCategories()), []);
  useFocusReload(reload);

  const reset = () => {
    setName('');
    setEditingId(null);
  };

  const submit = () => {
    if (!name.trim()) return;

    if (editingId) renameCategory(editingId, name);
    else createCategory(name);

    reset();
    reload();
    void sync.run();
  };

  const startEdit = (category: Category) => {
    setName(category.name);
    setEditingId(category.id);
  };

  const confirmDelete = (category: Category) => {
    Alert.alert(
      'Apagar categoria',
      `Apagar "${category.name}"? Os itens ficam sem categoria.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            deleteCategory(category.id);
            reload();
            void sync.run();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <AppText variant="title">Categorias</AppText>
      </View>

      <Card>
        <SectionTitle>{editingId ? 'Renomear' : 'Nova categoria'}</SectionTitle>
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Mercearia"
          maxLength={80}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <Button
          title={editingId ? 'Salvar' : 'Adicionar'}
          onPress={submit}
          disabled={!name.trim()}
        />
        {editingId ? <Button title="Cancelar" variant="ghost" onPress={reset} /> : null}
      </Card>

      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria"
          description="Categorias ajudam a filtrar o estoque: mercearia, limpeza, ferramentas..."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {categories.map((category) => (
            <View
              key={category.id}
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
              }}
            >
              <Ionicons name="pricetag-outline" size={16} color={palette.textMuted} />
              <AppText style={{ flex: 1 }}>{category.name}</AppText>
              {category.rev === 0 ? <AppText variant="caption">pendente</AppText> : null}
              <Pressable onPress={() => startEdit(category)} hitSlop={10}>
                <Ionicons name="create-outline" size={18} color={palette.textMuted} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(category)} hitSlop={10}>
                <Ionicons name="trash-outline" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
