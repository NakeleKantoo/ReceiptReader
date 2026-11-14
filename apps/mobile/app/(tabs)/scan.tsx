import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { ASSET_STATUS_LABEL, formatBRL } from '@quanto/core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSync } from '@/lib/useSync';
import { addBarcode, listItems, type ItemRow } from '@/db/repo';
import { lookupProduct, type ProductInfo } from '@/lib/openfoodfacts';
import { normalizeScannedCode, resolveScan, type ResolvedScan } from '@/lib/scan';
import { AppText, Badge, Button, Card, Field, Screen } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'codabar',
  'qr',
  'datamatrix',
  'pdf417',
  'aztec',
] as const;

const DEBOUNCE_MS = 1500;

export default function ScanScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sync = useSync({ auto: false });
  const [permission, requestPermission] = useCameraPermissions();
  const beepPlayer = useAudioPlayer(require('../../assets/beep.wav'));

  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<ResolvedScan | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [candidates, setCandidates] = useState<ItemRow[]>([]);
  const [linkedTo, setLinkedTo] = useState<string | null>(null);

  const lastScan = useRef<{ code: string; at: number } | null>(null);

  // sair da aba desmonta a câmera: sem sensor ligado à toa
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const feedback = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      void beepPlayer.seekTo(0).then(() => beepPlayer.play()).catch(() => {});
    } catch {
      // sem áudio: o haptic e o visual já avisam
    }
  }, [beepPlayer]);

  const handleCode = useCallback(
    (raw: string) => {
      const code = normalizeScannedCode(raw);
      if (!code) return;

      const now = Date.now();
      if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < DEBOUNCE_MS) {
        return;
      }
      lastScan.current = { code, at: now };

      feedback();
      setLinkedTo(null);
      setLinkQuery('');
      setCandidates([]);
      setProduct(null);

      const resolved = resolveScan(code);
      setResult(resolved);
      setSessionCount((count) => count + 1);

      if (resolved.kind === 'unknown' && /^\d{8,14}$/.test(code)) {
        setLookingUp(true);
        void lookupProduct(code)
          .then((info) => setProduct(info))
          .finally(() => setLookingUp(false));
      }
    },
    [feedback],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (result) return;
      handleCode(data);
    },
    [handleCode, result],
  );

  const reset = () => {
    setResult(null);
    setProduct(null);
    setLookingUp(false);
    setLinkQuery('');
    setCandidates([]);
    setLinkedTo(null);
    lastScan.current = null;
  };

  useEffect(() => {
    if (linkQuery.trim().length === 0) {
      setCandidates([]);
      return;
    }
    setCandidates(listItems({ query: linkQuery }).slice(0, 6));
  }, [linkQuery]);

  // ─────────────────────────────────────── permissão

  if (!permission) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <AppText variant="title">Escanear</AppText>
        <Card>
          <AppText variant="subtitle">Precisamos da câmera</AppText>
          <AppText variant="caption">
            A câmera lê códigos de barras dos produtos e as etiquetas QR dos seus itens e locais.
            Nada é enviado para fora do aparelho.
          </AppText>
          {permission.canAskAgain ? (
            <Button title="Permitir câmera" onPress={() => void requestPermission()} />
          ) : (
            <Button title="Abrir configurações" onPress={() => void Linking.openSettings()} />
          )}
        </Card>
      </Screen>
    );
  }

  const isUnknown = result?.kind === 'unknown';
  const unknownCode = result?.kind === 'unknown' ? result.code : '';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {focused ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={result ? undefined : onBarcodeScanned}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">
            câmera pausada
          </AppText>
        </View>
      )}

      {/* moldura */}
      <View pointerEvents="none" style={{ ...StyleSheetAbsoluteFill, justifyContent: 'center', alignItems: 'center' }}>
        <View
          style={{
            width: 250,
            height: 190,
            borderRadius: radius.lg,
            borderWidth: 2,
            borderColor: result ? palette.primary : 'rgba(255,255,255,0.85)',
          }}
        />
        <AppText variant="caption" color="#FFFFFF" style={{ marginTop: spacing.md }}>
          {result ? 'lido' : 'aponte para o código'}
        </AppText>
        {sessionCount > 0 ? (
          <AppText variant="caption" color="rgba(255,255,255,0.7)">
            {sessionCount} {sessionCount === 1 ? 'código lido' : 'códigos lidos'} nesta sessão
          </AppText>
        ) : null}
      </View>

      {/* controles */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          right: spacing.lg,
          flexDirection: 'row',
          gap: spacing.sm,
        }}
      >
        <RoundButton icon={torch ? 'flash' : 'flash-off'} onPress={() => setTorch((value) => !value)} />
        <RoundButton icon="keypad-outline" onPress={() => setManual((value) => !value)} />
      </View>

      {manual ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + 90,
            backgroundColor: 'rgba(0,0,0,0.8)',
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <AppText variant="caption" color="#FFFFFF">
            Digite o código ou use um leitor USB/Bluetooth
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="7891000315507"
              placeholderTextColor="rgba(255,255,255,0.5)"
              keyboardType="number-pad"
              autoFocus
              onSubmitEditing={() => {
                if (!manualCode.trim()) return;
                handleCode(manualCode);
                setManualCode('');
              }}
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: radius.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: 10,
                color: '#FFFFFF',
                fontSize: 16,
              }}
            />
            <Pressable
              onPress={() => {
                if (!manualCode.trim()) return;
                handleCode(manualCode);
                setManualCode('');
              }}
              style={{
                backgroundColor: palette.primary,
                borderRadius: radius.sm,
                paddingHorizontal: spacing.lg,
                justifyContent: 'center',
              }}
            >
              <AppText color={palette.primaryText}>OK</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={Boolean(result)} transparent animationType="slide" onRequestClose={reset}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View
            style={{
              backgroundColor: palette.bg,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              padding: spacing.lg,
              paddingBottom: insets.bottom + spacing.lg,
              gap: spacing.md,
              maxHeight: '80%',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="subtitle">
                {result?.kind === 'item'
                  ? 'Item encontrado'
                  : result?.kind === 'asset'
                    ? 'Bem encontrado'
                    : result?.kind === 'location'
                      ? 'Local'
                      : 'Código desconhecido'}
              </AppText>
              <Pressable onPress={reset} hitSlop={12}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
              {result?.kind === 'item' ? (
                <Card>
                  <AppText variant="subtitle">{result.item.name}</AppText>
                  <AppText variant="caption">
                    {[result.item.brand, result.item.categoryName].filter(Boolean).join(' · ') ||
                      'sem marca'}
                  </AppText>
                  <AppText variant="mono" style={{ fontSize: 12 }} selectable>
                    {result.code}
                  </AppText>
                </Card>
              ) : null}

              {result?.kind === 'asset' ? (
                <Card>
                  <AppText variant="subtitle">
                    {result.asset.nickname || result.asset.serial || 'Bem sem apelido'}
                  </AppText>
                  <AppText variant="caption">
                    {ASSET_STATUS_LABEL[result.asset.status]}
                    {result.asset.valueCents > 0 ? ` · ${formatBRL(result.asset.valueCents)}` : ''}
                  </AppText>
                  {result.asset.serial ? (
                    <AppText variant="caption">série {result.asset.serial}</AppText>
                  ) : null}
                </Card>
              ) : null}

              {result?.kind === 'location' ? (
                <Card>
                  <AppText variant="subtitle">{result.location.name}</AppText>
                  <AppText variant="caption">
                    Contagem por local chega na F3, junto com as movimentações de estoque.
                  </AppText>
                </Card>
              ) : null}

              {isUnknown ? (
                <>
                  <Card>
                    <AppText variant="mono" selectable style={{ fontSize: 16 }}>
                      {unknownCode}
                    </AppText>

                    {lookingUp ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <ActivityIndicator color={palette.primary} />
                        <AppText variant="caption">Consultando banco de produtos...</AppText>
                      </View>
                    ) : product ? (
                      <View style={{ gap: 2 }}>
                        <AppText>{product.name ?? 'produto sem nome'}</AppText>
                        <AppText variant="caption">
                          {[product.brand, product.quantity].filter(Boolean).join(' · ') ||
                            'OpenFoodFacts'}
                        </AppText>
                      </View>
                    ) : (
                      <AppText variant="caption">
                        Não achei esse código no catálogo nem no banco de produtos.
                      </AppText>
                    )}
                  </Card>

                  <Button
                    title={product?.name ? 'Cadastrar com esses dados' : 'Cadastrar item'}
                    onPress={() => {
                      const params = new URLSearchParams({ barcode: unknownCode });
                      if (product?.name) params.set('name', product.name);
                      if (product?.brand) params.set('brand', product.brand);
                      reset();
                      router.push(`/item-form?${params.toString()}`);
                    }}
                  />

                  <Card>
                    <AppText variant="label">Já tenho esse item cadastrado</AppText>
                    <Field
                      label="Buscar item"
                      value={linkQuery}
                      onChangeText={setLinkQuery}
                      placeholder="arroz, furadeira..."
                      autoCapitalize="none"
                    />
                    {candidates.map((candidate) => (
                      <Pressable
                        key={candidate.id}
                        onPress={() => {
                          addBarcode(candidate.id, unknownCode);
                          setLinkedTo(candidate.name);
                          void sync.run();
                        }}
                        style={{
                          paddingVertical: spacing.sm,
                          borderBottomWidth: 1,
                          borderBottomColor: palette.border,
                        }}
                      >
                        <AppText>{candidate.name}</AppText>
                        <AppText variant="caption">
                          {[candidate.brand, candidate.categoryName].filter(Boolean).join(' · ')}
                        </AppText>
                      </Pressable>
                    ))}
                    {linkedTo ? (
                      <Badge text={`código vinculado a ${linkedTo}`} tone="success" />
                    ) : null}
                  </Card>
                </>
              ) : null}

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {result?.kind === 'item' ? (
                  <Button
                    title="Abrir item"
                    style={{ flex: 1 }}
                    onPress={() => {
                      const itemId = result.item.id;
                      reset();
                      router.push(`/item/${itemId}`);
                    }}
                  />
                ) : null}
                {result?.kind === 'asset' ? (
                  <Button
                    title="Abrir bem"
                    style={{ flex: 1 }}
                    onPress={() => {
                      const assetId = result.asset.id;
                      reset();
                      router.push(`/asset-form?id=${assetId}`);
                    }}
                  />
                ) : null}
                {result?.kind === 'location' ? (
                  <Button
                    title="Ver locais"
                    style={{ flex: 1 }}
                    onPress={() => {
                      reset();
                      router.push('/locations');
                    }}
                  />
                ) : null}
                <Button title="Escanear outro" variant="secondary" style={{ flex: 1 }} onPress={reset} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function RoundButton({
  icon,
  onPress,
}: {
  icon: 'flash' | 'flash-off' | 'keypad-outline';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <Ionicons name={icon} size={22} color="#FFFFFF" />
    </Pressable>
  );
}
