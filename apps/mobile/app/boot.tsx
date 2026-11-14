import { View } from 'react-native';
import { BootScreen } from '@/components/session-screens';
import { usePalette } from '@/theme';

/**
 * Rota neutra e âncora do Stack: o app monta aqui e o redirect decide o destino.
 * Sem ela o expo-router escolhe uma rota inicial arbitrária e o usuário pode
 * cair em telas sem histórico (botão voltar morto).
 */
export default function BootRoute() {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <BootScreen />
    </View>
  );
}
