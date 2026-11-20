// "Today" Home Screen + Lock Screen widget (#40).
//
// Shows the clocked-in job with a live timer (or "Not clocked in"), hours
// logged today and the next schedule item. Never any money. No buttons in v1:
// a tap opens Timesheets (buildpro://timesheets).
//
// ⚠️ The function below is a 'widget' component: babel-preset-expo turns it
// into a string and the widget extension evaluates it in its own runtime. It
// must be pure and synchronous: no hooks, no async, and no references to
// anything outside the function (not even constants in this file). Props are
// JSON, so times arrive as epoch milliseconds.
//
// Data comes from src/services/widgetSnapshot.ts.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type TodayWidgetProps = {
  signedIn: boolean;
  clockedIn: boolean;
  /** Short job name for the clocked-in job ("" when not clocked in). */
  jobName: string;
  /** Clock-in instant, epoch ms (0 when not clocked in). */
  clockInMs: number;
  /** e.g. "2.5h logged today" */
  hoursLabel: string;
  /** Next schedule item name ("" when none). */
  nextTitle: string;
  /** e.g. "2611 · Today 7:00am" */
  nextDetail: string;
};

const TodayWidget = (props: TodayWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const url = 'buildpro://timesheets';
  const plum = '#87749A';
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1F1C22' : '#FFFFFF';
  const ink = dark ? '#F4F1EC' : '#2C2825';
  const muted = dark ? '#A49E99' : '#6B6561';
  const family = environment.widgetFamily;
  const start = new Date(props.clockInMs || 0);

  // ── Lock Screen ──
  if (family === 'accessoryInline') {
    if (!props.signedIn) {
      return <Text modifiers={[widgetURL(url)]}>Morada</Text>;
    }
    return props.clockedIn
      ? <Text date={start} dateStyle="timer" modifiers={[widgetURL(url), monospacedDigit()]} />
      : <Text modifiers={[widgetURL(url)]}>Not clocked in</Text>;
  }
  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={1} modifiers={[widgetURL(url), containerBackground('#00000000', 'widget')]}>
        <Image systemName={props.clockedIn ? 'clock.fill' : 'clock'} size={16} />
        {props.clockedIn ? (
          <Text date={start} dateStyle="timer" modifiers={[font({ size: 11, weight: 'semibold' }), monospacedDigit(), lineLimit(1)]} />
        ) : (
          <Text modifiers={[font({ size: 10 })]}>Off</Text>
        )}
      </VStack>
    );
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(url), containerBackground('#00000000', 'widget')]}>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1)]}>
          {props.signedIn ? (props.clockedIn ? props.jobName || 'Clocked in' : 'Not clocked in') : 'Morada'}
        </Text>
        {props.clockedIn ? (
          <Text date={start} dateStyle="timer" modifiers={[font({ size: 14 }), monospacedDigit()]} />
        ) : null}
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>
          {props.signedIn ? props.hoursLabel : 'Sign in to see today'}
        </Text>
      </VStack>
    );
  }

  // ── Home Screen ──
  if (!props.signedIn) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[widgetURL(url), containerBackground(bg, 'widget')]}>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(plum)]}>Morada</Text>
        <Spacer />
        <Text modifiers={[font({ size: 14 }), foregroundStyle(muted)]}>Sign in to see your day</Text>
      </VStack>
    );
  }

  const medium = family === 'systemMedium' || family === 'systemLarge';

  return (
    <VStack alignment="leading" spacing={3} modifiers={[widgetURL(url), containerBackground(bg, 'widget')]}>
      <HStack spacing={4}>
        <Image systemName={props.clockedIn ? 'clock.fill' : 'clock'} size={12} color={plum} />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(plum)]}>
          {props.clockedIn ? 'Clocked in' : 'Not clocked in'}
        </Text>
        <Spacer />
      </HStack>
      {props.clockedIn ? (
        <Text date={start} dateStyle="timer" modifiers={[font({ size: medium ? 30 : 26, weight: 'bold' }), monospacedDigit(), foregroundStyle(ink), lineLimit(1)]} />
      ) : null}
      {props.clockedIn ? (
        <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(ink), lineLimit(1)]}>{props.jobName}</Text>
      ) : null}
      <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>{props.hoursLabel}</Text>
      <Spacer />
      {props.nextTitle ? (
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>NEXT UP</Text>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(ink), lineLimit(medium ? 1 : 2)]}>{props.nextTitle}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{props.nextDetail}</Text>
        </VStack>
      ) : (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>Nothing scheduled</Text>
      )}
    </VStack>
  );
};

export default createWidget('TodayWidget', TodayWidget, {
  signedIn: false,
  clockedIn: false,
  jobName: '',
  clockInMs: 0,
  hoursLabel: '',
  nextTitle: '',
  nextDetail: '',
});
