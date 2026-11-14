import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { countPendingChanges } from '@/db/queries';
import {
  ApiError,
  apiCreateInvite,
  apiHousehold,
  type Member,
} from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { AppText, Badge, Button, Card, Divider, ErrorBanner, Screen } from '@/components/ui';
import { spacing, usePalette } from '@/theme';

export default function SettingsScreen() {
  const { state, token, logout, updateHousehold, serverUrl, forgetServer } = useAuth();
  const palette = usePalette();
  const sync = useSync();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, setPending] = useState(0);

  const isAdmin = state.status === 'authenticated' && state.session.user.role === 'admin';
  const household = state.status === 'authenticated' ? state.session.household : null;
  const user = state.status === 'authenticated' ? state.session.user : null;

  const reload = useCallback(() => {
    setPending(countPendingChanges());
    if (!token) return;

    void (async () => {
      try {
        const data = await apiHousehold(token);
        setMembers(data.members);
        updateHousehold(data.household);
        setError(null);
      } catch (caught) {
        const apiError = caught as ApiError;
        setError(apiError.isOffline ? 'Sem conexão: mostrando dados do aparelho.' : apiError.message);
      }
    })();
  }, [token, updateHousehold]);

  useFocusReload(reload);

  const generateInvite = async () => {
    if (!token) return;
    setGenerating(true);
    try {
      const invite = await apiCreateInvite(token);
      if (household) {
        updateHousehold({
          ...household,
          inviteCode: invite.inviteCode,
          inviteExpiresAt: invite.expiresAt,
        });
      }
      setError(null);
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setGenerating(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Sair', 'Você precisará do seu PIN para entrar de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  if (!user || !household) return null;

  return (
    <Screen>
      <AppText variant="title">Ajustes</AppText>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: `${palette.primary}22`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="subtitle" color={palette.primary}>
              {user.name.slice(0, 1).toUpperCase()}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">{user.name}</AppText>
            <AppText variant="caption">
              {user.role === 'admin' ? 'Administrador da casa' : 'Membro'}
            </AppText>
          </View>
          <Badge text={household.name} />
        </View>
      </Card>

      <ErrorBanner message={error} />

      {isAdmin ? (
        <Card>
          <AppText variant="subtitle">Convidar pessoa</AppText>

          {household.inviteCode ? (
            <View style={{ gap: spacing.xs, alignItems: 'center', paddingVertical: spacing.sm }}>
              <AppText variant="mono" selectable style={{ fontSize: 28, fontWeight: '700' }}>
                {household.inviteCode}
              </AppText>
              <AppText variant="caption">
                válido até {formatDateTime(household.inviteExpiresAt)}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption">
              Nenhum código ativo. Gere um e a pessoa entra em Ajustes → “Entrar na casa”.
            </AppText>
          )}

          <Button
            title={household.inviteCode ? 'Gerar novo código' : 'Gerar código'}
            variant="secondary"
            loading={generating}
            onPress={() => void generateInvite()}
            disabled={household.memberCount >= household.maxMembers}
          />

          <AppText variant="caption">
            {household.memberCount} de {household.maxMembers} pessoas na casa
          </AppText>
        </Card>
      ) : null}

      <Card>
        <AppText variant="subtitle">Pessoas</AppText>
        <Divider />
        {members.length === 0 ? (
          <AppText variant="caption">Nada carregado ainda.</AppText>
        ) : (
          members.map((member) => (
            <View
              key={member.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 }}
            >
              <Ionicons
                name={member.role === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
                size={16}
                color={member.role === 'admin' ? palette.primary : palette.textMuted}
              />
              <AppText style={{ flex: 1 }}>{member.name}</AppText>
              {member.id === user.id ? <Badge text="você" /> : null}
              {member.role === 'admin' ? <Badge text="admin" tone="success" /> : null}
            </View>
          ))
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="subtitle">Sincronização</AppText>
          <Badge
            text={sync.running ? 'agora' : sync.offline ? 'offline' : relativeTime(sync.lastAt)}
            tone={sync.offline ? 'warning' : 'neutral'}
          />
        </View>
        <AppText variant="caption">
          {pending > 0 ? `${pending} alteração(ões) pendente(s)` : 'Nada pendente'}
        </AppText>
        <Button
          title="Sincronizar agora"
          variant="secondary"
          loading={sync.running}
          onPress={() => void sync.run()}
        />
      </Card>

      <Card>
        <AppText variant="subtitle">Servidor</AppText>
        <AppText variant="mono" selectable style={{ fontSize: 13 }}>
          {serverUrl}
        </AppText>
        <AppText variant="caption">
          Os dados da casa ficam nesse endereço. Trocar de servidor não apaga o que já está no
          aparelho.
        </AppText>
        <Button
          title="Trocar servidor"
          variant="secondary"
          onPress={() =>
            Alert.alert(
              'Trocar servidor',
              'Você vai voltar para a tela de endereço e precisará entrar de novo.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Trocar', style: 'destructive', onPress: () => void forgetServer() },
              ],
            )
          }
        />
      </Card>

      <Card>
        <AppText variant="subtitle">Conta</AppText>
        <Button title="Sair" variant="ghost" onPress={confirmLogout} />
      </Card>

      <AppText variant="caption" style={{ textAlign: 'center' }}>
        Quanto 0.1.0 · F0
      </AppText>
    </Screen>
  );
}
