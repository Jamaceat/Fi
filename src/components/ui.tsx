import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F, type Weight } from '@/constants/theme';
import { initial } from '@/lib/format';

import { IconCheck, IconChevronLeft, IconClose, IconHelp, IconMinus, IconPlus } from './icons';

// ——— Texto ———

type TProps = TextProps & {
  w?: Weight;
  serif?: boolean;
  size?: number;
  color?: string;
  tabular?: boolean;
};

export function T({ w = 500, serif, size = 14, color = C.ink, tabular, style, ...rest }: TProps) {
  const fontFamily = serif ? (w >= 600 ? F.serif600 : F.serif500) : F[w];
  return (
    <Text
      {...rest}
      style={[
        { fontFamily, fontSize: size, color },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}

// ——— Contenedores ———

export function Screen({
  children,
  bottom = 112,
  gap = 18,
}: {
  children: ReactNode;
  bottom?: number;
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: bottom, gap }}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ style, gap = 0, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} />;
}

/** Pressable que atenúa al tocar. */
export function Tap({ style, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...rest} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]} />;
}

export function Header({ title, kicker, onBack, right }: { title: string; kicker?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <Row gap={12} style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <Row gap={12} style={{ flexShrink: 1 }}>
        {onBack && (
          <RoundButton label="Volver" onPress={onBack}>
            <IconChevronLeft />
          </RoundButton>
        )}
        <View style={{ gap: 2, flexShrink: 1 }}>
          {kicker ? (
            <T w={600} size={13} color={C.muted}>
              {kicker}
            </T>
          ) : null}
          <T serif w={600} size={32} style={{ letterSpacing: -0.5 }}>
            {title}
          </T>
        </View>
      </Row>
      {right}
    </Row>
  );
}

export function RoundButton({
  children,
  onPress,
  label,
  bg = C.card,
  border = C.line,
}: {
  children: ReactNode;
  onPress?: () => void;
  label: string;
  bg?: string;
  border?: string;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[s.round, { backgroundColor: bg, borderColor: border }]}>
      {children}
    </Tap>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <T w={800} size={16}>
        {children}
      </T>
      {right}
    </Row>
  );
}

export function LinkText({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Tap onPress={onPress} hitSlop={12}>
      <T w={700} size={13} color={C.in}>
        {children}
      </T>
    </Tap>
  );
}

// ——— Controles ———

export type SegOption<K extends string> = { id: K; label: string; extra?: string; activeFg?: string; activeBg?: string };

/** Selector de dos o más opciones sobre fondo gris (diseño: tabs Gastos/Ingresos). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <View style={s.segWrap}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Tap
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.segBtn, on && (o.activeBg ? { backgroundColor: o.activeBg } : s.segOn)]}>
            <T w={800} size={14.5} color={on ? (o.activeFg ?? C.ink) : C.muted2}>
              {o.label}
            </T>
            {o.extra !== undefined && (
              <T w={700} size={12} color={on && o.activeBg ? '#FFFFFF' : C.muted}>
                {o.extra}
              </T>
            )}
          </Tap>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, accent = C.ink }: { label: string; on: boolean; onPress: () => void; accent?: string }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={[s.chip, { backgroundColor: on ? accent : C.card, borderColor: on ? accent : C.line }]}>
      <T w={700} size={13.5} color={on ? '#FFFFFF' : C.ink}>
        {label}
      </T>
    </Tap>
  );
}

export function Progress({ pct, color, track, height = 8 }: { pct: number; color: string; track: string; height?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${w}%`, height, borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

export function Toggle({
  on,
  onPress,
  label,
  accent = C.in,
  disabled,
}: {
  on: boolean;
  onPress: () => void;
  label: string;
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[
        s.track,
        { backgroundColor: on ? accent : C.switchOff, justifyContent: on ? 'flex-end' : 'flex-start' },
        disabled && { opacity: 0.4 },
      ]}>
      <View style={s.knob} />
    </Tap>
  );
}

/** Ícono (?) que muestra `text` al pasar el puntero por encima o al tocarlo. */
export function HelpTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Tap
        onPress={() => setOpen((v) => !v)}
        onHoverIn={() => setOpen(true)}
        onHoverOut={() => setOpen(false)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Qué significa ${label}`}
        accessibilityHint={text}
        accessibilityState={{ expanded: open }}>
        <IconHelp size={16} color={open ? C.ink : C.muted} />
      </Tap>
      {open && (
        <Tap onPress={() => setOpen(false)} style={s.tip} accessibilityLiveRegion="polite">
          <View style={s.tipArrow} />
          <T size={12.5} color="#FFFFFF" style={{ lineHeight: 18 }}>
            {text}
          </T>
        </Tap>
      )}
    </View>
  );
}

export function SwitchRow({
  label,
  desc,
  help,
  on,
  onPress,
  accent,
  first,
  disabled,
}: {
  label: string;
  desc: string;
  /** Explicación larga detrás de un ícono (?). */
  help?: string;
  on: boolean;
  onPress: () => void;
  accent?: string;
  first?: boolean;
  disabled?: boolean;
}) {
  return (
    <Row gap={12} style={[s.listRow, !first && s.divider, help && { zIndex: 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <T w={700} size={14.5}>
            {label}
          </T>
          {help && <HelpTip text={help} label={label} />}
        </Row>
        <T size={12.5} color={C.muted}>
          {desc}
        </T>
      </View>
      <Toggle on={on} onPress={onPress} label={label} accent={accent} disabled={disabled} />
    </Row>
  );
}

export function Stepper({
  value,
  onDec,
  onInc,
  decLabel = 'Restar',
  incLabel = 'Sumar',
  minWidth = 40,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  decLabel?: string;
  incLabel?: string;
  minWidth?: number;
}) {
  return (
    <Row gap={4} style={s.stepper}>
      <Tap onPress={onDec} accessibilityLabel={decLabel} style={s.stepBtn}>
        <IconMinus size={16} />
      </Tap>
      <T w={800} size={15} tabular style={{ minWidth, textAlign: 'center' }} accessibilityLiveRegion="polite">
        {value}
      </T>
      <Tap onPress={onInc} accessibilityLabel={incLabel} style={s.stepBtn}>
        <IconPlus size={16} />
      </Tap>
    </Row>
  );
}

export function RadioDot({ on, accent }: { on: boolean; accent: string }) {
  return (
    <View style={[s.radio, { borderColor: on ? accent : C.ring }]}>
      {on && <View style={[s.radioDot, { backgroundColor: accent }]} />}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  bg = C.ink,
  disabled,
  icon = true,
}: {
  label: string;
  onPress: () => void;
  bg?: string;
  disabled?: boolean;
  icon?: boolean;
}) {
  return (
    <Tap
      onPress={disabled ? undefined : onPress}
      accessibilityState={{ disabled }}
      style={[s.primary, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }]}>
      {icon && <IconCheck size={20} color="#FFFFFF" stroke={2.2} />}
      <T w={800} size={16} color="#FFFFFF">
        {label}
      </T>
    </Tap>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor="#8A847A" {...props} style={[s.field, props.style]} />;
}

export { AmountField } from './amount-field';

// ——— Avisos ———

export function Toast({
  title,
  text,
  warn,
  onClose,
}: {
  title: string;
  text?: string;
  warn?: boolean;
  onClose?: () => void;
}) {
  const color = warn ? C.warn : C.in;
  return (
    <Row gap={12} style={[s.toast, { borderColor: color }]} accessibilityRole="alert">
      <View style={[s.toastIcon, { backgroundColor: color }]}>
        <IconCheck size={18} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T w={800} size={14.5} color={color}>
          {title}
        </T>
        {text ? (
          <T size={12.5} color={C.muted}>
            {text}
          </T>
        ) : null}
      </View>
      {onClose && (
        <Tap onPress={onClose} accessibilityLabel="Cerrar aviso" style={{ padding: 10 }}>
          <IconClose size={16} color={C.muted} />
        </Tap>
      )}
    </Row>
  );
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      <T w={800} size={14.5} style={{ textAlign: 'center' }}>
        {title}
      </T>
      {hint ? (
        <T size={12.5} color={C.muted} style={{ textAlign: 'center' }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

// ——— Hoja inferior ———

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Cerrar panel" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.handle} />
          <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
            {title !== undefined && (
              <Row gap={12} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <T serif w={600} size={24} style={{ flex: 1 }}>
                  {title}
                </T>
                <RoundButton label="Cerrar" onPress={onClose}>
                  <IconClose size={16} />
                </RoundButton>
              </Row>
            )}
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ——— Filas de movimientos ———

export function MovementRow({
  name,
  meta,
  amount,
  income,
  badge,
  first,
  onPress,
  check,
}: {
  name: string;
  meta: string;
  amount: string;
  income: boolean;
  badge?: string;
  first?: boolean;
  onPress?: () => void;
  /** Ocasional: casilla pagado/pendiente en lugar de la inicial. */
  check?: { on: boolean; onToggle: () => void };
}) {
  return (
    <Tap onPress={onPress} style={[s.movRow, !first && s.divider]}>
      {check ? (
        <Tap
          onPress={check.onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: check.on }}
          accessibilityLabel={`${check.on ? 'Desmarcar' : 'Marcar'} ${name} como ${income ? 'recibido' : 'pagado'}`}
          style={[s.check, { borderColor: check.on ? C.ink : C.ring, backgroundColor: check.on ? C.ink : C.card }]}>
          {check.on && <IconCheck size={18} color="#FFFFFF" />}
        </Tap>
      ) : (
        <View style={[s.avatar, { backgroundColor: income ? C.inSoft : C.outSoft }]}>
          <T w={800} size={15} color={income ? C.inDark : C.outDark}>
            {initial(name)}
          </T>
        </View>
      )}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <T w={700} size={15} numberOfLines={1}>
          {name}
        </T>
        <T size={12.5} color={C.muted} numberOfLines={1}>
          {meta}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <T w={800} size={15} tabular color={income ? C.in : C.out}>
          {amount}
        </T>
        {badge ? (
          <T w={700} size={11} color={C.muted} style={s.badge}>
            {badge}
          </T>
        ) : null}
      </View>
    </Tap>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segWrap: { backgroundColor: C.segBg, borderRadius: 16, padding: 4, flexDirection: 'row', gap: 4 },
  segBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  segOn: {
    backgroundColor: C.card,
    shadowColor: C.ink,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, justifyContent: 'center' },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3, flexDirection: 'row', alignItems: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
  listRow: { paddingVertical: 12, minHeight: 56 },
  tip: {
    position: 'absolute',
    top: 26,
    left: -12,
    width: 260,
    backgroundColor: C.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tipArrow: {
    position: 'absolute',
    top: -5,
    left: 15,
    width: 10,
    height: 10,
    backgroundColor: C.ink,
    transform: [{ rotate: '45deg' }],
  },
  divider: { borderTopWidth: 1, borderTopColor: C.divider },
  stepper: { backgroundColor: C.chip, borderRadius: 14, padding: 4 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  primary: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  field: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    fontFamily: F[500],
    fontSize: 14.5,
    color: C.ink,
    paddingHorizontal: 14,
  },
  toast: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 4,
  },
  toastIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  empty: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D5CFC4',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(27,26,23,0.42)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#D3CDC2', marginBottom: 10 },
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  check: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: C.chip, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
});
