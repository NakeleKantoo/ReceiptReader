import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useFocusReload } from '@/lib/useFocusReload';
import { getAsset, getItem, getLocation } from '@/db/repo';
import { buildAssetUri, buildItemUri, buildLocationUri } from '@/lib/scan';
import { AppText, Card, Screen } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

type QrType = 'item' | 'asset' | 'location';

/**
 * Etiqueta na tela: o mesmo QR que a F4 vai imprimir. Serve para etiquetar a
 * caixa com fita ou para escanear de outro aparelho.
 */
export default function QrScreen() {
  const router = useRouter();
  const palette = usePalette();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const type = (params.type ?? 'item') as QrType;
  const id = String(params.id ?? '');

  // relê ao voltar para a tela (o item pode ter sido editado)
  const [, setTick] = useState(0);
  useFocusReload(() => setTick((value) => value + 1));

  const data = (() => {
    if (type === 'item') {
      const item = getItem(id);
      return item ? { title: item.name, subtitle: item.brand ?? '', uri: buildItemUri(item.publicId), code: item.publicId } : null;
    }

    if (type === 'asset') {
      const asset = getAsset(id);
      return asset
        ? {
            title: asset.nickname || asset.serial || 'Bem',
            subtitle: asset.serial ?? '',
            uri: buildAssetUri(asset.publicId),
            code: asset.publicId,
          }
        : null;
    }

    const location = getLocation(id);
    return location
      ? { title: location.name, subtitle: 'local', uri: buildLocationUri(location.id), code: location.id.slice(0, 8) }
      : null;
  })();

  if (!data) {
    return (
      <Screen>
        <AppText variant="title">Etiqueta</AppText>
        <AppText variant="caption">Não encontrei esse registro no aparelho.</AppText>
        <Pressable onPress={() => router.back()}>
          <AppText color={palette.primary}>Voltar</AppText>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <AppText variant="title">Etiqueta</AppText>
      </View>

      <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
        {/* fundo branco fixo: QR escuro em fundo escuro não lê */}
        <View style={{ backgroundColor: '#FFFFFF', padding: spacing.lg, borderRadius: radius.md }}>
          <QRCode value={data.uri} size={220} color="#000000" backgroundColor="#FFFFFF" ecl="M" />
        </View>

        <View style={{ alignItems: 'center', gap: 2 }}>
          <AppText variant="subtitle" style={{ textAlign: 'center' }}>
            {data.title}
          </AppText>
          {data.subtitle ? <AppText variant="caption">{data.subtitle}</AppText> : null}
          <AppText variant="mono" selectable style={{ fontSize: 14, marginTop: spacing.xs }}>
            {data.code}
          </AppText>
        </View>
      </Card>

      <Card>
        <AppText variant="label">Conteúdo do QR</AppText>
        <AppText variant="mono" selectable style={{ fontSize: 12 }}>
          {data.uri}
        </AppText>
        <AppText variant="caption">
          A impressão em folha de etiquetas chega na F4. Por ora use a tela de outro aparelho para
          testar a leitura.
        </AppText>
      </Card>
    </Screen>
  );
}
