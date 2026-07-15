import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../services/api';
import { useTheme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }: { navigation: any }) {
  const { login, loginWithSession } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    inner: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    },
    header: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoImage: {
      width: 88,
      height: 88,
      borderRadius: 20,
      marginBottom: 16,
    },
    logo: {
      fontSize: 36,
      fontWeight: '700',
      color: theme.textPrimary,
      letterSpacing: 1,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 8,
    },
    googleButton: {
      backgroundColor: theme.card,
      borderRadius: 8,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    googleIcon: {
      fontSize: 18,
      fontWeight: '700',
      color: '#4285F4',
    },
    googleButtonText: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 24,
      gap: 12,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.border,
    },
    dividerText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    form: {
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.textSecondary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: theme.textPrimary,
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    forgotButton: {
      alignItems: 'center',
      marginTop: 16,
      paddingVertical: 4,
    },
    forgotText: {
      color: theme.textMuted,
      fontSize: 14,
    },
  }), [theme]);

  const handleGooglePress = async () => {
    setIsGoogleLoading(true);
    try {
      const redirectUri = makeRedirectUri({ preferLocalhost: false });
      const googleAuthUrl = `${API_BASE_URL}/api/auth/google?mobile=true&redirect_uri=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(googleAuthUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        const url = result.url;
        const params = new URL(url).searchParams;
        const sessionId = params.get('sessionId');
        const error = params.get('error');

        if (sessionId) {
          const loginResult = await loginWithSession(sessionId);
          if (!loginResult.success) {
            Alert.alert('Login Failed', loginResult.error || 'Could not complete sign in');
          }
        } else if (error) {
          Alert.alert('Google Login Failed', `Authentication error: ${error}`);
        } else {
          // Redirect came back without a session or an error — surface it
          // rather than silently doing nothing.
          Alert.alert('Google Login Failed', 'Sign-in did not complete. Please try again.');
        }
      }
    } catch (err) {
      console.error('Google auth browser error:', err);
      Alert.alert('Error', 'Could not open Google sign-in');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    const result = await login(email.trim(), password);
    setIsLoading(false);

    if (!result.success) {
      Alert.alert('Login Failed', result.error || 'Invalid credentials');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logo}>Morada</Text>
          <Text style={styles.subtitle}>Project Management for Builders</Text>
        </View>

        <TouchableOpacity
          style={[styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
          onPress={handleGooglePress}
          disabled={isGoogleLoading}
          activeOpacity={0.8}
        >
          {isGoogleLoading ? (
            <ActivityIndicator color={theme.textPrimary} />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={theme.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="email"
            editable={!isLoading}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            editable={!isLoading}
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
