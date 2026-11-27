import { useEffect, useState } from 'react';
import { Image, View, type ImageResizeMode, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { Camera, Image as ImageIcon, type LucideIcon } from 'lucide-react-native';
import { metrics, radii, size, useColors } from '../../theme';
import { getAuthedImageSource } from '../../services/api';

type Source = { uri: string; headers?: Record<string, string> };

interface SmartImageProps {
  /** An API path or absolute URL (signed in automatically), or a ready source. */
  uri?: string | null;
  source?: Source | ImageSourcePropType | null;
  width: number | `${number}%`;
  height: number | `${number}%`;
  radius?: number;
  resizeMode?: ImageResizeMode;
  /** Fallback glyph: Image (products), Camera (defect / diary photos). */
  fallbackIcon?: LucideIcon;
  /** Thumbnail framing: `thumbFill` + 1dp hairline border. */
  framed?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The one image component. Handles the missing URL, loading and failed load
 * cases with the grey fallback tile. RN <Image> rather than expo-image so the
 * session headers still reach /objects (and so this ships over the air).
 */
export function SmartImage({ uri, source, width, height, radius = radii.md, resizeMode = 'cover', fallbackIcon = ImageIcon, framed, style, accessibilityLabel }: SmartImageProps) {
  const c = useColors();
  const resolved = source ?? (uri ? getAuthedImageSource(uri) : null);
  const key = resolved && typeof resolved === 'object' && 'uri' in resolved ? resolved.uri : String(resolved);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [key]);

  const showFallback = !resolved || failed;
  const FallbackGlyph = fallbackIcon;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: showFallback || !loaded ? c.greyFill : framed ? c.thumbFill : 'transparent',
          borderWidth: framed ? size.border : 0,
          borderColor: c.hairline,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {showFallback ? (
        <FallbackGlyph size={metrics.thumb.fallbackIcon} color={c.faint} strokeWidth={metrics.iconStroke} />
      ) : (
        <Image
          source={resolved as ImageSourcePropType}
          resizeMode={resizeMode}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </View>
  );
}

/** 48×48 product thumbnail (contain, framed). */
export function Thumb(props: Omit<SmartImageProps, 'width' | 'height' | 'framed' | 'resizeMode'> & { size?: number }) {
  const s = props.size ?? size.thumb;
  return <SmartImage {...props} width={s} height={s} framed resizeMode="contain" />;
}

/** 80×80 diary / defect photo tile (cover, camera fallback). */
export function PhotoTile(props: Omit<SmartImageProps, 'width' | 'height' | 'radius'>) {
  return <SmartImage fallbackIcon={Camera} {...props} width={metrics.thumb.diary} height={metrics.thumb.diary} radius={radii.lg} />;
}
