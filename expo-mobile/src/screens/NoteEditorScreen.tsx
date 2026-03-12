import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, uploadPhoto, API_BASE_URL, getSessionId } from '../services/api';

type Props = {
  navigation: any;
  route: any;
};

type BlockType = 'text' | 'h1' | 'h2' | 'bullet' | 'numbered' | 'todo' | 'divider' | 'image';

interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  src?: string;
  uploading?: boolean;
}

let blockCounter = 0;
function makeBlockId(): string {
  blockCounter += 1;
  return `b-${Date.now()}-${blockCounter}`;
}

function defaultBlock(): Block {
  return { id: makeBlockId(), type: 'text', text: '' };
}

function blocksToHtml(blocks: Block[]): string {
  let html = '';
  let inUl = false;
  let inOl = false;
  let olIndex = 0;

  const closeList = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; olIndex = 0; }
  };

  for (const block of blocks) {
    if (block.type !== 'bullet' && inUl) closeList();
    if (block.type !== 'numbered' && inOl) closeList();

    switch (block.type) {
      case 'h1':
        html += `<h1>${escapeHtml(block.text)}</h1>`;
        break;
      case 'h2':
        html += `<h2>${escapeHtml(block.text)}</h2>`;
        break;
      case 'bullet':
        if (!inUl) { html += '<ul>'; inUl = true; }
        html += `<li>${escapeHtml(block.text)}</li>`;
        break;
      case 'numbered':
        if (!inOl) { html += '<ol>'; inOl = true; olIndex = 0; }
        olIndex++;
        html += `<li>${escapeHtml(block.text)}</li>`;
        break;
      case 'todo':
        html += `<ul data-type="taskList"><li data-type="taskItem" data-checked="${block.checked ? 'true' : 'false'}"><label><input type="checkbox" ${block.checked ? 'checked' : ''}><span></span></label><div>${escapeHtml(block.text)}</div></li></ul>`;
        break;
      case 'divider':
        html += '<hr>';
        break;
      case 'image':
        if (block.src) {
          html += `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.text || '')}" />`;
          if (block.text) html += `<p data-image-caption="true"><em>${escapeHtml(block.text)}</em></p>`;
        }
        break;
      default:
        html += `<p>${escapeHtml(block.text) || '<br>'}</p>`;
    }
  }
  closeList();
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlToBlocks(html: string): Block[] {
  if (!html || html.trim().length === 0) return [defaultBlock()];

  const blocks: Block[] = [];
  let cursor = 0;

  const findClosingTag = (source: string, tag: string, startAfterOpen: number): { inner: string; endIdx: number } | null => {
    const closeTag = `</${tag}>`;
    const closeIdx = source.toLowerCase().indexOf(closeTag.toLowerCase(), startAfterOpen);
    if (closeIdx === -1) return null;
    return {
      inner: source.slice(startAfterOpen, closeIdx),
      endIdx: closeIdx + closeTag.length,
    };
  };

  while (cursor < html.length) {
    const remaining = html.slice(cursor);

    const imgMatch = remaining.match(/^[\s\n]*<img(\s[^>]*?)\s*\/?>/i);
    if (imgMatch) {
      const srcMatch = imgMatch[1].match(/src="([^"]*)"/i);
      const altMatch = imgMatch[1].match(/alt="([^"]*)"/i);
      let caption = altMatch ? altMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : '';
      let advanceTo = remaining.indexOf(imgMatch[0]) + imgMatch[0].length;
      const afterImg = remaining.slice(advanceTo);
      const captionMatch = afterImg.match(/^[\s\n]*<p[^>]*data-image-caption="true"[^>]*><em>([\s\S]*?)<\/em><\/p>/i);
      if (captionMatch) {
        caption = stripTags(captionMatch[1]);
        advanceTo += afterImg.indexOf(captionMatch[0]) + captionMatch[0].length;
      } else if (!caption) {
        const fallbackCaption = afterImg.match(/^[\s\n]*<p[^>]*><em>([\s\S]*?)<\/em><\/p>/i);
        if (fallbackCaption) {
          caption = stripTags(fallbackCaption[1]);
          advanceTo += afterImg.indexOf(fallbackCaption[0]) + fallbackCaption[0].length;
        }
      }
      blocks.push({
        id: makeBlockId(),
        type: 'image',
        text: caption,
        src: srcMatch ? srcMatch[1].replace(/&amp;/g, '&') : '',
      });
      cursor += advanceTo;
      continue;
    }

    const openMatch = remaining.match(/^[\s\n]*<(h[1-3]|p|ul|ol|hr|blockquote)(\s[^>]*)?\s*\/?>/i);

    if (!openMatch) {
      const nextTagIdx = remaining.search(/<(h[1-3]|p|ul|ol|hr|blockquote|img)[\s>\/]/i);
      if (nextTagIdx > 0) {
        const skipped = remaining.slice(0, nextTagIdx).trim();
        if (skipped && !skipped.match(/^[\s\n]*$/)) {
          const plainText = stripTags(skipped);
          if (plainText) {
            blocks.push({ id: makeBlockId(), type: 'text', text: plainText });
          }
        }
        cursor += nextTagIdx;
        continue;
      }
      const leftover = stripTags(remaining).trim();
      if (leftover) {
        leftover.split('\n').filter(l => l.trim()).forEach(line => {
          blocks.push({ id: makeBlockId(), type: 'text', text: line });
        });
      }
      break;
    }

    const tag = openMatch[1].toLowerCase();
    const attrs = openMatch[2] || '';
    const fullOpenLen = openMatch[0].length;

    if (tag === 'hr') {
      blocks.push({ id: makeBlockId(), type: 'divider', text: '' });
      cursor += remaining.indexOf(openMatch[0]) + fullOpenLen;
      continue;
    }

    const afterOpen = cursor + remaining.indexOf(openMatch[0]) + fullOpenLen;
    const closed = findClosingTag(html, tag, afterOpen);
    if (!closed) {
      cursor = afterOpen;
      continue;
    }

    const inner = closed.inner;
    cursor = closed.endIdx;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      blocks.push({
        id: makeBlockId(),
        type: tag === 'h1' ? 'h1' : 'h2',
        text: stripTags(inner),
      });
    } else if (tag === 'p') {
      blocks.push({
        id: makeBlockId(),
        type: 'text',
        text: stripTags(inner).replace(/\n/g, ''),
      });
    } else if (tag === 'blockquote') {
      blocks.push({
        id: makeBlockId(),
        type: 'text',
        text: stripTags(inner),
      });
    } else if (tag === 'ul' || tag === 'ol') {
      const isTaskList = attrs.includes('data-type="taskList"') || inner.includes('data-type="taskItem"');

      if (isTaskList) {
        const taskItemRegex = /data-checked="(true|false)"[\s\S]*?<div>([\s\S]*?)<\/div>/gi;
        let taskMatch;
        while ((taskMatch = taskItemRegex.exec(inner)) !== null) {
          blocks.push({
            id: makeBlockId(),
            type: 'todo',
            text: stripTags(taskMatch[2]),
            checked: taskMatch[1] === 'true',
          });
        }
      } else {
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liRegex.exec(inner)) !== null) {
          blocks.push({
            id: makeBlockId(),
            type: tag === 'ul' ? 'bullet' : 'numbered',
            text: stripTags(liMatch[1]),
          });
        }
      }
    }
  }

  if (blocks.length === 0) {
    const plainText = stripTags(html).trim();
    if (plainText) {
      plainText.split('\n').filter(l => l.trim()).forEach((line) => {
        blocks.push({ id: makeBlockId(), type: 'text', text: line });
      });
    } else {
      blocks.push(defaultBlock());
    }
  }

  return blocks;
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.type !== 'divider')
    .map((b) => {
      if (b.type === 'image') return b.text ? `[Image: ${b.text}]` : '[Image]';
      return b.text;
    })
    .join('\n');
}

const TOOLBAR_ITEMS: { type: BlockType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: 'text-outline' },
  { type: 'h1', label: 'H1', icon: 'text-outline' },
  { type: 'h2', label: 'H2', icon: 'text-outline' },
  { type: 'bullet', label: 'Bullet', icon: 'list-outline' },
  { type: 'numbered', label: '1.', icon: 'list-outline' },
  { type: 'todo', label: 'Todo', icon: 'checkbox-outline' },
  { type: 'divider', label: '---', icon: 'remove-outline' },
];

export default function NoteEditorScreen({ navigation, route }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const noteId = route.params?.noteId || null;

  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([defaultBlock()]);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(noteId);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loadingNote, setLoadingNote] = useState(!!noteId);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [visibility, setVisibility] = useState<'private' | 'team_only' | 'everyone'>('private');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const blocksRef = useRef(blocks);
  const titleRef = useRef(title);
  const savedNoteIdRef = useRef(savedNoteId);
  const visibilityRef = useRef(visibility);
  const isCreatingRef = useRef(false);

  blocksRef.current = blocks;
  titleRef.current = title;
  savedNoteIdRef.current = savedNoteId;
  visibilityRef.current = visibility;

  const colors = isDark
    ? {
        bg: '#0f172a',
        text: '#f1f5f9',
        secondary: '#94a3b8',
        border: '#334155',
        accent: '#b196d2',
        placeholder: '#64748b',
        toolbarBg: '#1e293b',
        toolbarBorder: '#334155',
        activeBtn: '#b196d2',
        inactiveBtn: '#64748b',
        checkboxBg: '#334155',
        checkboxChecked: '#b196d2',
        dividerColor: '#334155',
      }
    : {
        bg: '#ffffff',
        text: '#0f172a',
        secondary: '#64748b',
        border: '#e2e8f0',
        accent: '#9b7fc4',
        placeholder: '#94a3b8',
        toolbarBg: '#f8fafc',
        toolbarBorder: '#e2e8f0',
        activeBtn: '#9b7fc4',
        inactiveBtn: '#94a3b8',
        checkboxBg: '#e2e8f0',
        checkboxChecked: '#9b7fc4',
        dividerColor: '#e2e8f0',
      };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    }
  }, [noteId]);

  const loadNote = async (id: string) => {
    setLoadingNote(true);
    try {
      const response = await apiRequest(`/api/notes/${id}`);
      if (response.ok) {
        const note = await response.json();
        setTitle(note.title === 'Untitled' ? '' : (note.title || ''));
        if (note.visibility === 'team_only' || note.visibility === 'everyone' || note.visibility === 'private') {
          setVisibility(note.visibility);
        }
        if (note.contentHtml) {
          setBlocks(htmlToBlocks(note.contentHtml));
        } else if (note.content) {
          const lines = note.content.split('\n');
          setBlocks(
            lines.length > 0
              ? lines.map((l: string) => ({ id: makeBlockId(), type: 'text' as BlockType, text: l }))
              : [defaultBlock()]
          );
        } else {
          setBlocks([defaultBlock()]);
        }
      } else {
        Alert.alert('Error', 'Failed to load note.');
        navigation.goBack();
      }
    } catch {
      Alert.alert('Error', 'Failed to load note.');
      navigation.goBack();
    } finally {
      setLoadingNote(false);
    }
  };

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('idle');
    saveTimerRef.current = setTimeout(() => {
      doSave();
    }, 1500);
  }, []);

  const doSave = async () => {
    const currentTitle = titleRef.current;
    const currentBlocks = blocksRef.current;
    const currentSavedId = savedNoteIdRef.current;

    if (!currentTitle.trim() && currentBlocks.every((b) => !b.text.trim() && b.type !== 'divider' && b.type !== 'image')) {
      return;
    }

    if (!currentSavedId && isCreatingRef.current) {
      saveTimerRef.current = setTimeout(() => doSave(), 500);
      return;
    }

    const contentHtml = blocksToHtml(currentBlocks);
    const plainBody = blocksToPlainText(currentBlocks);
    const content = [currentTitle, plainBody].filter(Boolean).join('\n');
    const contentText = plainBody;

    setSaveStatus('saving');

    try {
      if (currentSavedId) {
        const response = await apiRequest(`/api/notes/${currentSavedId}`, 'PATCH', {
          title: currentTitle || 'Untitled',
          content,
          contentHtml,
          contentText,
        });
        if (response.ok) {
          setSaveStatus('saved');
        } else {
          setSaveStatus('idle');
        }
      } else {
        isCreatingRef.current = true;
        try {
          const response = await apiRequest('/api/notes', 'POST', {
            title: currentTitle || 'Untitled',
            content,
            contentHtml,
            contentText,
            type: 'note',
            scope: 'personal',
            visibility: visibilityRef.current,
            category: 'General',
            priority: 'low',
          });
          if (response.ok) {
            const newNote = await response.json();
            setSavedNoteId(newNote.id);
            savedNoteIdRef.current = newNote.id;
            setSaveStatus('saved');
          } else {
            setSaveStatus('idle');
          }
        } finally {
          isCreatingRef.current = false;
        }
      }
    } catch {
      isCreatingRef.current = false;
      setSaveStatus('idle');
    }
  };

  const updateTitle = (val: string) => {
    setTitle(val);
    scheduleSave();
  };

  const updateBlockText = (blockId: string, newText: string) => {
    const normalized = newText.replace(/\r\n/g, '\n');
    const nlIdx = normalized.indexOf('\n');
    if (nlIdx !== -1) {
      const lines = normalized.split('\n');
      const firstLine = lines[0];
      const remainingLines = lines.slice(1);
      const block = blocksRef.current.find((b) => b.id === blockId);
      if (!block) return;

      const isListType = block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo';
      if (isListType && firstLine === '' && remainingLines.length === 1 && remainingLines[0] === '') {
        setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, type: 'text' as BlockType, text: '' } : b)));
        scheduleSave();
        return;
      }

      const nextType: BlockType = isListType ? block.type : 'text';
      const newBlocks: Block[] = remainingLines.map((line) => {
        const nb: Block = { id: makeBlockId(), type: nextType, text: line };
        if (nextType === 'todo') nb.checked = false;
        return nb;
      });
      const lastNewBlock = newBlocks[newBlocks.length - 1];

      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === blockId);
        const updated = prev.map((b) => (b.id === blockId ? { ...b, text: firstLine } : b));
        updated.splice(idx + 1, 0, ...newBlocks);
        return updated;
      });
      setTimeout(() => {
        if (lastNewBlock) {
          inputRefs.current[lastNewBlock.id]?.focus();
          setFocusedBlockId(lastNewBlock.id);
        }
      }, 50);
      scheduleSave();
      return;
    }

    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, text: normalized } : b)));
    scheduleSave();
  };

  const updateBlockType = (blockId: string, type: BlockType) => {
    if (type === 'divider') {
      insertDividerAfter(blockId);
      return;
    }
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, type } : b)));
    scheduleSave();
  };

  const toggleTodoCheck = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, checked: !b.checked } : b))
    );
    scheduleSave();
  };

  const insertDividerAfter = (afterId: string) => {
    const divBlock: Block = { id: makeBlockId(), type: 'divider', text: '' };
    const textBlock: Block = { id: makeBlockId(), type: 'text', text: '' };
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === afterId);
      const updated = [...prev];
      updated.splice(idx + 1, 0, divBlock, textBlock);
      return updated;
    });
    setTimeout(() => {
      inputRefs.current[textBlock.id]?.focus();
      setFocusedBlockId(textBlock.id);
    }, 100);
    scheduleSave();
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((b) => b.id === blockId);
      const updated = prev.filter((b) => b.id !== blockId);
      const focusIdx = Math.max(0, idx - 1);
      setTimeout(() => {
        const focusBlock = updated[focusIdx];
        if (focusBlock && focusBlock.type !== 'divider') {
          inputRefs.current[focusBlock.id]?.focus();
          setFocusedBlockId(focusBlock.id);
        }
      }, 50);
      return updated;
    });
    scheduleSave();
  };

  const handleBlockKeyPress = (blockId: string, key: string) => {
    if (key === 'Backspace') {
      const block = blocksRef.current.find((b) => b.id === blockId);
      if (block && block.text === '' && blocksRef.current.length > 1) {
        removeBlock(blockId);
      }
    }
  };

  const getBlockStyle = (type: BlockType) => {
    switch (type) {
      case 'h1':
        return { fontSize: 26, fontWeight: '700' as const, lineHeight: 34 };
      case 'h2':
        return { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 };
      default:
        return { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 };
    }
  };

  const getNumberForBlock = (blockId: string): number => {
    let count = 0;
    for (const b of blocksRef.current) {
      if (b.type === 'numbered') count++;
      if (b.id === blockId) return count;
    }
    return 1;
  };

  const renderBlock = (block: Block, index: number) => {
    if (block.type === 'divider') {
      return (
        <View key={block.id} style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.dividerColor }]} />
          <TouchableOpacity
            style={styles.dividerDelete}
            onPress={() => removeBlock(block.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={colors.placeholder} />
          </TouchableOpacity>
        </View>
      );
    }

    if (block.type === 'image') {
      return (
        <View key={block.id} style={[styles.imageBlock, { borderColor: colors.border }]}>
          {block.uploading ? (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.border }]}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.uploadingText, { color: colors.secondary }]}>Uploading...</Text>
            </View>
          ) : block.src ? (
            <Image
              source={{
                uri: block.src,
                headers: block.src.startsWith('http')
                  ? { 'X-Session-ID': getSessionId() || '' }
                  : undefined,
              }}
              style={styles.blockImage}
              resizeMode="cover"
            />
          ) : null}
          <View style={styles.imageCaptionRow}>
            <TextInput
              ref={(r) => { inputRefs.current[block.id] = r; }}
              style={[styles.imageCaption, { color: colors.secondary }]}
              placeholder="Add a caption..."
              placeholderTextColor={colors.placeholder}
              value={block.text}
              onChangeText={(val) => {
                setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, text: val } : b)));
                scheduleSave();
              }}
              onFocus={() => setFocusedBlockId(block.id)}
              multiline
              scrollEnabled={false}
            />
            <TouchableOpacity
              onPress={() => removeBlock(block.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.placeholder} />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const blockStyle = getBlockStyle(block.type);
    const prefix =
      block.type === 'bullet'
        ? '\u2022  '
        : block.type === 'numbered'
        ? `${getNumberForBlock(block.id)}.  `
        : '';

    return (
      <View key={block.id} style={styles.blockRow}>
        {block.type === 'todo' && (
          <TouchableOpacity
            onPress={() => toggleTodoCheck(block.id)}
            style={[
              styles.checkbox,
              {
                backgroundColor: block.checked ? colors.checkboxChecked : 'transparent',
                borderColor: block.checked ? colors.checkboxChecked : colors.secondary,
              },
            ]}
          >
            {block.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
          </TouchableOpacity>
        )}
        {prefix !== '' && (
          <Text
            style={[
              styles.blockPrefix,
              { color: colors.secondary, fontSize: blockStyle.fontSize },
            ]}
          >
            {prefix}
          </Text>
        )}
        <TextInput
          ref={(r) => { inputRefs.current[block.id] = r; }}
          style={[
            styles.blockInput,
            {
              color: block.type === 'todo' && block.checked ? colors.secondary : colors.text,
              fontSize: blockStyle.fontSize,
              fontWeight: blockStyle.fontWeight,
              lineHeight: blockStyle.lineHeight,
              textDecorationLine: block.type === 'todo' && block.checked ? 'line-through' : 'none',
            },
          ]}
          value={block.text}
          onChangeText={(val) => updateBlockText(block.id, val)}
          onKeyPress={({ nativeEvent }) => handleBlockKeyPress(block.id, nativeEvent.key)}
          onFocus={() => setFocusedBlockId(block.id)}
          placeholder={
            index === 0 && blocks.length === 1
              ? 'Start writing...'
              : block.type === 'todo'
              ? 'To-do'
              : ''
          }
          placeholderTextColor={colors.placeholder}
          multiline
          scrollEnabled={false}
        />
      </View>
    );
  };

  const VISIBILITY_LABELS: Record<string, string> = {
    private: 'Just Me (Private)',
    team_only: 'My Team',
    everyone: 'Everyone in Company',
  };

  const handleChangeVisibility = () => {
    const current = visibilityRef.current;
    Alert.alert(
      'Who can see this note?',
      `Currently: ${VISIBILITY_LABELS[current] || current}`,
      [
        {
          text: 'Just Me (Private)',
          onPress: () => applyVisibility('private'),
        },
        {
          text: 'My Team',
          onPress: () => applyVisibility('team_only'),
        },
        {
          text: 'Everyone in Company',
          onPress: () => applyVisibility('everyone'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const applyVisibility = async (newVisibility: 'private' | 'team_only' | 'everyone') => {
    setVisibility(newVisibility);
    const currentSavedId = savedNoteIdRef.current;
    if (currentSavedId) {
      try {
        await apiRequest(`/api/notes/${currentSavedId}`, 'PATCH', { visibility: newVisibility });
      } catch {
        // Non-critical — next auto-save will persist it
      }
    }
  };

  const handleTapBelow = () => {
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text' && lastBlock.text === '') {
      inputRefs.current[lastBlock.id]?.focus();
      setFocusedBlockId(lastBlock.id);
    } else {
      const newBlock = defaultBlock();
      setBlocks((prev) => [...prev, newBlock]);
      setTimeout(() => {
        inputRefs.current[newBlock.id]?.focus();
        setFocusedBlockId(newBlock.id);
      }, 50);
    }
  };

  const handleImagePick = () => {
    Keyboard.dismiss();
    setTimeout(() => {
      Alert.alert('Add Photo', undefined, [
        {
          text: 'Choose from Library',
          onPress: () => pickImage('library'),
        },
        {
          text: 'Take Photo',
          onPress: () => pickImage('camera'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }, 300);
  };

  const pickImage = async (source: 'library' | 'camera') => {
    try {
      if (source === 'library') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please allow camera access in Settings.');
          return;
        }
      }

      const result = source === 'library'
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'] as any,
            allowsEditing: true,
            quality: 0.8,
          })
        : await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.8,
          });

      if (result.canceled || !result.assets?.[0]) return;

      const imageUri = result.assets[0].uri;
      const imageBlock: Block = {
        id: makeBlockId(),
        type: 'image',
        text: '',
        uploading: true,
      };

      const insertAfterIdx = focusedBlockId
        ? blocksRef.current.findIndex((b) => b.id === focusedBlockId)
        : blocksRef.current.length - 1;

      setBlocks((prev) => {
        const updated = [...prev];
        updated.splice(insertAfterIdx + 1, 0, imageBlock);
        return updated;
      });

      try {
        const { objectPath } = await uploadPhoto(imageUri);
        const src = `${API_BASE_URL}${objectPath}`;
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === imageBlock.id ? { ...b, src, uploading: false } : b
          )
        );
        scheduleSave();
      } catch (uploadErr: any) {
        Alert.alert('Upload Failed', uploadErr?.message || 'Could not upload the photo. Please try again.');
        setBlocks((prev) => prev.filter((b) => b.id !== imageBlock.id));
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not access photos. Please check permissions in Settings.');
    }
  };

  const focusedBlock = blocks.find((b) => b.id === focusedBlockId);

  if (loadingNote) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.saveIndicator}>
          {saveStatus === 'saving' && (
            <>
              <ActivityIndicator size="small" color={colors.secondary} />
              <Text style={[styles.saveText, { color: colors.secondary }]}>Saving...</Text>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={[styles.saveText, { color: colors.accent }]}>Saved</Text>
            </>
          )}
        </View>
        <TouchableOpacity
          onPress={handleChangeVisibility}
          style={styles.visibilityBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={
              visibility === 'private'
                ? 'lock-closed-outline'
                : visibility === 'everyone'
                ? 'earth-outline'
                : 'people-outline'
            }
            size={16}
            color={visibility === 'private' ? colors.secondary : colors.accent}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (savedNoteId) {
              Alert.alert('Note Options', undefined, [
                {
                  text: 'Pin / Unpin',
                  onPress: async () => {
                    try {
                      const noteRes = await apiRequest(`/api/notes/${savedNoteId}`);
                      if (noteRes.ok) {
                        const n = await noteRes.json();
                        const resp = await apiRequest(`/api/notes/${savedNoteId}`, 'PATCH', { pinned: !n.pinned });
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({}));
                          Alert.alert('Error', err.message || 'Failed to update pin status.');
                        }
                      }
                    } catch {
                      Alert.alert('Error', 'Failed to update note.');
                    }
                  },
                },
                {
                  text: `Visibility: ${VISIBILITY_LABELS[visibility] || visibility}`,
                  onPress: handleChangeVisibility,
                },
                {
                  text: 'Archive',
                  onPress: async () => {
                    const response = await apiRequest(`/api/notes/${savedNoteId}/archive`, 'POST');
                    if (response.ok) {
                      navigation.goBack();
                    } else {
                      Alert.alert('Error', 'Failed to archive note.');
                    }
                  },
                },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    const response = await apiRequest(`/api/notes/${savedNoteId}`, 'DELETE');
                    if (response.ok || response.status === 204) {
                      navigation.goBack();
                    } else {
                      Alert.alert('Error', 'Failed to delete note.');
                    }
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }
          }}
          style={styles.moreBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.editorContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            value={title}
            onChangeText={updateTitle}
            placeholder="Untitled"
            placeholderTextColor={colors.placeholder}
            multiline
            blurOnSubmit
            onSubmitEditing={() => {
              const firstBlock = blocks[0];
              if (firstBlock && firstBlock.type !== 'divider') {
                inputRefs.current[firstBlock.id]?.focus();
              }
            }}
          />
          {blocks.map((block, index) => renderBlock(block, index))}
          <TouchableOpacity
            style={styles.tapBelowZone}
            activeOpacity={1}
            onPress={handleTapBelow}
          />
        </ScrollView>

        {keyboardVisible && (
          <View style={[styles.toolbar, { backgroundColor: colors.toolbarBg, borderTopColor: colors.toolbarBorder }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent}>
              {TOOLBAR_ITEMS.map((item) => {
                const isActive = focusedBlock?.type === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    style={[
                      styles.toolbarBtn,
                      isActive && { backgroundColor: colors.accent + '22' },
                    ]}
                    onPress={() => {
                      if (focusedBlockId) {
                        updateBlockType(focusedBlockId, item.type);
                      }
                    }}
                  >
                    {item.type === 'h1' ? (
                      <Text style={[styles.toolbarLabel, { color: isActive ? colors.activeBtn : colors.inactiveBtn, fontWeight: '700', fontSize: 16 }]}>H1</Text>
                    ) : item.type === 'h2' ? (
                      <Text style={[styles.toolbarLabel, { color: isActive ? colors.activeBtn : colors.inactiveBtn, fontWeight: '600', fontSize: 15 }]}>H2</Text>
                    ) : item.type === 'numbered' ? (
                      <Text style={[styles.toolbarLabel, { color: isActive ? colors.activeBtn : colors.inactiveBtn, fontWeight: '500' }]}>1.</Text>
                    ) : item.type === 'bullet' ? (
                      <Text style={[styles.toolbarLabel, { color: isActive ? colors.activeBtn : colors.inactiveBtn, fontSize: 20, lineHeight: 22 }]}>{'\u2022'}</Text>
                    ) : item.type === 'divider' ? (
                      <Ionicons name="remove-outline" size={20} color={isActive ? colors.activeBtn : colors.inactiveBtn} />
                    ) : item.type === 'todo' ? (
                      <Ionicons name="checkbox-outline" size={18} color={isActive ? colors.activeBtn : colors.inactiveBtn} />
                    ) : (
                      <Ionicons name="text-outline" size={18} color={isActive ? colors.activeBtn : colors.inactiveBtn} />
                    )}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={handleImagePick}
              >
                <Ionicons name="image-outline" size={18} color={colors.inactiveBtn} />
              </TouchableOpacity>
              <View style={styles.toolbarSpacer} />
              <TouchableOpacity style={styles.toolbarBtn} onPress={() => Keyboard.dismiss()}>
                <Ionicons name="chevron-down" size={20} color={colors.inactiveBtn} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 8,
  },
  saveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 13,
    fontWeight: '500',
  },
  moreBtn: {
    padding: 8,
  },
  visibilityBtn: {
    padding: 8,
  },
  editorContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexGrow: 1,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 36,
    minHeight: 44,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    minHeight: 32,
  },
  blockPrefix: {
    paddingTop: Platform.OS === 'ios' ? 0 : 2,
    fontWeight: '500',
    width: 24,
  },
  blockInput: {
    flex: 1,
    padding: 0,
    margin: 0,
    minHeight: 28,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 10,
    marginTop: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dividerLine: {
    height: 1,
    flex: 1,
  },
  dividerDelete: {
    marginLeft: 8,
    opacity: 0.6,
  },
  tapBelowZone: {
    minHeight: 300,
    flex: 1,
  },
  toolbar: {
    borderTopWidth: 1,
    paddingVertical: 6,
  },
  toolbarContent: {
    paddingHorizontal: 12,
    gap: 4,
    alignItems: 'center',
  },
  toolbarBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  toolbarSpacer: {
    flex: 1,
    minWidth: 20,
  },
  imageBlock: {
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    gap: 8,
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  blockImage: {
    width: '100%',
    height: 250,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  imageCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  imageCaption: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
    padding: 0,
    minHeight: 20,
  },
});
