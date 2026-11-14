import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { AppText, Button, Card, ErrorBanner, Field, Screen } from '@/components/ui';
import { spacing } from '@/theme';

export default function SetupScreen() {
  const { bootstrap, forgetServer } = useAuth();
  const router = useRouter();

  const [householdName, setHouseholdName] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isPin = /^\d*$/.test(secret) && secret.length <= 6;
  const secretOk = /^\d{6}$/.test(secret) || secret.length >= 8;
  const match = secret.length > 0 && secret === confirm;
  const canSubmit =
    householdName.trim().length > 0 && name.trim().length > 0 && secretOk && match && !loading;

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
      await bootstrap({ householdName: householdName.trim(), name: name.trim(), secret });
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
        <AppText variant="title">Criar a casa</AppText>
        <AppText variant="caption">
          Você será o administrador. Depois gere um convite para cada pessoa da família.
        </AppText>
      </View>

      <Card>
        <ErrorBanner message={error} />

        <Field
          label="Nome da casa"
          value={householdName}
          onChangeText={setHouseholdName}
          placeholder="Casa da Vila"
          autoFocus
          maxLength={60}
        />
        <Field
          label="Seu nome"
          value={name}
          onChangeText={setName}
          placeholder="Ana"
          maxLength={60}
        />
        <Field
          label="Seu PIN ou senha"
          value={secret}
          onChangeText={setSecret}
          placeholder={isPin ? '6 dígitos' : 'senha com 8+ caracteres'}
          keyboardType={isPin ? 'number-pad' : 'default'}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          hint="O PIN identifica você: ninguém mais da casa pode usar o mesmo."
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

        <Button title="Criar casa" onPress={() => void submit()} loading={loading} disabled={!canSubmit} />
        <Button title="Voltar" variant="ghost" onPress={goBack} />
      </Card>

      <View style={{ flex: 1 }} />
      <Button title="Trocar servidor" variant="ghost" onPress={() => void forgetServer()} />
    </Screen>
  );
}
