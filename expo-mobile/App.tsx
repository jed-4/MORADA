import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </AuthProvider>
  );
}
