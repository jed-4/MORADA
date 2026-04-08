// Web shim for @react-native-community/datetimepicker
// DateTimePicker is only used inside Platform.OS === 'ios' guards,
// so this just needs to be importable without crashing.
import { View } from 'react-native';
export default View;
export const DateTimePickerAndroid = { open: () => {} };
