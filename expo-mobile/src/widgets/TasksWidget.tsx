// "Tasks" Home Screen widget (#40): up to 4 open tasks due today, each with a
// short job name. Never any money. A tap opens Tasks (buildpro://tasks).
//
// ⚠️ 'widget' component: pure, synchronous, no hooks, nothing referenced from
// outside the function. See TodayWidget.tsx.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type TasksWidgetTask = { id: string; title: string; job: string };

export type TasksWidgetProps = {
  signedIn: boolean;
  tasks: TasksWidgetTask[];
};

const TasksWidget = (props: TasksWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const url = 'buildpro://tasks';
  const plum = '#87749A';
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1F1C22' : '#FFFFFF';
  const ink = dark ? '#F4F1EC' : '#2C2825';
  const muted = dark ? '#A49E99' : '#6B6561';
  const family = environment.widgetFamily;
  const max = family === 'systemSmall' ? 2 : family === 'systemMedium' ? 3 : 4;
  const tasks = (props.tasks || []).slice(0, max);
  const extra = (props.tasks || []).length - tasks.length;

  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetURL(url), containerBackground(bg, 'widget')]}>
      <HStack spacing={4}>
        <Image systemName="checklist" size={12} color={plum} />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(plum)]}>Due today</Text>
        <Spacer />
      </HStack>
      {!props.signedIn ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(muted)]}>Sign in to see your tasks</Text>
      ) : tasks.length === 0 ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(muted)]}>Nothing due today</Text>
      ) : (
        <VStack alignment="leading" spacing={6}>
          {tasks.map((t) => (
            <HStack key={t.id} spacing={6} alignment="top">
              <Image systemName="circle" size={11} color={muted} />
              <VStack alignment="leading" spacing={0}>
                <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(ink), lineLimit(1)]}>{t.title}</Text>
                {t.job ? (
                  <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{t.job}</Text>
                ) : null}
              </VStack>
              <Spacer />
            </HStack>
          ))}
        </VStack>
      )}
      <Spacer />
      {extra > 0 ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{'+' + extra + ' more'}</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget('TasksWidget', TasksWidget, { signedIn: false, tasks: [] });
