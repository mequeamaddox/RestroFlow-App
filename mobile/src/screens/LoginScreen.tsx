import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSignIn, isClerkAPIResponseError } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/colors';
import { API_BASE } from '../lib/api';

type Step = 'email' | 'choose' | 'code' | 'link' | 'password';
type Factor = 'email_code' | 'email_link' | 'password';

function errorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? 'Something went wrong.';
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function LoginScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [factors, setFactors] = useState<Factor[]>([]);
  const [emailAddressId, setEmailAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelLinkRef = useRef<(() => void) | null>(null);

  async function finish(status: string | null, sessionId: string | null) {
    if (status === 'complete' && sessionId) {
      await setActive!({ session: sessionId });
    } else if (status === 'needs_second_factor') {
      setError('Your account requires two-step verification, which the app does not support yet. Please sign in on the website.');
    } else {
      setError('Sign-in could not be completed. Please try again.');
    }
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const handleContinue = () => run(async () => {
    if (!isLoaded || !signIn) return;
    const identifier = email.trim();
    if (!identifier) {
      setError('Enter your email address.');
      return;
    }
    const res = await signIn.create({ identifier });
    const supported = res.supportedFirstFactors ?? [];
    const available: Factor[] = [];
    let addressId: string | null = null;
    for (const f of supported) {
      if (f.strategy === 'email_code' || f.strategy === 'email_link') {
        addressId = f.emailAddressId;
        if (!available.includes(f.strategy)) available.push(f.strategy);
      }
      if (f.strategy === 'password' && !available.includes('password')) available.push('password');
    }
    if (available.length === 0) {
      setError('This account has no sign-in method the app supports. Please sign in on the website.');
      return;
    }
    setEmailAddressId(addressId);
    setFactors(available);
    setStep('choose');
  });

  const sendCode = () => run(async () => {
    if (!signIn || !emailAddressId) return;
    await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId });
    setCode('');
    setStep('code');
    setNotice(`We emailed a 6-digit code to ${email.trim()}.`);
  });

  const verifyCode = () => run(async () => {
    if (!signIn) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    const res = await signIn.attemptFirstFactor({ strategy: 'email_code', code: code.trim() });
    await finish(res.status, res.createdSessionId);
  });

  async function sendLink() {
    if (!signIn || !emailAddressId) return;
    setError(null);
    setNotice(null);
    setStep('link');
    const { startEmailLinkFlow, cancelEmailLinkFlow } = signIn.createEmailLinkFlow();
    cancelLinkRef.current = cancelEmailLinkFlow;
    try {
      const res = await startEmailLinkFlow({ emailAddressId, redirectUrl: `${API_BASE}/` });
      const verification = res.firstFactorVerification;
      if (verification.status === 'expired') {
        setError('That sign-in link expired. Send a new one.');
        setStep('choose');
        return;
      }
      await finish(res.status, res.createdSessionId);
    } catch (err) {
      setError(errorMessage(err));
      setStep('choose');
    } finally {
      cancelLinkRef.current = null;
    }
  }

  function cancelLink() {
    cancelLinkRef.current?.();
    cancelLinkRef.current = null;
    setStep('choose');
  }

  const submitPassword = () => run(async () => {
    if (!signIn) return;
    if (!password) {
      setError('Enter your password.');
      return;
    }
    const res = await signIn.attemptFirstFactor({ strategy: 'password', password });
    await finish(res.status, res.createdSessionId);
  });

  function startOver() {
    cancelLinkRef.current?.();
    cancelLinkRef.current = null;
    setStep('email');
    setCode('');
    setPassword('');
    setError(null);
    setNotice(null);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoSection}>
          <Text style={styles.monogram}>
            <Text style={{ color: colors.text }}>R</Text>
            <Text style={{ color: colors.accent }}>F</Text>
          </Text>
          <Text style={styles.appName}>RestroFlow</Text>
          <Text style={styles.tagline}>Restaurant Management</Text>
        </View>

        <View style={styles.card}>
          {step === 'email' && (
            <>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@restaurant.com"
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={handleContinue}
              />
              <PrimaryButton label="Continue" loading={loading} onPress={handleContinue} />
            </>
          )}

          {step === 'choose' && (
            <>
              <Text style={styles.cardTitle}>How do you want to sign in?</Text>
              <Text style={styles.sub}>{email.trim()}</Text>
              {factors.includes('email_code') && (
                <PrimaryButton label="Email me a code" loading={loading} onPress={sendCode} />
              )}
              {factors.includes('email_link') && (
                <SecondaryButton label="Email me a sign-in link" disabled={loading} onPress={sendLink} />
              )}
              {factors.includes('password') && (
                <SecondaryButton label="Use my password" disabled={loading} onPress={() => { setError(null); setStep('password'); }} />
              )}
              <LinkButton label="Use a different email" onPress={startOver} />
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.cardTitle}>Enter your code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.border}
                value={code}
                onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={verifyCode}
              />
              <PrimaryButton label="Sign In" loading={loading} onPress={verifyCode} />
              <LinkButton label="Resend code" onPress={sendCode} disabled={loading} />
              <LinkButton label="Use a different email" onPress={startOver} />
            </>
          )}

          {step === 'link' && (
            <>
              <Text style={styles.cardTitle}>Check your email</Text>
              <Text style={styles.sub}>
                We sent a sign-in link to {email.trim()}. Tap it on this phone or any device. This screen will sign you in automatically.
              </Text>
              <ActivityIndicator color={colors.accent} size="large" style={{ marginVertical: 20 }} />
              <LinkButton label="Cancel" onPress={cancelLink} />
            </>
          )}

          {step === 'password' && (
            <>
              <Text style={styles.cardTitle}>Enter your password</Text>
              <Text style={styles.sub}>{email.trim()}</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitPassword}
              />
              <PrimaryButton label="Sign In" loading={loading} onPress={submitPassword} />
              <LinkButton label="Back" onPress={() => { setError(null); setStep('choose'); }} />
            </>
          )}

          {notice && !error && <Text style={styles.notice}>{notice}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Text style={styles.footer}>Powered by RestroFlow Solutions</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({ label, loading, onPress }: { label: string; loading?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.secondary, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function LinkButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  monogram: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -3,
    marginBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  linkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  notice: {
    color: colors.success,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  footer: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 32,
    textAlign: 'center',
  },
});
