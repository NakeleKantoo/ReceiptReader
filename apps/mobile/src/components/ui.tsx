import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, usePalette } from '@/theme';

type TextVariant = 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'mono';

export function AppText({
  children,
  variant = 'body',
  color,
  style,
  selectable,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
}) {
  const palette = usePalette();
  const variants: Record<TextVariant, TextStyle> = {
    title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
    subtitle: { fontSize: 18, fontWeight: '600' },
    body: { fontSize: 15 },
    label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
    caption: { fontSize: 12 },
    mono: { fontVariant: ['tabular-nums'], letterSpacing: 2 },
  };

  const muted = variant === 'caption' || variant === 'label';

  return (
    <Text
      selectable={selectable}
      style={[
        { color: color ?? (muted ? palette.textMuted : palette.text) },
        variants[variant],
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const contentStyle: ViewStyle = {
    padding: padded ? spacing.lg : 0,
    paddingTop: insets.top + spacing.md,
    paddingBottom: insets.bottom + spacing.xxl,
    gap: spacing.md,
  };

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: palette.bg }, contentStyle]}>{children}</View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const palette = usePalette();
  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: palette.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();

  const backgrounds: Record<ButtonVariant, string> = {
    primary: palette.primary,
    secondary: palette.cardAlt,
    danger: palette.danger,
    ghost: 'transparent',
  };
  const colors: Record<ButtonVariant, string> = {
    primary: palette.primaryText,
    secondary: palette.text,
    danger: '#FFFFFF',
    ghost: palette.primary,
  };

  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: backgrounds[variant],
          borderRadius: radius.md,
          paddingVertical: 14,
          paddingHorizontal: spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 50,
          opacity: isDisabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[variant]} />
      ) : (
        <Text style={{ color: colors[variant], fontSize: 16, fontWeight: '600' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const palette = usePalette();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        placeholderTextColor={palette.textMuted}
        {...props}
        style={[
          {
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: error ? palette.danger : palette.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: 12,
            fontSize: 16,
            color: palette.text,
          },
          props.style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption">{hint}</AppText>
      ) : null}
    </View>
  );
}

export function Divider() {
  const palette = usePalette();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, width: '100%' }}
    />
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const palette = usePalette();
  const tones = {
    neutral: palette.cardAlt,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
  } as const;

  return (
    <View
      style={{
        backgroundColor: tone === 'neutral' ? palette.cardAlt : `${tones[tone]}22`,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radius.pill,
      }}
    >
      <AppText variant="caption" color={tone === 'neutral' ? palette.textMuted : tones[tone]}>
        {text}
      </AppText>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={{ paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs }}>
      <AppText variant="subtitle">{title}</AppText>
      {description ? (
        <AppText variant="caption" style={{ textAlign: 'center' }}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  const palette = usePalette();
  if (!message) return null;

  return (
    <View
      style={{
        backgroundColor: `${palette.danger}18`,
        borderColor: palette.danger,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <AppText variant="caption" color={palette.danger}>
        {message}
      </AppText>
    </View>
  );
}
