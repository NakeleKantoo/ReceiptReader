import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { AppText, Button, Card, ErrorBanner, Field, Screen } from '@/components/ui';
import { spacing } from '@/theme';

export default function JoinScreen() {
  const { join, server, forgetServer } = useAuth();
  const router = useRouter();

  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isPin = /^\d*$/.test(secret) && secret.length <= 6;
  const secretOk = /^\d{6}$/.test(secret) || secret.length >= 8;
  const match = secret.length > 0 && secret === confirm;
  const canSubmit = inviteCode.trim().length >= 6 && name.trim() && secretOk && match && !loading;

  /** servidor vazio não tem convite nenhum: sem essa saída o usuário fica preso aqui */
  const serverEmpty = server !== null && !server.initialized;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/login');
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await join({ inviteCode: inviteCode.trim(), name: name.trim(), secret });
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.isOffline ? 'Sem conexão com o servidor.' : apiError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs, paddingTop: spacing.xl }}>
        <AppText variant="title">Entrar na casa</AppText>
        <AppText variant="caption">Use o código de convite que o administrador gerou.</AppText>
      </View>

      {serverEmpty ? (
        <Card>
          <AppText variant="subtitle">Este servidor ainda não tem casa</AppText>
          <AppText variant="caption">
            Não existe convite para usar: ninguém criou a casa ainda. Quem criar vira o
            administrador e depois convida as outras pessoas.
          </AppText>
          <Button title="Criar a casa" onPress={() => router.replace('/setup')} />
          <Button title="Voltar" variant="secondary" onPress={goBack} />
          <Button title="Trocar servidor" variant="ghost" onPress={() => void forgetServer()} />
        </Card>
      ) : (
        <Card>
          <ErrorBanner message={error} />

          <Field
            label="Código de convite"
            value={inviteCode}
            onChangeText={(value) => setInviteCode(value.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            autoFocus
            style={{ letterSpacing: 4, fontSize: 20 }}
          />
          <Field label="Seu nome" value={name} onChangeText={setName} placeholder="Bruno" maxLength={60} />
          <Field
            label="Seu PIN ou senha"
            value={secret}
            onChangeText={setSecret}
            placeholder={isPin ? '6 dígitos' : 'senha com 8+ caracteres'}
            keyboardType={isPin ? 'number-pad' : 'default'}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            hint="Precisa ser diferente do PIN das outras pessoas."
          />
          <Field
            label="Confirmar"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            keyboardType={isPin ? 'number-pad' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            error={confirm.length > 0 && !match ? 'Não confere' : null}
          />

          <Button title="Entrar" onPress={() => void submit()} loading={loading} disabled={!canSubmit} />
          <Button title="Voltar" variant="ghost" onPress={goBack} />
        </Card>
      )}

      <View style={{ flex: 1 }} />
      <Button title="Trocar servidor" variant="ghost" onPress={() => void forgetServer()} />
    </Screen>
  );
}
