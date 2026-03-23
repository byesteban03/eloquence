import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Platform,
  Animated,
  SafeAreaView,
  KeyboardAvoidingView,
  Alert,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../constants/tokens';

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'eloquence:settings:v1';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  fullName: string;
  emailSignature: string;
  openaiKey: string;
  apolloKey: string;
  linkedinCookie: string;
  notifyHotLeads: boolean;
}

const DEFAULTS: Settings = {
  fullName: '',
  emailSignature: '',
  openaiKey: '',
  apolloKey: '',
  linkedinCookie: '',
  notifyHotLeads: false,
};

// ─── Fade-in wrapper ──────────────────────────────────────────────────────────

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  label, value, onChangeText, placeholder,
  secure = false, showSecure, onToggleSecure, multiline = false,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secure?: boolean; showSecure?: boolean;
  onToggleSecure?: () => void; multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrapper, focused && styles.inputWrapperFocused]}>
        <TextInput
          style={[styles.input, multiline && { minHeight: 72, textAlignVertical: 'top' }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? ''}
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry={secure && !showSecure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          autoCorrect={false}
          autoCapitalize={secure ? 'none' : 'words'}
        />
        {secure && onToggleSecure && (
          <TouchableOpacity onPress={onToggleSecure} style={styles.eyeBtn} activeOpacity={0.7}>
            <Text style={styles.eyeIcon}>{showSecure ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, value, onChange,
}: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: Spacing.md }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? <Text style={styles.toggleDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.border, true: Colors.accent + '55' }}
        thumbColor={value ? Colors.accent : Colors.textTertiary}
        ios_backgroundColor={Colors.border}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [settings, setSettings]       = useState<Settings>(DEFAULTS);
  const [showOpenai, setShowOpenai]   = useState(false);
  const [showApollo, setShowApollo]   = useState(false);
  const [showLinkedin, setShowLinkedin] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch (e) {
        console.warn('[settings] Load error:', e);
      }
    })();
  }, []);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setSaveError(null);
  }, []);

  const handleNotifToggle = async (value: boolean) => {
    if (value && Platform.OS !== 'web') {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Notifications désactivées',
          'Autorisez les notifications dans les réglages iOS pour cette fonctionnalité.',
          [{ text: 'OK' }]
        );
        return;
      }
    }
    update('notifyHotLeads', value);
  };

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError('Impossible de sauvegarder. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Réglages</Text>
          <Text style={styles.headerSub}>Configuration de l'application</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ① Profil */}
          <FadeIn delay={0}>
            <View style={styles.card}>
              <SectionHeader
                title="👤  Profil utilisateur"
                subtitle="Utilisé pour personnaliser les emails générés par l'IA"
              />
              <FieldRow
                label="Nom complet"
                value={settings.fullName}
                onChangeText={v => update('fullName', v)}
                placeholder="Esteban Niochet"
              />
              <View style={styles.divider} />
              <FieldRow
                label="Signature email"
                value={settings.emailSignature}
                onChangeText={v => update('emailSignature', v)}
                placeholder="Esteban — Scénographie France"
                multiline
              />
              <View style={styles.hint}>
                <Text style={styles.hintTxt}>
                  ℹ️  Cette signature est injectée automatiquement en fin de chaque email généré par GPT-4o.
                </Text>
              </View>
            </View>
          </FadeIn>

          {/* ② Clés API */}
          <FadeIn delay={60}>
            <View style={styles.card}>
              <SectionHeader
                title="🔑  Clés API"
                subtitle="Stockées uniquement sur votre appareil"
              />
              <View style={styles.warningBanner}>
                <Text style={styles.warningTxt}>🔒 Ne partagez jamais ces clés. Elles ne sont envoyées à aucun serveur.</Text>
              </View>
              <FieldRow label="OpenAI API Key" value={settings.openaiKey} onChangeText={v => update('openaiKey', v)}
                placeholder="sk-proj-..." secure showSecure={showOpenai} onToggleSecure={() => setShowOpenai(p => !p)} />
              <View style={styles.divider} />
              <FieldRow label="Apollo.io API Key" value={settings.apolloKey} onChangeText={v => update('apolloKey', v)}
                placeholder="api_key_..." secure showSecure={showApollo} onToggleSecure={() => setShowApollo(p => !p)} />
              <View style={styles.divider} />
              <FieldRow label="Cookie LinkedIn (li_at)" value={settings.linkedinCookie} onChangeText={v => update('linkedinCookie', v)}
                placeholder="AQEDAREqwXYZ..." secure showSecure={showLinkedin} onToggleSecure={() => setShowLinkedin(p => !p)} />
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Comment trouver li_at ?',
                  '1. Connectez-vous sur LinkedIn dans Chrome\n2. Ouvrez DevTools (F12)\n3. Application → Cookies → www.linkedin.com\n4. Copiez la valeur de "li_at"',
                  [{ text: 'Compris' }]
                )}
              >
                <Text style={styles.linkTxt}>❓ Comment trouver le cookie li_at ?</Text>
              </TouchableOpacity>
            </View>
          </FadeIn>

          {/* ③ Notifications */}
          <FadeIn delay={120}>
            <View style={styles.card}>
              <SectionHeader title="🔔  Notifications" />
              <ToggleRow
                label="Alerter pour les leads chauds"
                description={`Reçois une notification dès qu'une opportunité "Qualifié chaud" est détectée`}
                value={settings.notifyHotLeads}
                onChange={handleNotifToggle}
              />
              {Platform.OS === 'web' && (
                <View style={styles.webNote}>
                  <Text style={styles.webNoteTxt}>
                    ⚠️ Les notifications push ne sont pas disponibles sur le web.
                  </Text>
                </View>
              )}
            </View>
          </FadeIn>

          <FadeIn delay={180}>
            <View style={styles.versionRow}>
              <Text style={styles.versionTxt}>Éloquence v1.0.0 · Scénographie France</Text>
            </View>
          </FadeIn>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Save bar */}
        <View style={styles.saveBar}>
          {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[styles.saveBtn, saved && styles.saveBtnSuccess, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.saveBtnTxt}>
                {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.base },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, color: Colors.textPrimary, letterSpacing: -0.4 },
  headerSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 3 },

  scrollContent: { padding: Spacing.lg, gap: Spacing.lg },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  sectionHeader: { gap: 3 },
  sectionTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.lg, color: Colors.textPrimary },
  sectionSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },

  fieldRow: { gap: 6 },
  fieldLabel: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs, color: Colors.textSecondary, letterSpacing: 0.3, textTransform: 'uppercase' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.elevated, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  inputWrapperFocused: { borderColor: Colors.accent },
  input: {
    flex: 1,
    fontFamily: 'Outfit_400Regular', fontSize: FontSize.md,
    color: Colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  eyeBtn: { padding: 6 },
  eyeIcon: { fontSize: 15 },

  divider: { height: 0.5, backgroundColor: Colors.border },

  hint: { backgroundColor: Colors.accentMuted, borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 0.5, borderColor: Colors.accent + '44' },
  hintTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.accent, lineHeight: 17 },

  warningBanner: { backgroundColor: Colors.warningMuted, borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 0.5, borderColor: Colors.warning + '44' },
  warningTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17 },

  linkTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.accent },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs },
  toggleLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary, marginBottom: 2 },
  toggleDesc: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },

  webNote: { backgroundColor: Colors.warningMuted, borderRadius: Radius.sm, padding: Spacing.sm },
  webNoteTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.warning },

  versionRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  versionTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.3 },

  saveBar: {
    backgroundColor: Colors.base,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
    padding: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 24 : Spacing.lg,
    gap: 8,
  },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnSuccess: { backgroundColor: Colors.success },
  saveBtnTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary },
  saveError: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs, color: Colors.danger, textAlign: 'center' },
});
