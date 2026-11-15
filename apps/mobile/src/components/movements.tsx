import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOVEMENT_LABEL, formatBRL, formatQty, type BaseUnitName } from '@quanto/core';
import type { MovementRow } from '@/db/repo';
import { AppText, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { radius, spacing, usePalette } from '@/theme';

const ICONS: Record<MovementRow['type'], keyof typeof Ionicons.glyphMap> = {
  in: 'arrow-down-circle-outline',
  consume: 'arrow-up-circle-outline',
  checkout: 'log-out-outline',
  checkin: 'log-in-outline',
  adjust: 'options-outline',
  transfer: 'swap-horizontal-outline',
  discard: 'trash-outline',
  maintenance: 'build-outline',
  revert: 'arrow-undo-outline',
};

export function movementIcon(type: MovementRow['type']) {
  return ICONS[type] ?? 'ellipse-outline';
}

export function MovementList({
  movements,
  unit,
  onRevert,
  emptyText,
}: {
  movements: MovementRow[];
  unit: BaseUnitName;
  onRevert?: (movement: MovementRow) => void;
  emptyText?: string;
}) {
  const palette = usePalette();

  if (movements.length === 0) {
    return <AppText variant="caption">{emptyText ?? 'Nenhuma movimentação ainda.'}</AppText>;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {movements.map((movement) => {
        const unsigned = Math.abs(movement.delta);
        const sign = movement.delta > 0 ? '+' : movement.delta < 0 ? '−' : '';
        const isAssetEvent = movement.type === 'checkout' || movement.type === 'checkin';

        return (
          <View
            key={movement.id}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.sm,
              backgroundColor: palette.cardAlt,
              borderRadius: radius.md,
              padding: spacing.md,
              opacity: movement.reverted ? 0.5 : 1,
            }}
          >
            <Ionicons name={movementIcon(movement.type)} size={18} color={palette.textMuted} />

            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                <AppText variant="caption" style={{ fontWeight: '700' }}>
                  {MOVEMENT_LABEL[movement.type]}
                </AppText>
                {movement.reverted ? <Badge text="desfeito" tone="warning" /> : null}
              </View>

              <AppText variant="caption">
                {isAssetEvent
                  ? movement.userName ?? 'alguém'
                  : `${sign}${formatQty(unsigned, unit)}`}
                {movement.priceCents > 0 ? ` · ${formatBRL(movement.priceCents)}` : ''}
                {movement.locationName ? ` · ${movement.locationName}` : ''}
              </AppText>

              <AppText variant="caption">
                {formatDateTime(movement.createdAt)}
                {movement.userName && !isAssetEvent ? ` · ${movement.userName}` : ''}
              </AppText>

              {movement.note ? <AppText variant="caption">{movement.note}</AppText> : null}
            </View>

            {onRevert && !movement.reverted && movement.type !== 'revert' ? (
              <Pressable onPress={() => onRevert(movement)} hitSlop={10}>
                <Ionicons name="arrow-undo-outline" size={18} color={palette.textMuted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
