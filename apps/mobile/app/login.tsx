import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { AppText, Button, Card, ErrorBanner, Field, Screen } from '@/components/ui';
import { spacing } from '@/theme';

export default function LoginScreen() {
  const { login, server, serverError, refreshServerStatus, serverUrl, forgetServer } = useAuth();
  const router = useRouter();

  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isPin = /^\d{0,6}$/.test(secret);
  const canSubmit = secret.length >= 6 && !loading;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await login(secret);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(
        apiError.isOffline ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.' : apiError.message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs, paddingTop: spacing.xl }}>
        <AppText variant="title">Quanto</AppText>
        <AppText variant="caption">{serverUrl}</AppText>
      </View>

      {serverError ? (
        <Card>
          <AppText variant="subtitle">Servidor inacessível</AppText>
          <AppText variant="caption">{serverError}</AppText>
          <Button title="Tentar de novo" variant="secondary" onPress={() => void refreshServerStatus()} />
          <Button title="Trocar servidor" variant="ghost" onPress={() => void forgetServer()} />
        </Card>
      ) : null}

      {!server && !serverError ? (
        <Card>
          <AppText variant="caption">Falando com o servidor...</AppText>
        </Card>
      ) : null}

      {/* Servidor no ar, mas sem casa: é aqui que nasce a casa. */}
      {server && !server.initialized ? (
        <Card>
          <AppText variant="subtitle">Este servidor está vazio</AppText>
          <AppText variant="caption">
            Nenhuma casa foi criada aqui ainda. Quem criar vira o administrador e depois convida as
            outras pessoas.
          </AppText>
          <Button title="Criar a casa" onPress={() => router.push('/setup')} />
          <Button
            title="Já tenho um convite"
            variant="ghost"
            onPress={() => router.push('/join')}
          />
        </Card>
      ) : null}

      {server?.initialized ? (
        <Card>
          <AppText variant="subtitle">{server.householdName}</AppText>
          <AppText variant="caption">
            {server.memberCount} de {server.maxMembers} pessoas na casa
          </AppText>

          <ErrorBanner message={error} />

          <Field
            label="Seu PIN ou senha"
            value={secret}
            onChangeText={setSecret}
            placeholder={isPin ? '6 dígitos' : 'sua senha'}
            keyboardType={isPin ? 'number-pad' : 'default'}
            secureTextEntry
            maxLength={128}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />

          <Button title="Entrar" onPress={() => void submit()} loading={loading} disabled={!canSubmit} />

          <Button
            title="Tenho um código de convite"
            variant="ghost"
            onPress={() => router.push('/join')}
          />
        </Card>
      ) : null}

      <View style={{ flex: 1 }} />

      <Pressable onPress={() => void forgetServer()} hitSlop={8}>
        <AppText variant="caption" style={{ textAlign: 'center' }}>
          Cada pessoa usa o próprio PIN · trocar servidor
        </AppText>
      </Pressable>
    </Screen>
  );
}
