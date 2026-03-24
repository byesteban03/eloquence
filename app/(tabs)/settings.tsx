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
  Modal,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../constants/tokens';
import { supabase } from '../../lib/supabase';
import { usePlan } from '../../hooks/usePlan';
import PaywallScreen from '../paywall';
import { PLANS } from '../../constants/plans';
import { SIGNAUX_BIBLIOTHEQUE, SignalCode } from '../../constants/signaux';

// ─── Design System (Linear/Premium) ───────────────────────────────────────────

const C = {
  base: '#0E0E0F',
  surface: '#161618',
  elevated: '#1E1E21',
  border: '#2A2A2E',
  borderSubtle: '#1A1A1C',
  textPrimary: '#F0EEE8',
  textSecondary: '#888780',
  textTertiary: '#5E5D58',
  accent: '#5D5DFF',
  accentMuted: '#5D5DFF22',
  success: '#22C55E',
  successMuted: '#22C55E11',
  warning: '#F59E0B',
  warningMuted: '#F59E0B11',
  danger: '#EF4444',
};

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

interface ZoneCible {
  id: string;
  nom: string;
  type: string;
  active: boolean;
  code_postal?: string;
}

interface UserSignal {
  code: string;
  active: boolean;
}

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
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
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
            <Ionicons name={showSecure ? "eye-off-outline" : "eye-outline"} size={16} color={C.textTertiary} />
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
        trackColor={{ false: C.border, true: C.accentMuted }}
        thumbColor={value ? C.accent : C.textTertiary}
        ios_backgroundColor={C.border}
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
  const [showPaywall, setShowPaywall] = useState(false);
  
  const [zones, setZones] = useState<ZoneCible[]>([]);
  const [userSignaux, setUserSignaux] = useState<Record<string, boolean>>({});
  const [loadingZones, setLoadingZones] = useState(true);

  const { plan: currentPlan, loading: planLoading } = usePlan();

  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        await Promise.all([loadZones(), loadSignaux()]);
      } catch (e) {
        console.warn('[settings] Load error:', e);
      }
    })();
  }, []);

  const loadZones = async () => {
    setLoadingZones(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('zones_cibles').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setZones(data || []);
    setLoadingZones(false);
  };

  const loadSignaux = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('types_signaux').select('*').eq('user_id', user.id);
    const map: Record<string, boolean> = {};
    data?.forEach(s => map[s.code] = s.active);
    setUserSignaux(map);
  };

  const toggleZone = async (id: string, current: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setZones(prev => prev.map(z => z.id === id ? { ...z, active: !current } : z));
    await supabase.from('zones_cibles').update({ active: !current }).eq('id', id);
  };

  const toggleSignal = async (code: string) => {
    const current = !!userSignaux[code];
    // Check plan limits
    const signalDef = SIGNAUX_BIBLIOTHEQUE.find(s => s.code === code);
    const allowed = currentPlan === 'team' || 
                   (currentPlan === 'pro' && signalDef?.plan_minimum !== 'team') ||
                   (currentPlan === 'free' && signalDef?.plan_minimum === 'free');
    
    if (!allowed && !current) {
      setShowPaywall(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUserSignaux(prev => ({ ...prev, [code]: !current }));
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('types_signaux').upsert({
      user_id: user.id,
      code,
      active: !current
    }, { onConflict: 'user_id,code' });
  };

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
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Réglages</Text>
            <Text style={styles.headerSub}>Configuration de l'application</Text>
          </View>
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeTxt}>{PLANS[currentPlan].nom.toUpperCase()}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ⓪ Abonnement */}
          <FadeIn delay={0}>
            <View style={styles.card}>
              <SectionHeader title="Abonnement" subtitle="Gérez votre plan et vos limites" />
              <View style={[styles.planCard, currentPlan === 'pro' && styles.planCardPro, currentPlan === 'team' && styles.planCardTeam]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>{PLANS[currentPlan].nom}</Text>
                  <Text style={styles.planStatus}>
                    {currentPlan === 'free' ? 'Plan gratuit' : 'Abonnement actif'}
                  </Text>
                </View>
                {!planLoading && (
                  <TouchableOpacity style={styles.upgradeBtn} onPress={() => setShowPaywall(true)}>
                    <Text style={styles.upgradeBtnTxt}>{currentPlan === 'free' ? 'Upgrade' : 'Détails'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {currentPlan === 'free' && (
                <View style={styles.limitHint}>
                  <Ionicons name="information-circle-outline" size={14} color={C.textTertiary} />
                  <Text style={styles.limitHintTxt}>
                    Vous êtes limité à 3 analyses et 10 opportunités par mois.
                  </Text>
                </View>
              )}
            </View>
          </FadeIn>
          {/* ① Profil */}
          <FadeIn delay={0}>
            <View style={styles.card}>
              <SectionHeader
                title="Profil utilisateur"
                subtitle="Utilisé pour personnaliser les emails générés par l'IA"
              />
              <FieldRow
                label="Nom complet"
                value={settings.fullName}
                onChangeText={v => update('fullName', v)}
                placeholder="Ex: Esteban Niochet"
              />
              <View style={styles.divider} />
              <FieldRow
                label="Signature email"
                value={settings.emailSignature}
                onChangeText={v => update('emailSignature', v)}
                placeholder="Ex: Esteban — Scénographie France"
                multiline
              />
              <View style={styles.hint}>
                <Ionicons name="sparkles-outline" size={14} color={C.accent} />
                <Text style={styles.hintTxt}>
                  Cette signature est injectée automatiquement en fin de chaque email généré par l'IA.
                </Text>
              </View>
            </View>
          </FadeIn>

          {/* ② Clés API */}
          <FadeIn delay={60}>
            <View style={styles.card}>
              <SectionHeader
                title="Clés API"
                subtitle="Stockées uniquement sur votre appareil"
              />
              <View style={styles.warningBanner}>
                <Ionicons name="shield-checkmark-outline" size={14} color={C.warning} />
                <Text style={styles.warningTxt}>Sécurité : Ces clés ne sont jamais transmises à nos serveurs.</Text>
              </View>
              <FieldRow label="OpenAI API Key" value={settings.openaiKey} onChangeText={v => update('openaiKey', v)}
                placeholder="sk-proj-..." secure showSecure={showOpenai} onToggleSecure={() => setShowOpenai(p => !p)} />
              <View style={styles.divider} />
              <FieldRow label="Apollo.io API Key" value={settings.apolloKey} onChangeText={v => update('apolloKey', v)}
                placeholder="api_key_..." secure showSecure={showApollo} onToggleSecure={() => setShowApollo(p => !p)} />
              <View style={styles.divider} />
              <FieldRow label="Cookie LinkedIn (li_at)" value={settings.linkedinCookie} onChangeText={v => update('linkedinCookie', v)}
                placeholder="AQEDARE..." secure showSecure={showLinkedin} onToggleSecure={() => setShowLinkedin(p => !p)} />
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Configuration LinkedIn',
                  '1. Connectez-vous sur LinkedIn (Chrome)\n2. Inspecter → Application → Cookies\n3. Copiez la valeur de "li_at"',
                  [{ text: 'OK' }]
                )}
                style={styles.helpLink}
              >
                <Ionicons name="help-circle-outline" size={14} color={C.accent} />
                <Text style={styles.linkTxt}>Comment trouver le cookie li_at ?</Text>
              </TouchableOpacity>
            </View>
          </FadeIn>

          {/* ③ Ciblage Géographique */}
          <FadeIn delay={120}>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <SectionHeader title="Ciblage géographique" subtitle="Zones surveillées" />
                <TouchableOpacity style={styles.addBtn} onPress={() => Alert.alert('Configuration', 'L\'ajout de zone se fait via l\'interface de prospection.')}>
                  <Text style={styles.addBtnTxt}>+ AJOUTER</Text>
                </TouchableOpacity>
              </View>
              
              {loadingZones ? (
                <ActivityIndicator size="small" color={C.accent} style={{ marginVertical: 20 }} />
              ) : zones.length === 0 ? (
                <Text style={styles.emptyTxt}>Aucune zone configurée.</Text>
              ) : (
                zones.map(z => (
                  <View key={z.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{z.nom}</Text>
                      <Text style={styles.itemSub}>{z.type === 'rayon' ? 'RADAR 50KM' : z.code_postal ? `CP ${z.code_postal}` : z.type.toUpperCase()}</Text>
                    </View>
                    <Switch
                      value={z.active}
                      onValueChange={() => toggleZone(z.id, z.active)}
                      trackColor={{ false: C.border, true: C.accentMuted }}
                      thumbColor={z.active ? C.accent : C.textTertiary}
                    />
                  </View>
                ))
              )}
            </View>
          </FadeIn>

          {/* ④ Signaux d'affaires */}
          <FadeIn delay={140}>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <SectionHeader 
                  title="Signaux d'affaires" 
                  subtitle={currentPlan === 'free' 
                    ? `Activez les événements (${Object.values(userSignaux).filter(Boolean).length}/2 actifs)` 
                    : "Activez les événements à détecter"
                  } 
                />
                {currentPlan === 'free' && (
                  <View style={styles.limitBadge}>
                    <Text style={styles.limitBadgeTxt}>
                      {Object.values(userSignaux).filter(Boolean).length}/2 ACTIFS
                    </Text>
                  </View>
                )}
              </View>
              {SIGNAUX_BIBLIOTHEQUE.map(s => {
                const isActive = !!userSignaux[s.code];
                const activeCount = Object.values(userSignaux).filter(Boolean).length;
                
                // New dynamic logic: 2 signals max for FREE
                const isLocked = currentPlan === 'free' && !isActive && activeCount >= 2;
                
                // TEAM specific signals still locked for PRO
                const isTeamLocked = currentPlan === 'pro' && s.plan_minimum === 'team' && !isActive;
                
                const finalLocked = isLocked || isTeamLocked;

                return (
                    <View key={s.code} style={styles.itemRow}>
                      <View style={[styles.signalIcon, isActive && { backgroundColor: C.accent + "11" }]}>
                        <Ionicons 
                          name={s.icon as any} 
                          size={18} 
                          color={isActive ? C.accent : C.textTertiary} 
                        />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.itemTitle, finalLocked && { color: C.textTertiary }]}>{s.nom}</Text>
                        {finalLocked && <Ionicons name="lock-closed" size={10} color={C.textTertiary} />}
                      </View>
                      <Text style={styles.itemSub} numberOfLines={1}>{s.description.toUpperCase()}</Text>
                    </View>
                    <Switch
                      value={isActive}
                      onValueChange={() => {
                        if (!isActive && finalLocked) {
                          setShowPaywall(true);
                          return;
                        }
                        toggleSignal(s.code);
                      }}
                      trackColor={{ false: C.border, true: C.accentMuted }}
                      thumbColor={isActive ? C.accent : C.textTertiary}
                    />
                  </View>
                );
              })}
            </View>
          </FadeIn>

          {/* ⑤ Notifications */}
          <FadeIn delay={160}>
            <View style={styles.card}>
              <SectionHeader title="Notifications" />
              <ToggleRow
                label="Leads chauds"
                description={`Alerte dès qu'une opportunité prioritare est détectée`}
                value={settings.notifyHotLeads}
                onChange={handleNotifToggle}
              />
              {Platform.OS === 'web' && (
                <View style={styles.webNote}>
                  <Ionicons name="warning-outline" size={14} color={C.warning} />
                  <Text style={styles.webNoteTxt}>
                    Notifications push indisponibles sur le web.
                  </Text>
                </View>
              )}
            </View>
          </FadeIn>

          <FadeIn delay={150}>
            <View style={styles.dangerSection}>
              <SectionHeader title="Zone de danger" />
              <TouchableOpacity
                onPress={async () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  supabase.auth.signOut();
                }}
                style={styles.logoutBtn}
              >
                <Ionicons name="log-out-outline" size={18} color={C.danger} />
                <Text style={styles.logoutBtnTxt}>Déconnexion</Text>
              </TouchableOpacity>
            </View>
          </FadeIn>

          <FadeIn delay={180}>
            <View style={styles.versionRow}>
              <Text style={styles.versionTxt}>ÉLOQUENCE V1.0.0 · © 2026 GROUPE ASC</Text>
            </View>
          </FadeIn>

          <View style={{ height: 180 }} />
        </ScrollView>

        <Modal visible={showPaywall} animationType="slide" presentationStyle="pageSheet">
          <PaywallScreen trigger="manual" onClose={() => setShowPaywall(false)} />
        </Modal>

        {/* Save bar */}
        <View style={styles.saveBar}>
          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnSuccess, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            <Text style={styles.saveBtnTxt}>
              {saving ? 'ENREGISTREMENT...' : saved ? 'ENREGISTRÉ' : 'ENREGISTRER'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.base },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: C.textPrimary, letterSpacing: -0.6 },
  headerSub: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: C.textTertiary, marginTop: 2 },

  planBadge: {
    backgroundColor: C.elevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  planBadgeTxt: { fontFamily: 'Outfit_700Bold', fontSize: 10, color: C.textSecondary, letterSpacing: 0.5 },

  scrollContent: { paddingHorizontal: 20, gap: 24 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderSubtle,
  },

  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontFamily: 'Outfit_700Bold', fontSize: 11, color: C.textTertiary, letterSpacing: 1 },
  sectionSub: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: C.textSecondary, marginTop: 4, lineHeight: 18 },

  fieldRow: { marginBottom: 16 },
  fieldLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: C.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  inputWrapperFocused: { borderColor: C.accent },
  input: {
    flex: 1,
    fontFamily: 'Outfit_400Regular',
    fontSize: 15,
    color: C.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  eyeBtn: { padding: 8 },

  divider: { height: 1, backgroundColor: C.borderSubtle, marginVertical: 4, marginBottom: 16 },

  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentMuted, padding: 10, borderRadius: 8 },
  hintTxt: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: C.accent, flex: 1, lineHeight: 18 },

  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.warningMuted, padding: 10, borderRadius: 8, marginBottom: 16 },
  warningTxt: { fontFamily: 'Outfit_500Medium', fontSize: 12, color: C.warning, flex: 1 },

  helpLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  linkTxt: { fontFamily: 'Outfit_500Medium', fontSize: 13, color: C.accent },

  addBtn: { backgroundColor: C.elevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: C.border },
  addBtnTxt: { fontFamily: 'Outfit_700Bold', fontSize: 10, color: C.textSecondary, letterSpacing: 0.5 },

  limitBadge: { backgroundColor: C.accentMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  limitBadgeTxt: { fontFamily: 'Outfit_700Bold', fontSize: 9, color: C.accent, letterSpacing: 0.5 },

    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      gap: 12,
    },
    signalIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
    },    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  itemTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: C.textPrimary },
  itemSub: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: C.textTertiary, letterSpacing: 0.5, marginTop: 2 },

  emptyTxt: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center', paddingVertical: 20 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  toggleLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: C.textPrimary },
  toggleDesc: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 16 },

  webNoteTxt: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: C.warning },

  dangerSection: { gap: 12 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.danger + '44',
    backgroundColor: C.danger + '11',
  },
  logoutBtnTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: C.danger },

  versionRow: { alignItems: 'center', marginTop: 16 },
    versionTxt: { fontFamily: "Outfit_400Regular", fontSize: 10, color: C.textTertiary, letterSpacing: 0.5, opacity: 0.8 },

  saveBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: C.base,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90, // Further increased to clear floating tab bar
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  saveBtn: { backgroundColor: C.textPrimary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnSuccess: { backgroundColor: C.success },
  saveBtnTxt: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: C.base, letterSpacing: 0.5 },

  // Plan card (legacy style adjusted)
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  planCardPro: { borderColor: C.accent, backgroundColor: C.accent + '11' },
  planCardTeam: { borderColor: C.success, backgroundColor: C.success + '11' },
  planName: { fontFamily: 'Outfit_700Bold', fontSize: 17, color: C.textPrimary },
  planStatus: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: C.textSecondary },
  upgradeBtn: { backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  upgradeBtnTxt: { fontFamily: 'Outfit_700Bold', fontSize: 11, color: '#FFF' },
  limitHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  limitHintTxt: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: C.textTertiary },
});
