import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, Screen } from '@/components/ui';
import { spacing, usePalette } from '@/theme';

export default function ScanScreen() {
  const palette = usePalette();

  return (
    <Screen>
      <AppText variant="title">Escanear</AppText>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="scan-outline" size={20} color={palette.primary} />
          <AppText variant="subtitle">Chega na F2</AppText>
        </View>
        <AppText variant="caption">
          Leitura contínua de EAN-13, UPC, Code128, QR e DataMatrix com expo-camera, mais modo
          inventário por local e suporte a leitor HID.
        </AppText>
      </Card>
    </Screen>
  );
}
