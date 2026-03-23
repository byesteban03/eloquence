import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  StatusBar,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, TypeColors, QualifColors } from '../../constants/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalOpps: number;
  hotOpps: number;
  totalMeetings: number;
  recentOpps: Array<{ type: string; nom: string; detail: string; qualification: string }>;
}

// ─── Micro-animation helpers ──────────────────────────────────────────────────

function useFadeIn(delay = 0) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return { opacity, transform: [{ translateY }] };
}

function useScalePress() {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 50 }).start();
  return { scale, onIn, onOut };
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[styles.skeletonCard, { opacity }]} />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text.toUpperCase()}</Text>;
}

function KpiItem({ value, label, highlight = false, loading = false }: {
  value: string; label: string; highlight?: boolean; loading?: boolean;
}) {
  return (
    <View style={styles.kpiItem}>
      {loading
        ? <View style={styles.kpiSkeleton} />
        : <Text style={[styles.kpiValue, highlight && { color: Colors.success }]}>{value}</Text>
      }
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function ModuleCard({
  tag, title, desc, stat, statLabel, accentColor, onPress,
}: {
  tag: string; title: string; desc: string; stat: string;
  statLabel: string; accentColor: string; onPress: () => void;
}) {
  const { scale, onIn, onOut } = useScalePress();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={styles.moduleCard} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
        <View style={[styles.moduleTag, { backgroundColor: accentColor + '22' }]}>
          <Text style={[styles.moduleTagTxt, { color: accentColor }]}>{tag}</Text>
        </View>
        <Text style={styles.moduleTitle}>{title}</Text>
        <Text style={styles.moduleDesc}>{desc}</Text>
        <View style={styles.moduleFooter}>
          <View>
            <Text style={[styles.moduleStat, { color: accentColor }]}>{stat}</Text>
            <Text style={styles.moduleStatLabel}>{statLabel}</Text>
          </View>
          <View style={[styles.moduleArrow, { backgroundColor: accentColor + '22' }]}>
            <Text style={{ color: accentColor, fontSize: 14, fontWeight: FontWeight.bold }}>→</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function OppRow({
  type, name, detail, qualif, onPress,
}: {
  type: string; name: string; detail: string; qualif: string; onPress: () => void;
}) {
  const { scale, onIn, onOut } = useScalePress();
  const cfg       = TypeColors[type as keyof typeof TypeColors] ?? TypeColors.default;
  const qualColor = QualifColors[qualif] ?? Colors.textTertiary;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={styles.oppRow} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
        <View style={[styles.oppEmoji, { backgroundColor: cfg.bg }]}>
          <Text style={{ fontSize: 15 }}>{cfg.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.oppName} numberOfLines={1}>{name}</Text>
          <Text style={styles.oppDetail} numberOfLines={1}>{detail}</Text>
        </View>
        <View style={[styles.qualifDot, { backgroundColor: qualColor }]} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [userName, setUserName] = useState('Esteban');

  // Load user name from AsyncStorage (same key as settings.tsx)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('eloquence:settings:v1');
        if (raw) {
          const settings = JSON.parse(raw);
          if (settings.fullName) {
            setUserName(settings.fullName.split(' ')[0]); // first name only
          }
        }
      } catch {}
    })();
  }, []);

  const anim0 = useFadeIn(0);
  const anim1 = useFadeIn(60);
  const anim2 = useFadeIn(120);
  const anim3 = useFadeIn(180);
  const anim4 = useFadeIn(240);

  const today   = new Date();
  const dayName = today.toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [oppsRes, meetingsRes] = await Promise.all([
        supabase.from('opportunites').select('type, nom, detail, qualification, score_pertinence').order('score_pertinence', { ascending: false }),
        supabase.from('reunions').select('id', { count: 'exact', head: false }),
      ]);

      if (oppsRes.error) throw oppsRes.error;
      if (meetingsRes.error) throw meetingsRes.error;

      const opps = oppsRes.data ?? [];
      setData({
        totalOpps:    opps.length,
        hotOpps:      opps.filter(o => (o.score_pertinence ?? 0) >= 80).length,
        totalMeetings: meetingsRes.data?.length ?? 0,
        recentOpps:   opps.slice(0, 3),
      });
    } catch (e: any) {
      setError(e.message ?? 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <Animated.View style={[styles.header, anim0]}>
          <View>
            <Text style={styles.greeting}>Bonjour, {userName}</Text>
            <Text style={styles.date}>
              {dayName.charAt(0).toUpperCase() + dayName.slice(1)}, {dateStr}
            </Text>
          </View>
          <View style={styles.logoBox}>
            <Text style={styles.logoTxt}>SF</Text>
          </View>
        </Animated.View>

        {/* ── Error banner ────────────────────────────────────────── */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTxt}>⚠️ {error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); loadData().then(() => setLoading(false)); }}>
              <Text style={styles.retryTxt}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── KPI Strip ───────────────────────────────────────────── */}
        <Animated.View style={[styles.kpiStrip, anim1]}>
          <KpiItem value={String(data?.totalMeetings ?? 0)} label="Réunions" loading={loading} />
          <View style={styles.kpiDivider} />
          <KpiItem value={String(data?.totalOpps ?? 0)} label="Opportunités" highlight loading={loading} />
          <View style={styles.kpiDivider} />
          <KpiItem value={String(data?.hotOpps ?? 0)} label="Leads chauds" loading={loading} />
        </Animated.View>

        {/* ── Modules ─────────────────────────────────────────────── */}
        <Animated.View style={anim2}>
          <SectionLabel text="Modules" />
        </Animated.View>

        <Animated.View style={anim2}>
          <ModuleCard
            tag="MODULE 01"
            title="Analyse de réunions"
            desc="Enregistrez ou importez un audio. L'IA transcrit, extrait les besoins et génère un plan d'action."
            stat={loading ? '...' : `${data?.totalMeetings ?? 0} analyses`}
            statLabel="enregistrées"
            accentColor={Colors.accent}
            onPress={() => router.push('/(tabs)/meetings')}
          />
        </Animated.View>

        <Animated.View style={anim3}>
          <ModuleCard
            tag="MODULE 02"
            title="Prospection IA"
            desc="Détection automatique de salons, anniversaires décennaux et lancements de véhicules."
            stat={loading ? '...' : `${data?.totalOpps ?? 0} leads`}
            statLabel="identifiés"
            accentColor={Colors.success}
            onPress={() => router.push('/(tabs)/prospecting')}
          />
        </Animated.View>

        {/* ── Opportunités récentes ────────────────────────────────── */}
        <Animated.View style={anim4}>
          <View style={styles.sectionRow}>
            <SectionLabel text="Opportunités récentes" />
            <TouchableOpacity onPress={() => router.push('/(tabs)/prospecting')}>
              <Text style={styles.seeAll}>Voir tout →</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.oppList}>
              {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
            </View>
          ) : (data?.recentOpps ?? []).length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTxt}>Aucune opportunité détectée pour l'instant.</Text>
            </View>
          ) : (
            <View style={styles.oppList}>
              {(data?.recentOpps ?? []).map((o, i) => (
                <React.Fragment key={i}>
                  <OppRow
                    type={o.type}
                    name={o.nom}
                    detail={o.detail}
                    qualif={o.qualification}
                    onPress={() => router.push('/(tabs)/prospecting')}
                  />
                  {i < (data?.recentOpps ?? []).length - 1 && <View style={styles.rowDivider} />}
                </React.Fragment>
              ))}
            </View>
          )}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.base },
  scroll: { paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg, gap: Spacing.lg },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  greeting: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, color: Colors.textPrimary, letterSpacing: -0.4 },
  date: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 3, textTransform: 'capitalize' },
  logoBox: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  logoTxt: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.sm, color: Colors.textPrimary, letterSpacing: 1 },

  // Error
  errorBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.dangerMuted, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.danger,
    padding: Spacing.md,
  },
  errorTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.danger, flex: 1 },
  retryTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.sm, color: Colors.danger, marginLeft: 8 },

  // KPI Strip
  kpiStrip: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border,
    flexDirection: 'row', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md, alignItems: 'center',
  },
  kpiItem: { flex: 1, alignItems: 'center', gap: 3 },
  kpiValue: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, color: Colors.textPrimary, letterSpacing: -0.8 },
  kpiSkeleton: { height: 28, width: 40, backgroundColor: Colors.elevated, borderRadius: Radius.sm },
  kpiLabel: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 15 },
  kpiDivider: { width: 0.5, height: 36, backgroundColor: Colors.border },

  // Section
  sectionLabel: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.08, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  seeAll: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.accent },

  // Module card
  moduleCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.md,
  },
  moduleTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, marginBottom: Spacing.xs },
  moduleTagTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.xs, letterSpacing: 1 },
  moduleTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xl, color: Colors.textPrimary, letterSpacing: -0.3, lineHeight: 24 },
  moduleDesc: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.xs },
  moduleFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: Spacing.xs },
  moduleStat: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xl },
  moduleStatLabel: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textTertiary },
  moduleArrow: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },

  // Opp list
  oppList: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  oppEmoji: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  oppName: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary, letterSpacing: -0.2 },
  oppDetail: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  qualifDot: { width: 7, height: 7, borderRadius: 4 },
  rowDivider: { height: 0.5, backgroundColor: Colors.border, marginHorizontal: Spacing.lg },

  // Empty / Skeleton
  emptyCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, padding: Spacing.xl, alignItems: 'center' },
  emptyTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
  skeletonCard: { height: 60, backgroundColor: Colors.elevated, margin: Spacing.md, borderRadius: Radius.md },
});
