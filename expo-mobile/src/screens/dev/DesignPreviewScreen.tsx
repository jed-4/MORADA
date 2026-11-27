import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Bell, Briefcase, Calendar, Camera, ClipboardList, FileText, Hammer, Layers, MessageSquare, Receipt, Search, SlidersHorizontal, SquarePen,
} from 'lucide-react-native';
import { colors, space, type, useColors } from '../../theme';

const palette = colors.projectFallback;
const metricsPreview = { emptyCard: 260 } as const; // preview-only frame for the empty state
import {
  AgendaStrip, Avatar, CalendarBlock, CaptureChip, Card, Checkbox, CollapsedGroupList, CommentComposer, DayDivider, DetailHeader,
  EmptyState, FAB, FAB_CLEARANCE, FilterChips, GanttBar, GanttOverflow, GroupHeader, ListRow, NowLine, PageHeader, PhotoTile,
  ProgressLine, ProjectSquare, PropertyRow, RootTitle, SaveActionBar, SecondaryActionBar, SectionCardHeader, SectionTile,
  Segmented, SheetHeader, StatusDot, TasksHeader, Thumb, TodayMarker, UnderlineTabs, UnreadBadge,
} from '../../components/kit';

/**
 * Design review only (DESIGN_PREVIEW). Every shared component with neutral
 * sample text. No real data, and nothing here saves anything.
 */
export default function DesignPreviewScreen() {
  const c = useColors();
  const navigation = useNavigation();
  const [tab, setTab] = useState<'list' | 'gantt' | 'calendar'>('list');
  const [seg, setSeg] = useState<'list' | 'week' | 'month'>('week');
  const [chip, setChip] = useState<'all' | 'open' | 'closed'>('open');
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(true);
  const [comment, setComment] = useState('');
  const noop = () => {};
  const sample = { name: 'Sample project', color: null, id: 'preview' };

  const Label = ({ children }: { children: string }) => (
    <Text style={[type.caption, { color: c.muted, marginTop: space.sectionRoot, marginBottom: space.groupHeaderToCard }]}>{children.toUpperCase()}</Text>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.screenX, paddingTop: space.screenTop, paddingBottom: FAB_CLEARANCE }}>
        <PageHeader
          title="Components"
          project={sample}
          onBack={() => navigation.goBack()}
          actions={[{ icon: Search, label: 'Search', onPress: noop }, { icon: SlidersHorizontal, label: 'Filter', onPress: noop }, { icon: Bell, label: 'Alerts', onPress: noop }]}
        />

        <Label>Root title</Label>
        <RootTitle title="Projects" count={12} actions={[{ icon: Search, label: 'Search', onPress: noop }]} />
        <Label>Tasks header</Label>
        <TasksHeader title="Tasks" project={sample} onBack={noop} />
        <Label>Detail header</Label>
        <DetailHeader onBack={noop} actions={[{ icon: SquarePen, label: 'Edit', onPress: noop }]} />
        <Label>Sheet header</Label>
        <SheetHeader title="Add defect" project={sample} onCancel={noop} onDone={noop} />

        <Label>Underline tabs</Label>
        <UnderlineTabs
          tabs={[{ key: 'list', label: 'List' }, { key: 'gantt', label: 'Gantt' }, { key: 'calendar', label: 'Calendar' }]}
          value={tab}
          onChange={setTab}
          nav={tab === 'list' ? undefined : { onPrev: noop, onToday: noop, onNext: noop }}
        />
        <Label>Segmented (Calendar tab)</Label>
        <Segmented options={[{ key: 'list', label: 'List' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }]} value={seg} onChange={setSeg} />
        <Label>Filter chips</Label>
        <FilterChips chips={[{ key: 'all', label: 'All', count: 9 }, { key: 'open', label: 'Open', count: 4 }, { key: 'closed', label: 'Closed', count: 5 }]} value={chip} onChange={setChip} />

        <Label>Group header + list card</Label>
        <GroupHeader title="Group title" meta={['3', '1/3']} open={open} onToggle={() => setOpen((o) => !o)} onOpen={noop} />
        {open ? (
          <Card variant="list">
            <ListRow lead={<Checkbox round checked={checked} onPress={() => setChecked((v) => !v)} />} title="A task title long enough to wrap onto a second line in the row" subtitle="Second line" trailing="Fri" />
            <ListRow lead={<Checkbox checked={done} onPress={() => setDone((v) => !v)} />} title="Checklist item" done={done} strike />
            <ListRow lead={<Thumb uri={null} />} title="Row with a missing image" subtitle={<StatusDot status="pending" label="Pending" small />} chevron onPress={noop} />
            <ListRow lead={<ProjectSquare fallbackKey="a" />} title="Row with a project square" trailing={<UnreadBadge count={3} />} onPress={noop} />
            <ListRow lead={<Avatar name="Sample Person" />} title="Row with an avatar" trailing="2.5h" />
          </Card>
        ) : null}
        <View style={{ height: space.section }} />
        <CollapsedGroupList groups={[{ key: 'a', title: 'Collapsed group', meta: '2/4', onPress: noop }, { key: 'b', title: 'Another group', trailing: '0/18', onPress: noop }]} />

        <Label>Section card</Label>
        <Card variant="section">
          <SectionCardHeader title="Section" count={4} icon={ClipboardList} open onToggle={noop} onOpen={noop} />
          <ListRow title="Inside a section card" trailing="Mon" />
        </Card>

        <Label>Property rows</Label>
        <Card variant="list">
          <PropertyRow label="Status"><StatusDot status="inProgress" label="In progress" /></PropertyRow>
          <PropertyRow label="Email" value="name@example.com" link onCopy={noop} />
          <PropertyRow label="Assignee"><Avatar size="chip" name="Sample Person" /><Text style={[type.body, { color: c.text }]}>Sample Person</Text></PropertyRow>
          <PropertyRow label="Due" placeholder="No due date" />
        </Card>
        <View style={{ height: space.section }} />
        <Card variant="list">
          <PropertyRow form label="Location" placeholder="Choose" onPress={noop} />
        </Card>

        <Label>Status dots</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.section }}>
          <StatusDot status="done" label="Done" />
          <StatusDot status="inProgress" label="In progress" />
          <StatusDot status="upcoming" label="Upcoming" />
          <StatusDot status="pending" label="Pending" />
          <StatusDot status="sent" label="Sent to trade" />
          <StatusDot status="rejected" label="Rejected" />
        </View>

        <Label>Progress</Label>
        <ProgressLine value={0.22} label="4 of 18 done" rightLabel="22%" />
        <View style={{ height: space.section }} />
        <ProgressLine value={0.48} inlineLabel="28 of 58" />
        <View style={{ height: space.section }} />
        <ProgressLine value={1} over label="Over budget" />

        <Label>Capture chips</Label>
        <View style={{ flexDirection: 'row', gap: space.inline }}>
          <CaptureChip icon={Camera} label="Photo" onPress={noop} />
          <CaptureChip icon={SquarePen} label="Note" onPress={noop} />
          <CaptureChip icon={Receipt} label="Bill" onPress={noop} />
        </View>
        <View style={{ height: space.section }} />
        <View style={{ flexDirection: 'row', gap: space.inline }}>
          <CaptureChip variant="sheet" icon={Briefcase} label="Project" onPress={noop} />
          <CaptureChip variant="sheet" icon={MessageSquare} label="Message" onPress={noop} />
        </View>

        <Label>Section tiles</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.groupHeaderToCard }}>
          <SectionTile icon={Calendar} label="Schedule" count={12} onPress={noop} />
          <SectionTile icon={Layers} label="Scope" count={18} onPress={noop} />
          <SectionTile icon={Hammer} label="Defects" count={3} onPress={noop} />
          <SectionTile icon={FileText} label="Documents" onPress={noop} />
          <SectionTile icon={ClipboardList} label="Checklists" count={2} onPress={noop} />
        </ScrollView>

        <Label>Images (missing / failed → grey tile)</Label>
        <View style={{ flexDirection: 'row', gap: space.rowGap }}>
          <Thumb uri={null} />
          <Thumb uri="/objects/does-not-exist.jpg" />
          <PhotoTile uri={null} />
        </View>

        <Label>Calendar</Label>
        <View style={{ flexDirection: 'row', gap: space.inline }}>
          <View style={{ flex: 1 }}><CalendarBlock title="Project event" time="9:00 – 10:30" color={palette[0]} height={60} /></View>
          <View style={{ flex: 1 }}><CalendarBlock title="Internal" time="11:00" height={36} /></View>
          <View style={{ flex: 1 }}><CalendarBlock variant="allDay" title="All day" color={palette[2]} /></View>
        </View>
        <View style={{ height: space.section }} />
        <Card variant="padded"><CalendarBlock variant="list" title="List view event" time="2:00 – 3:00 pm" color={palette[4]} /></Card>
        <View style={{ height: space.section }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.rowGap }}>
          <AgendaStrip color={palette[5]} />
          <Text style={[type.rowTitle, { color: c.text }]}>Agenda row</Text>
        </View>
        <View style={{ height: space.section }} />
        <NowLine label="10:42" gutter={40} />

        <Label>Gantt</Label>
        <View style={{ gap: space.inline }}>
          <GanttBar trade="slate" width={160} label="12 – 16" />
          <GanttBar trade="blue" width={28} label="18" />
          <GanttBar trade="teal" width={110} label="20 – 24" />
          <View style={{ flexDirection: 'row' }}><GanttBar trade="leave" width={60} /><View style={{ flex: 1 }} /><GanttOverflow label="3 Dec" /></View>
        </View>

        <Label>Markers</Label>
        <TodayMarker label="Today · Sample" />
        <View style={{ height: space.section }} />
        <DayDivider label="Yesterday" />

        <Label>Comment composer</Label>
        <CommentComposer value={comment} onChangeText={setComment} onSend={() => setComment('')} onAttach={noop} />

        <Label>Empty state</Label>
        <Card variant="padded" style={{ minHeight: metricsPreview.emptyCard }}>
          <EmptyState icon={Hammer} title="No defects yet" helper="Helper text explains what goes here and how to add the first one." />
        </Card>

        <Label>Action bars</Label>
        <SecondaryActionBar icon={MessageSquare} label="Post to project chat" onPress={noop} />
        <View style={{ height: space.section }} />
        <SaveActionBar onDone={noop} onPrimary={noop} primaryLabel="Save & next" />
        <View style={{ height: space.section }} />
        <SaveActionBar onDone={noop} onPrimary={noop} primaryLabel="Save & next" primaryDisabled />
      </ScrollView>
      <FAB onPress={noop} label="Add" />
    </SafeAreaView>
  );
}
