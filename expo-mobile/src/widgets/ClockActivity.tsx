// Clock-in Live Activity (#39): job name + a running timer on the Lock Screen
// and in the Dynamic Island. Started when you clock in on this phone, ended
// on clock-out (src/services/liveActivity.ts). The timer is the system's
// self-counting Text timer, so nothing has to update it.
//
// ⚠️ 'widget' component: pure, synchronous, nothing from outside the function.
// Live Activities are NOT listed in the expo-widgets `widgets` config.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, lineLimit, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type ClockActivityProps = {
  /** Short job name, e.g. "2611" or "Smith Residence". */
  jobName: string;
  /** Clock-in instant, epoch ms. */
  clockInMs: number;
};

const ClockActivity = (props: ClockActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const plum = environment.isLuminanceReduced ? '#FFFFFF' : '#B7A6C9';
  const start = new Date(props.clockInMs);
  const job = props.jobName || 'Clocked in';

  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        <Image systemName="clock.fill" size={22} color={plum} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 16, weight: 'bold' }), lineLimit(1)]}>{job}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle('#A49E99')]}>Clocked in · Morada</Text>
        </VStack>
        <Spacer />
        <Text
          date={start}
          dateStyle="timer"
          modifiers={[font({ size: 28, weight: 'semibold' }), monospacedDigit(), frame({ width: 110, alignment: 'trailing' })]}
        />
      </HStack>
    ),
    compactLeading: <Image systemName="clock.fill" color={plum} />,
    compactTrailing: (
      <Text
        date={start}
        dateStyle="timer"
        modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit(), frame({ width: 56, alignment: 'trailing' })]}
      />
    ),
    minimal: <Image systemName="clock.fill" color={plum} />,
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 6 })]}>
        <Image systemName="clock.fill" color={plum} />
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{job}</Text>
      </HStack>
    ),
    expandedTrailing: (
      <Text
        date={start}
        dateStyle="timer"
        modifiers={[font({ size: 22, weight: 'semibold' }), monospacedDigit(), frame({ width: 100, alignment: 'trailing' })]}
      />
    ),
    expandedBottom: (
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#A49E99')]}>Tap to open Timesheets</Text>
    ),
  };
};

export default createLiveActivity('ClockActivity', ClockActivity);
