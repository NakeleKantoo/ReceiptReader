import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import {
  LABEL_PRESETS,
  buildAssetUri,
  buildItemUri,
  buildLocationUri,
  perSheet,
  presetFits,
} from '@quanto/core';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { listAssets, listItems, listLocations } from '@/db/repo';
import { buildSheetHtml, type LabelData } from '@/lib/labels-html';
import { AppText, Badge, Button, Card, Chip, ChipRow, EmptyState, Screen, SectionTitle } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

type Source = 'items' | 'assets' | 'locations';

type Candidate = LabelData & { id: string; hint?: string };

const A4_WIDTH_PX = (210 * 96) / 25.4;
const A4_HEIGHT_PX = (297 * 96) / 25.4;

export default function PrintScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const sync = useSync({ auto: false });

  const [source, setSource] = useState<Source>('items');
  const [presetId, setPresetId] = useState(LABEL_PRESETS[0]!.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const [preview, setPreview] = useState<{ html: string; pages: number; nonce: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useFocusReload(() => setTick((value) => value + 1));

  const preset = useMemo(
    () => LABEL_PRESETS.find((item) => item.id === presetId) ?? LABEL_PRESETS[0]!,
    [presetId],
  );

  const candidates = useMemo<Candidate[]>(() => {
    void tick;

    if (source === 'locations') {
      return listLocations().map((location) => ({
        id: location.id,
        uri: buildLocationUri(location.id),
        title: location.name,
        subtitle: 'local',
        code: location.name.slice(0, 3).toUpperCase() + location.id.slice(0, 4).toUpperCase(),
        hint: 'local',
      }));
    }

    if (source === 'assets') {
      const itemNames = new Map(listItems().map((item) => [item.id, item.name]));

      return listAssets().map((asset) => ({
        id: asset.id,
        uri: buildAssetUri(asset.publicId),
        title: asset.nickname || asset.serial || itemNames.get(asset.itemId) || 'Bem',
        subtitle: [itemNames.get(asset.itemId), asset.serial].filter(Boolean).join(' · ') || null,
        code: asset.publicId,
        hint: asset.serial ?? undefined,
      }));
    }

    return listItems().map((item) => ({
      id: item.id,
      uri: buildItemUri(item.publicId),
      title: item.name,
      subtitle: [item.brand, item.categoryName].filter(Boolean).join(' · ') || null,
      code: item.publicId,
      hint: item.categoryName ?? undefined,
    }));
  }, [source, tick]);

  useEffect(() => {
    setSelected(new Set());
  }, [source]);

  const chosen = useMemo(
    () => candidates.filter((candidate) => selected.has(candidate.id)),
    [candidates, selected],
  );

  // prévia: mesmo HTML da impressão, só com a primeira folha e escala
  useEffect(() => {
    let cancelled = false;

    if (chosen.length === 0) {
      setPreview(null);
      setReady(false);
      return;
    }

    setReady(false);
    const timer = setTimeout(() => {
      void buildSheetHtml(chosen, preset, { preview: true, maxPages: 1 })
        .then((result) => {
          if (cancelled) return;
          setPreview({ ...result, nonce: Date.now() });
          setReady(true);
        })
        .catch(() => {
          if (!cancelled) setReady(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chosen, preset]);

  const scale = Math.min(1, (width - spacing.lg * 2 - 4) / A4_WIDTH_PX);
  const previewHeight = Math.max(220, A4_HEIGHT_PX * scale);

  const print = async () => {
    setBusy(true);
    try {
      const { html } = await buildSheetHtml(chosen, preset);
      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert('Não deu para imprimir', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sharePdf = async () => {
    setBusy(true);
    try {
      const { html } = await buildSheetHtml(chosen, preset);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (error) {
      Alert.alert('Não deu para gerar o PDF', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fits = presetFits(preset);
  const capacity = perSheet(preset);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title">Etiquetas</AppText>
          <AppText variant="caption">
            {chosen.length} {chosen.length === 1 ? 'etiqueta' : 'etiquetas'} ·{' '}
            {Math.max(1, Math.ceil(chosen.length / capacity))} folha(s)
          </AppText>
        </View>
      </View>

      <Card>
        <SectionTitle>O que imprimir</SectionTitle>
        <ChipRow>
          <Chip label="Itens" active={source === 'items'} onPress={() => setSource('items')} />
          <Chip label="Bens" active={source === 'assets'} onPress={() => setSource('assets')} />
          <Chip label="Locais" active={source === 'locations'} onPress={() => setSource('locations')} />
        </ChipRow>

        <ChipRow>
          <Chip
            label={selected.size === candidates.length && candidates.length > 0 ? 'limpar' : 'todos'}
            onPress={() =>
              setSelected(
                selected.size === candidates.length
                  ? new Set()
                  : new Set(candidates.map((candidate) => candidate.id)),
              )
            }
          />
          <AppText variant="caption">
            {selected.size} de {candidates.length} selecionados
          </AppText>
        </ChipRow>

        {candidates.length === 0 ? (
          <EmptyState
            title="Nada para etiquetar"
            description={
              source === 'locations'
                ? 'Cadastre locais para gerar etiquetas de prateleira.'
                : 'Cadastre itens ou bens para gerar etiquetas.'
            }
          />
        ) : (
          <View style={{ maxHeight: 230 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {candidates.map((candidate) => {
                const active = selected.has(candidate.id);
                return (
                  <Pressable
                    key={candidate.id}
                    onPress={() => toggle(candidate.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 7,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? `${palette.primary}18` : palette.card,
                    }}
                  >
                    <Ionicons
                      name={active ? 'checkbox' : 'square-outline'}
                      size={15}
                      color={active ? palette.primary : palette.textMuted}
                    />
                    <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 190 }}>
                      {candidate.title}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle>Tamanho da etiqueta</SectionTitle>
        <ChipRow>
          {LABEL_PRESETS.map((option) => (
            <Chip
              key={option.id}
              label={option.name}
              active={preset.id === option.id}
              onPress={() => setPresetId(option.id)}
            />
          ))}
        </ChipRow>
        <AppText variant="caption">
          {capacity} por folha A4
          {preset.id === 'a4260' ? ' · descole ou corte nas guias' : ''}
        </AppText>
        {!fits ? <Badge text="não cabe na folha" tone="danger" /> : null}
      </Card>

      <Card>
        <SectionTitle
          action={
            preview ? (
              <AppText variant="caption">
                folha 1 de {Math.max(1, Math.ceil(chosen.length / capacity))}
              </AppText>
            ) : null
          }
        >
          Prévia
        </SectionTitle>

        {chosen.length === 0 ? (
          <AppText variant="caption">Selecione etiquetas para ver a prévia.</AppText>
        ) : !ready || !preview ? (
          <View style={{ height: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            <ActivityIndicator color={palette.primary} />
            <AppText variant="caption">gerando QR...</AppText>
          </View>
        ) : (
          <View style={{ height: previewHeight, overflow: 'hidden', borderRadius: radius.sm }}>
            <WebView
              key={preview.nonce}
              originWhitelist={['*']}
              source={{ html: preview.html }}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              scrollEnabled={false}
              javaScriptEnabled
            />
          </View>
        )}
      </Card>

      <Button
        title={chosen.length > capacity ? `Imprimir ${Math.ceil(chosen.length / capacity)} folhas` : 'Imprimir'}
        onPress={() => void print()}
        loading={busy}
        disabled={chosen.length === 0 || !fits}
      />
      <Button
        title="Compartilhar PDF"
        variant="secondary"
        onPress={() => void sharePdf()}
        disabled={chosen.length === 0 || !fits || busy}
      />
      <Button title="Voltar" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
