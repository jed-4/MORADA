import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  Alert,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type ViewInstance,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { cacheDirectory, copyAsync, makeDirectoryAsync } from 'expo-file-system/legacy';
import { useLayout } from '../../lib/useLayout';
import { haptic } from '../../lib/haptics';
import { isPhotoMarkupAvailable } from '../../lib/photos';
import { useTheme } from '../../theme';

// Full-screen photo markup: freehand pen, arrows and circles in a few colours,
// with undo. Save flattens the drawing onto the photo and writes a NEW JPEG
// (the original file is untouched).
//
// Easiest from a screen — the hook owns the modal:
//
//   const { markupPhoto, markupElement } = usePhotoMarkup();
//   const edited = await markupPhoto(uri);   // new file:// URI, or null if cancelled
//   ...
//   return <>{...screen...}{markupElement}</>;
//
// Or render <PhotoMarkup uri={uri} onCancel={...} onSave={newUri => ...} />
// yourself; it is open while `uri` is non-null.
//
// The saved image is a snapshot of the editor canvas (react-native-view-shot),
// so its resolution is the photo as shown on screen × the screen's pixel
// ratio — about 1200 px across on a phone, more on the unfolded Duo. That is
// plenty for a marked-up site photo or receipt but smaller than a raw camera
// original.

export type MarkupTool = 'pen' | 'arrow' | 'circle';

const COLOURS = ['#E5484D', '#F5B83D', '#3E8EF7', '#FFFFFF', '#1C1B19'];
const STROKE = 4;
const ARROW_HEAD = 18;
const MIN_SHAPE = 6;

/** Points are stored 0..1 across the canvas so a resize (Duo fold) keeps them in place. */
interface Shape {
  tool: MarkupTool;
  color: string;
  points: Array<[number, number]>;
}

interface PhotoMarkupProps {
  /** Photo to mark up. The editor is open while this is non-null. */
  uri: string | null;
  onCancel: () => void;
  /** Called with the new image's file:// URI. */
  onSave: (newUri: string) => void;
}

export function PhotoMarkup({ uri, onCancel, onSave }: PhotoMarkupProps) {
  return (
    <Modal
      visible={!!uri}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      // Without this iOS forces the modal (and so the app) back to portrait
      // on the unfolded Duo.
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {uri ? <MarkupEditor key={uri} uri={uri} onCancel={onCancel} onSave={onSave} /> : null}
    </Modal>
  );
}

/**
 * Hook form: `markupPhoto(uri)` opens the editor and resolves with the new
 * image URI, or null if the person cancels. Render `markupElement` once in
 * the screen.
 */
export function usePhotoMarkup(): {
  markupPhoto: (uri: string) => Promise<string | null>;
  markupElement: ReactElement;
} {
  const [uri, setUri] = useState<string | null>(null);
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const finish = useCallback((value: string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setUri(null);
  }, []);

  const markupPhoto = useCallback((photoUri: string) => new Promise<string | null>(resolve => {
    if (!isPhotoMarkupAvailable()) {
      Alert.alert('Update needed', 'Marking up photos needs the latest version of the app.');
      resolve(null);
      return;
    }
    resolver.current?.(null); // a second call cancels the first
    resolver.current = resolve;
    setUri(photoUri);
  }), []);

  // Resolve a pending promise if the screen unmounts mid-edit.
  useEffect(() => () => { resolver.current?.(null); resolver.current = null; }, []);

  const markupElement = (
    <PhotoMarkup uri={uri} onCancel={() => finish(null)} onSave={newUri => finish(newUri)} />
  );
  return { markupPhoto, markupElement };
}

// ── Editor ────────────────────────────────────────────────────────────────

function MarkupEditor({ uri, onCancel, onSave }: { uri: string; onCancel: () => void; onSave: (newUri: string) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<MarkupTool>('pen');
  const [color, setColor] = useState(COLOURS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // The shape being drawn lives in a ref (it changes on every touch move);
  // bumping `tick` re-renders it.
  const drawing = useRef<Shape | null>(null);
  const [, setTick] = useState(0);
  const canvasRef = useRef<ViewInstance>(null);

  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => setImageSize({ w, h }),
      () => setLoadFailed(true),
    );
  }, [uri]);

  // Photo fitted inside the stage (the area between the toolbars).
  const canvas = useMemo(() => {
    if (!imageSize || !stage || !imageSize.w || !imageSize.h) return null;
    const scale = Math.min(stage.w / imageSize.w, stage.h / imageSize.h);
    return { w: Math.floor(imageSize.w * scale), h: Math.floor(imageSize.h * scale) };
  }, [imageSize, stage]);

  // PanResponder is created once; it reads the live values through refs.
  const live = useRef({ tool, color, canvas });
  live.current = { tool, color, canvas };

  const toNorm = (e: GestureResponderEvent): [number, number] | null => {
    const c = live.current.canvas;
    if (!c) return null;
    const { locationX, locationY } = e.nativeEvent;
    return [
      Math.max(0, Math.min(1, locationX / c.w)),
      Math.max(0, Math.min(1, locationY / c.h)),
    ];
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      const p = toNorm(e);
      if (!p) return;
      drawing.current = { tool: live.current.tool, color: live.current.color, points: [p, p] };
      setTick(t => t + 1);
    },
    onPanResponderMove: e => {
      const shape = drawing.current;
      const p = toNorm(e);
      const c = live.current.canvas;
      if (!shape || !p || !c) return;
      if (shape.tool === 'pen') {
        const [lx, ly] = shape.points[shape.points.length - 1];
        // Skip sub-point jitter; keeps long strokes light.
        if (Math.hypot((p[0] - lx) * c.w, (p[1] - ly) * c.h) < 1.5) return;
        shape.points.push(p);
      } else {
        shape.points[1] = p;
      }
      setTick(t => t + 1);
    },
    onPanResponderRelease: () => commit(),
    onPanResponderTerminate: () => commit(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const commit = () => {
    const shape = drawing.current;
    drawing.current = null;
    const c = live.current.canvas;
    if (!shape || !c) { setTick(t => t + 1); return; }
    if (shape.tool !== 'pen') {
      const [[x1, y1], [x2, y2]] = shape.points;
      // A tap with the arrow or circle tool draws nothing.
      if (Math.hypot((x2 - x1) * c.w, (y2 - y1) * c.h) < MIN_SHAPE) { setTick(t => t + 1); return; }
    }
    setShapes(prev => [...prev, shape]);
  };

  const undo = () => {
    haptic.select();
    setShapes(prev => prev.slice(0, -1));
  };

  const save = async () => {
    if (!shapes.length || saving) return;
    setSaving(true);
    try {
      const shot = await captureRef(canvasRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' });
      // view-shot's tmpfile only lasts while the app runs; keep a cache copy.
      const dir = `${cacheDirectory}markup/`;
      await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const to = `${dir}markup_${Date.now()}.jpg`;
      const from = shot.startsWith('file://') ? shot : `file://${shot}`;
      await copyAsync({ from, to });
      haptic.success();
      onSave(to);
    } catch (e) {
      console.warn('Markup save failed:', e);
      haptic.error();
      Alert.alert("Couldn't save", 'The marked-up photo could not be saved. Please try again.');
      setSaving(false);
    }
  };

  const confirmCancel = () => {
    if (!shapes.length) { onCancel(); return; }
    haptic.warning();
    Alert.alert('Discard markup?', 'Your drawing on this photo will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onCancel },
    ]);
  };

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage({ w: width, h: height });
  };

  const renderShape = (shape: Shape, key: string | number) => {
    if (!canvas) return null;
    const pts = shape.points.map(([x, y]) => [x * canvas.w, y * canvas.h] as const);
    const common = {
      stroke: shape.color,
      strokeWidth: STROKE,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      fill: 'none',
    };
    if (shape.tool === 'pen') {
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      return <Path key={key} d={d} {...common} />;
    }
    const [[x1, y1], [x2, y2]] = pts;
    if (shape.tool === 'circle') {
      return (
        <Ellipse
          key={key}
          cx={(x1 + x2) / 2}
          cy={(y1 + y2) / 2}
          rx={Math.abs(x2 - x1) / 2}
          ry={Math.abs(y2 - y1) / 2}
          {...common}
        />
      );
    }
    // Arrow: shaft plus a two-stroke head at the end point.
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const spread = Math.PI / 6.5;
    const hx1 = x2 - ARROW_HEAD * Math.cos(angle - spread);
    const hy1 = y2 - ARROW_HEAD * Math.sin(angle - spread);
    const hx2 = x2 - ARROW_HEAD * Math.cos(angle + spread);
    const hy2 = y2 - ARROW_HEAD * Math.sin(angle + spread);
    const d = `M${x1} ${y1} L${x2} ${y2} M${hx1} ${hy1} L${x2} ${y2} L${hx2} ${hy2}`;
    return <Path key={key} d={d} {...common} />;
  };

  const tools: Array<{ id: MarkupTool; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
    { id: 'pen', icon: 'brush-outline', label: 'Pen' },
    { id: 'arrow', icon: 'arrow-forward-outline', label: 'Arrow' },
    { id: 'circle', icon: 'ellipse-outline', label: 'Circle' },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <StatusBar style="light" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={confirmCancel} style={styles.topBtn} hitSlop={8} accessibilityRole="button">
          <Text style={styles.topBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={undo}
          disabled={!shapes.length || saving}
          style={[styles.topBtn, styles.undoBtn, (!shapes.length || saving) && styles.disabled]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Ionicons name="arrow-undo-outline" size={20} color="#fff" />
          <Text style={styles.topBtnText}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={save}
          disabled={!shapes.length || saving}
          style={[styles.saveBtn, { backgroundColor: theme.primary }, (!shapes.length || saving) && styles.disabled]}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      {/* Stage */}
      <View style={styles.stage} onLayout={onStageLayout}>
        {loadFailed ? (
          <Text style={styles.message}>This photo couldn't be opened.</Text>
        ) : !canvas ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View
            ref={canvasRef}
            collapsable={false}
            style={{ width: canvas.w, height: canvas.h, backgroundColor: '#000' }}
          >
            <Image source={{ uri }} style={{ width: canvas.w, height: canvas.h }} resizeMode="contain" />
            <Svg width={canvas.w} height={canvas.h} style={StyleSheet.absoluteFill} pointerEvents="none">
              {shapes.map((s, i) => renderShape(s, i))}
              {drawing.current ? renderShape(drawing.current, 'live') : null}
            </Svg>
            {/* Touch surface: no children, so locationX/Y are canvas coordinates. */}
            <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
          </View>
        )}
      </View>

      {/* Tools + colours */}
      <View style={[styles.bottomBar, isWide && styles.bottomBarWide]}>
        <View style={styles.group}>
          {tools.map(t => {
            const active = tool === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => { haptic.select(); setTool(t.id); }}
                style={[styles.toolBtn, active && styles.toolBtnActive]}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={t.icon} size={22} color={active ? '#000' : '#fff'} />
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.group}>
          {COLOURS.map(c => {
            const active = color === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => { haptic.select(); setColor(c); }}
                style={[styles.swatchRing, active && styles.swatchRingActive]}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.swatch, { backgroundColor: c }]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  topBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topBtnText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  saveBtn: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8, minWidth: 72, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { color: '#fff', fontSize: 14 },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  bottomBarWide: { flexDirection: 'row', justifyContent: 'center', gap: 40 },
  group: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  toolBtnActive: { backgroundColor: '#fff' },
  swatchRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchRingActive: { borderColor: '#fff' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
});
