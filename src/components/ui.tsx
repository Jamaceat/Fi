import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { C, F, type Weight } from '@/constants/theme';
import { t } from '@/i18n';
import { initial } from '@/lib/format';
import { common, layout } from '@/styles/common';

import { IconCheck, IconChevronLeft, IconClose, IconInfo } from './icons';
import { useKeyboardHeight } from './use-keyboard-height';
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

/** Duración y curva de los cambios de valor (montos, barras): suave y sin rebote. */
export const VALUE_MS = 650;
export const VALUE_EASE = Easing.out(Easing.cubic);

const ValueMotion = createContext(true);

/**
 * Con `animate={false}`, los montos y barras de adentro cambian de golpe en lugar de contar
 * o deslizarse (p. ej. al pasar a otro mes, donde no es el mismo valor que cambia).
 */
export function ValueMotionProvider({ animate, children }: { animate: boolean; children: ReactNode }) {
  return <ValueMotion.Provider value={animate}>{children}</ValueMotion.Provider>;
}

/** Número que, al cambiar, cuenta desde el valor anterior hasta el nuevo. */
export function CountText({ value, format, ...rest }: TProps & { value: number; format: (n: number) => string }) {
  const reduceMotion = useReducedMotion();
  const animate = useContext(ValueMotion) && !reduceMotion;
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  // Sin animación salta al valor, para que al volver a animar cuente desde aquí.
  if (!animate && shown !== value) setShown(value);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (!animate) {
      current.current = value;
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / VALUE_MS);
      current.current = p < 1 ? from + (value - from) * VALUE_EASE(p) : value;
      setShown(current.current);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);

  return <T {...rest}>{format(Math.round(animate ? shown : value))}</T>;
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
  footer,
  stickyFooter = true,
}: {
  children: ReactNode;
  /** Espacio al final; también se descuenta al centrar, porque ahí suele ir la barra inferior. */
  bottom?: number;
  gap?: number;
  /** Barra fija al fondo (botones de guardar, siguiente…). `bottom` debe dejarle espacio. */
  footer?: ReactNode;
  /**
   * Con el teclado abierto: `true` deja el footer siempre encima del teclado;
   * `false` lo muestra solo al llegar al final del scroll, como parte del contenido.
   */
  stickyFooter?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const viewHeight = useRef(0);
  // Copias para el hilo de UI: el footer no fijo se mueve con el scroll.
  const scrollY = useSharedValue(0);
  const viewH = useSharedValue(0);
  const contentH = useSharedValue(0);

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

  // El teclado le quita espacio a la pantalla; si tapa el campo enfocado, se sube hasta él.
  const keyboard = useKeyboardHeight();
  const wrapStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.get() }));
  const footerStyle = useAnimatedStyle(() => {
    const kb = keyboard.get();
    // No fijo: sale de detrás del teclado a medida que se acerca el final del scroll.
    const toEnd = Math.min(kb, Math.max(0, contentH.get() - viewH.get() - scrollY.get()));
    return {
      bottom: stickyFooter ? kb : kb - toEnd,
      paddingBottom: 16 + Math.max(0, insets.bottom - kb),
    };
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      // Espera a que el ScrollView termine de encogerse para medir lo visible.
      timer = setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const sv = scroll.current;
        const inner = content.current;
        if (!input || !sv || !inner) return;
        input.measureLayout(
          inner,
          (_x, y, _w, h) => {
            const top = scrollY.get() + insets.top + 16;
            // `bottom` reserva el alto del footer, que puede quedar sobre el teclado.
            const end = scrollY.get() + viewHeight.current - bottom;
            if (y >= top && y + h <= end) return;
            sv.scrollTo({ y: Math.max(0, y + h + bottom - viewHeight.current), animated: true });
          },
          // El campo no está en esta pantalla (p. ej. dentro de un Sheet).
          () => {},
        );
      }, 260);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [bottom, insets.top, scrollY]);

  return (
    <ScreenScroll.Provider value={scrollIntoView}>
      <Animated.View style={[s.screen, wrapStyle]}>
        <ScrollView
          ref={scroll}
          // Los tipos de RN aún piden RefObject<View> sin null (anterior a React 19).
          innerViewRef={content as RefObject<View>}
          style={layout.fill}
          contentContainerStyle={[s.screenContent, { paddingTop: insets.top + 16, paddingBottom: bottom, gap }]}
          onLayout={(e) => {
            viewHeight.current = e.nativeEvent.layout.height;
            viewH.set(viewHeight.current);
          }}
          onContentSizeChange={(_w, h) => contentH.set(h)}
          onScroll={(e) => scrollY.set(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer && <Animated.View style={[common.footer, footerStyle]}>{footer}</Animated.View>}
      </Animated.View>
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
      {/* Una sola línea: si no cabe (p. ej. "Septiembre" junto a los botones), reduce la letra en vez de partir la palabra. */}
      <T serif w={600} size={32} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={s.headerTitle}>
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
  const animate = useContext(ValueMotion);
  const width = useSharedValue(w);
  useEffect(() => {
    width.value = animate ? withTiming(w, { duration: VALUE_MS, easing: VALUE_EASE }) : w;
  }, [w, width, animate]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View style={[s.progressTrack, { height, backgroundColor: track }]}>
      <Animated.View style={[s.progressFill, { height, backgroundColor: color }, fill]} />
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

/** Ícono (i) que abre o cierra la explicación de un campo. */
function InfoButton({ open, onPress, label, help }: { open: boolean; onPress: () => void; label: string; help: string }) {
  return (
    <Tap
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('ui.helpLabel', { label })}
      accessibilityHint={help}
      accessibilityState={{ expanded: open }}>
      <IconInfo size={16} color={open ? C.ink : C.muted} />
    </Tap>
  );
}

/** Explicación desplegada debajo de la etiqueta; se cierra al tocarla. */
function InfoNote({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Tap onPress={onClose} style={s.info} accessibilityLiveRegion="polite">
        <T size={12.5} color={C.muted2} style={s.infoText}>
          {text}
        </T>
      </Tap>
    </Animated.View>
  );
}

/**
 * Etiqueta de un campo. Con `help` muestra un ícono (i) al lado que despliega debajo
 * para qué sirve el campo y cómo llenarlo.
 */
export function Label({
  text,
  help,
  optional,
  w = 800,
  size = 14,
  color,
  style,
}: {
  text: string;
  help?: string;
  optional?: boolean;
  w?: Weight;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap={8} style={style}>
      <Row gap={6}>
        <T w={w} size={size} color={color} style={layout.shrink}>
          {text}
          {optional && (
            <T w={500} size={size} color={C.muted}>
              {' '}
              {t('common.optional')}
            </T>
          )}
        </T>
        {help && <InfoButton open={open} onPress={() => setOpen((v) => !v)} label={text} help={help} />}
      </Row>
      {open && help && <InfoNote text={help} onClose={() => setOpen(false)} />}
    </Stack>
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
  /** Explicación larga detrás de un ícono (i). */
  help?: string;
  on: boolean;
  onPress: () => void;
  accent?: string;
  first?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Row gap={12} style={[s.listRow, !first && s.divider]}>
      <Stack gap={2} style={layout.fill}>
        <Row gap={6}>
          <T w={700} size={14.5} style={layout.shrink}>
            {label}
          </T>
          {help && <InfoButton open={open} onPress={() => setOpen((v) => !v)} label={label} help={help} />}
        </Row>
        <T size={12.5} color={C.muted}>
          {desc}
        </T>
        {open && help && (
          <View style={s.infoGap}>
            <InfoNote text={help} onClose={() => setOpen(false)} />
          </View>
        )}
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

const SHEET_FADE_MS = 200;
const SHEET_SLIDE_MS = 280;
const SHEET_EASE = Easing.out(Easing.cubic);

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
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // El Modal sigue montado mientras corre la animación de cierre.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  const fade = useSharedValue(0); // fondo oscuro: solo aparece, no se desliza
  const slide = useSharedValue(0); // panel: sube desde abajo
  const keyboard = useKeyboardHeight();

  useEffect(() => {
    const ms = (n: number) => (reduceMotion ? 0 : n);
    if (visible) {
      // Primero se oscurece el fondo; después sube la hoja.
      fade.set(withTiming(1, { duration: ms(SHEET_FADE_MS), easing: SHEET_EASE }));
      slide.set(withDelay(ms(SHEET_FADE_MS - 60), withTiming(1, { duration: ms(SHEET_SLIDE_MS), easing: SHEET_EASE })));
    } else {
      // Al cerrar, al revés: baja la hoja y luego se aclara el fondo.
      slide.set(withTiming(0, { duration: ms(SHEET_SLIDE_MS - 60), easing: SHEET_EASE }));
      fade.set(
        withDelay(
          ms(SHEET_SLIDE_MS - 100),
          withTiming(0, { duration: ms(SHEET_FADE_MS - 40), easing: SHEET_EASE }, (done) => {
            if (done) scheduleOnRN(setMounted, false);
          }),
        ),
      );
    }
  }, [visible, reduceMotion, fade, slide]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  // La hoja se apoya sobre el teclado y se encoge para caber en lo que queda.
  const wrapStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    maxHeight: (height - keyboard.get()) * 0.85,
    paddingBottom: 24 + Math.max(0, insets.bottom - keyboard.get()),
    transform: [{ translateY: (1 - slide.get()) * height }],
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[s.sheetWrap, wrapStyle]}>
        <Animated.View style={[s.backdrop, backdropStyle]}>
          <Pressable style={layout.fill} onPress={onClose} accessibilityLabel={t('ui.closePanel')} />
        </Animated.View>
        <Animated.View style={[s.sheet, sheetStyle]}>
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
        </Animated.View>
      </Animated.View>
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
  /** Casilla pagado/pendiente en lugar de la inicial. */
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
