import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { AppText, Button, Card, ErrorBanner, Field, Screen } from '@/components/ui';
import { spacing, usePalette } from '@/theme';

/**
 * Primeira tela do app. O Quanto é self-hosted: a família aponta o aparelho para
 * o servidor da casa uma única vez, e esse endereço fica guardado no Keychain.
 */
export default function ServerScreen() {
  const { configureServer, suggestedServerUrl } = useAuth();
  const palette = usePalette();

  const [url, setUrl] = useState(suggestedServerUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await configureServer(url);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(
        apiError.code === 'timeout'
          ? 'O servidor demorou demais. Confira se ele está rodando.'
          : apiError.isOffline
            ? 'Não achei um servidor nesse endereço. Confira o IP e se o serviço está no ar.'
            : apiError.message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs, paddingTop: spacing.xl }}>
        <AppText variant="title">Quanto</AppText>
        <AppText variant="caption">
          Seu inventário de casa. Os dados ficam no seu servidor, não na nuvem de ninguém.
        </AppText>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="server-outline" size={20} color={palette.primary} />
          <AppText variant="subtitle">Servidor da casa</AppText>
        </View>

        <AppText variant="caption">
          Coloque o endereço onde o Quanto está rodando. Toda a família usa o mesmo.
        </AppText>

        <ErrorBanner message={error} />

        <Field
          label="Endereço"
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.5:3030"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          hint="Pode ser um IP na rede local ou um domínio com HTTPS."
        />

        <Button title="Conectar" onPress={() => void submit()} loading={loading} disabled={!url.trim()} />
      </Card>

      <Card>
        <AppText variant="label">Rodando o servidor neste computador?</AppText>
        <AppText variant="caption">No repositório do projeto:</AppText>
        <AppText variant="mono" selectable style={{ fontSize: 13 }}>
          npm run dev
        </AppText>
        <AppText variant="caption">
          Ele sobe a API na porta 3030 e mostra o endereço para colocar aqui.
        </AppText>
      </Card>

      <View style={{ flex: 1 }} />
      <AppText variant="caption" style={{ textAlign: 'center' }}>
        Sem conta em nuvem. Sem telemetria. Um servidor, uma família.
      </AppText>
    </Screen>
  );
}
