// "Diary photo" Lock Screen widget (#41 fallback).
//
// expo-widgets 58 has no iOS 18 Control Center / Action button controls, so
// this one-tap shortcut is a Lock Screen accessory instead: a tap opens the
// app straight into the home Quick capture "Photo to diary" camera flow
// (buildpro://capture/photo). No background action.
//
// ⚠️ 'widget' component: pure, synchronous, nothing from outside the function.
import { Image, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type DiaryPhotoWidgetProps = { signedIn: boolean };

const DiaryPhotoWidget = (props: DiaryPhotoWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const url = props.signedIn ? 'buildpro://capture/photo' : 'buildpro://';
  if (environment.widgetFamily === 'accessoryInline') {
    return <Text modifiers={[widgetURL(url)]}>Diary photo</Text>;
  }
  return (
    <VStack spacing={1} modifiers={[widgetURL(url), containerBackground('#00000000', 'widget')]}>
      <Image systemName="camera.fill" size={18} />
      <Text modifiers={[font({ size: 9, weight: 'semibold' })]}>Diary</Text>
    </VStack>
  );
};

export default createWidget('DiaryPhotoWidget', DiaryPhotoWidget, { signedIn: false });
