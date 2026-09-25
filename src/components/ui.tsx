import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import { t } from '@/i18n';
import { initial } from '@/lib/format';
import { layout } from '@/styles/common';

import { IconCheck, IconChevronLeft, IconClose, IconHelp } from './icons';
import { styles as s } from './ui.styles';

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
  return <Text {...rest} style={[{ fontFamily, fontSize: size, color }, tabular && s.tabular, style]} />;
}

// ——— Contenedores ———

type ScrollIntoView = (node: View | null) => void;

const ScreenScroll = createContext<ScrollIntoView>(() => {});

/** Desplaza el `Screen` que contiene a `node` para dejarlo centrado en la parte visible. */
export const useScrollIntoView = () => useContext(ScreenScroll);

export function Screen({
  children,
  bottom = 112,
  gap = 18,
}: {
  children: ReactNode;
  /** Espacio al final; también se descuenta al centrar, porque ahí suele ir la barra inferior. */
  bottom?: number;
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const viewHeight = useRef(0);

  const scrollIntoView = useCallback<ScrollIntoView>(
    (node) => {
      const sv = scroll.current;
      const inner = content.current;
      if (!node || !sv || !inner) return;
      // Posición dentro del contenido, no en la ventana: no depende del desplazamiento actual,
      // que queda desactualizado cuando el contenido se encoge sin disparar onScroll.
      node.measureLayout(inner, (_x, y, _w, h) => {
        // Zona visible: entre la barra de estado y la barra inferior.
        const visible = viewHeight.current - insets.top - bottom;
        // Centrado; si no cabe, que se vea desde arriba.
        const margin = insets.top + Math.max(16, (visible - h) / 2);
        sv.scrollTo({ y: Math.max(0, y - margin), animated: true });
      });
    },
    [bottom, insets.top],
  );

  return (
    <ScreenScroll.Provider value={scrollIntoView}>
      <ScrollView
        ref={scroll}
        // Los tipos de RN aún piden RefObject<View> sin null (anterior a React 19).
        innerViewRef={content as RefObject<View>}
        style={s.screen}
        contentContainerStyle={[s.screenContent, { paddingTop: insets.top + 16, paddingBottom: bottom, gap }]}
        onLayout={(e) => (viewHeight.current = e.nativeEvent.layout.height)}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </ScreenScroll.Provider>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** Fila horizontal centrada verticalmente. */
export function Row({ style, gap = 0, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[s.row, { gap }, style]} />;
}

/** Columna con espacio uniforme entre hijos. */
export function Stack({ style, gap = 0, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[{ gap }, style]} />;
}

/** Pressable que atenúa al tocar. */
export function Tap({ style, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...rest} style={({ pressed }) => [style, pressed && s.pressed]} />;
}

/** Título grande con línea superior opcional ("Septiembre 2026"). */
export function Title({ kicker, title }: { kicker?: string; title: ReactNode }) {
  return (
    <Stack gap={2} style={layout.shrink}>
      {kicker ? (
        <T w={600} size={13} color={C.muted}>
          {kicker}
        </T>
      ) : null}
      <T serif w={600} size={32} style={s.headerTitle}>
        {title}
      </T>
    </Stack>
  );
}

export function Header({ title, kicker, onBack, right }: { title: string; kicker?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <Row gap={12} style={s.header}>
      <Row gap={12} style={layout.shrink}>
        {onBack && (
          <RoundButton label={t('common.back')} onPress={onBack}>
            <IconChevronLeft />
          </RoundButton>
        )}
        <Title kicker={kicker} title={title} />
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
    <Row style={s.sectionTitle}>
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
              <T w={700} size={12} color={on && o.activeBg ? C.white : C.muted}>
                {o.extra}
              </T>
            )}
          </Tap>
        );
      })}
    </View>
  );
}

/** Opción de una grilla o lista (categorías, periodicidad…): se rellena con `accent` al elegirla. */
export function Chip({
  label,
  on,
  onPress,
  accent = C.ink,
  style,
  numberOfLines,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={[s.chip, { backgroundColor: on ? accent : C.card, borderColor: on ? accent : C.line }, style]}>
      <T w={700} size={13.5} color={on ? C.white : C.ink} numberOfLines={numberOfLines}>
        {label}
      </T>
    </Tap>
  );
}

export function Progress({ pct, color, track, height = 8 }: { pct: number; color: string; track: string; height?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={[s.progressTrack, { height, backgroundColor: track }]}>
      <View style={[s.progressFill, { width: `${w}%`, height, backgroundColor: color }]} />
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
      style={[s.track, on ? [s.trackOn, { backgroundColor: accent }] : s.trackOff, disabled && s.trackDisabled]}>
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
        accessibilityLabel={t('ui.helpLabel', { label })}
        accessibilityHint={text}
        accessibilityState={{ expanded: open }}>
        <IconHelp size={16} color={open ? C.ink : C.muted} />
      </Tap>
      {open && (
        <Tap onPress={() => setOpen(false)} style={s.tip} accessibilityLiveRegion="polite">
          <View style={s.tipArrow} />
          <T size={12.5} color={C.white} style={s.tipText}>
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
    <Row gap={12} style={[s.listRow, !first && s.divider, help && s.listRowRaised]}>
      <Stack gap={2} style={layout.fill}>
        <Row gap={6}>
          <T w={700} size={14.5}>
            {label}
          </T>
          {help && <HelpTip text={help} label={label} />}
        </Row>
        <T size={12.5} color={C.muted}>
          {desc}
        </T>
      </Stack>
      <Toggle on={on} onPress={onPress} label={label} accent={accent} disabled={disabled} />
    </Row>
  );
}

export { Stepper } from './stepper';

export function RadioDot({ on, accent }: { on: boolean; accent: string }) {
  return (
    <View style={[s.radio, on ? { borderColor: accent } : s.radioOff]}>
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
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[s.primary, { backgroundColor: bg }, disabled && { opacity: 0.45 }]}>
      {icon && <IconCheck size={20} color={C.white} stroke={2.2} />}
      <T w={800} size={16} color={C.white}>
        {label}
      </T>
    </Tap>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.placeholder} {...props} style={[s.field, props.style]} />;
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
        <IconCheck size={18} color={C.white} />
      </View>
      <Stack gap={2} style={layout.fill}>
        <T w={800} size={14.5} color={color}>
          {title}
        </T>
        {text ? (
          <T size={12.5} color={C.muted}>
            {text}
          </T>
        ) : null}
      </Stack>
      {onClose && (
        <Tap onPress={onClose} accessibilityLabel={t('ui.closeNotice')} style={s.toastClose}>
          <IconClose size={16} color={C.muted} />
        </Tap>
      )}
    </Row>
  );
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      <T w={800} size={14.5} style={layout.textCenter}>
        {title}
      </T>
      {hint ? (
        <T size={12.5} color={C.muted} style={layout.textCenter}>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={layout.fill}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('ui.closePanel')} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.handle} />
          <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
            {title !== undefined && (
              <Row gap={12} style={s.sheetHeader}>
                <T serif w={600} size={24} style={layout.fill}>
                  {title}
                </T>
                <RoundButton label={t('common.close')} onPress={onClose}>
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
          accessibilityLabel={t(
            income
              ? check.on
                ? 'ui.unmarkReceived'
                : 'ui.markReceived'
              : check.on
                ? 'ui.unmarkPaid'
                : 'ui.markPaid',
            { name },
          )}
          style={[s.check, check.on ? s.checkOn : s.checkOff]}>
          {check.on && <IconCheck size={18} color={C.white} />}
        </Tap>
      ) : (
        <View style={[s.avatar, income ? s.avatarIn : s.avatarOut]}>
          <T w={800} size={15} color={income ? C.inDark : C.outDark}>
            {initial(name)}
          </T>
        </View>
      )}
      <Stack gap={2} style={layout.fillShrink}>
        <T w={700} size={15} numberOfLines={1}>
          {name}
        </T>
        <T size={12.5} color={C.muted} numberOfLines={1}>
          {meta}
        </T>
      </Stack>
      <View style={s.movAmount}>
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
