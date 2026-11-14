import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, Screen } from '@/components/ui';
import { spacing, usePalette } from '@/theme';

export default function StockScreen() {
  const palette = usePalette();

  return (
    <Screen>
      <AppText variant="title">Estoque</AppText>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="cube-outline" size={20} color={palette.primary} />
          <AppText variant="subtitle">Chega na F1</AppText>
        </View>
        <AppText variant="caption">
          Catálogo de itens (consumíveis com lote e validade) e bens duráveis com unidade
          individual, série, valor e histórico. O modelo de dados e a API já estão prontos.
        </AppText>
      </Card>

      <Card>
        <AppText variant="label">O que já funciona</AppText>
        <AppText variant="caption">• Contas por pessoa, com PIN único e biometria</AppText>
        <AppText variant="caption">• Convite de membro pelo administrador</AppText>
        <AppText variant="caption">• Locais em árvore, offline-first</AppText>
        <AppText variant="caption">• Sync entre aparelhos com resolução de conflito</AppText>
      </Card>
    </Screen>
  );
}
