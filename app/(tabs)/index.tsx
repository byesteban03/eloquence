import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const { width } = Dimensions.get('window');

// ─── Animated Card Wrapper ───────────────────────────────────────────────────
function AnimatedCard({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  value,
  label,
  trend,
  trendUp,
}: {
  value: string;
  label: string;
  trend: string;
  trendUp: boolean;
}) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiTrend, { color: trendUp ? Colors.success : Colors.danger }]}>
        {trendUp ? '↑' : '↓'} {trend}
      </Text>
    </View>
  );
}

// ─── Module Card ──────────────────────────────────────────────────────────────
function ModuleCard({
  tag,
  title,
  description,
  stat,
  statLabel,
  accentColor,
  onPress,
  gradient,
}: {
  tag: string;
  title: string;
  description: string;
  stat: string;
  statLabel: string;
  accentColor: string;
  onPress: () => void;
  gradient: string[];
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <LinearGradient
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.moduleCard}
        >
          {/* Tag */}
          <View style={[styles.moduleTag, { backgroundColor: accentColor }]}>
            <Text style={styles.moduleTagText}>{tag}</Text>
          </View>

          {/* Title & Description */}
          <Text style={styles.moduleTitle}>{title}</Text>
          <Text style={styles.moduleDesc}>{description}</Text>

          {/* Stat + Arrow */}
          <View style={styles.moduleFooter}>
            <View>
              <Text style={styles.moduleStat}>{stat}</Text>
              <Text style={styles.moduleStatLabel}>{statLabel}</Text>
            </View>
            <View style={[styles.moduleArrow, { backgroundColor: accentColor }]}>
              <Text style={styles.moduleArrowText}>→</Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Opportunity Row ──────────────────────────────────────────────────────────
function OpportunityRow({
  type,
  company,
  event,
  date,
  status,
}: {
  type: string;
  company: string;
  event: string;
  date: string;
  status: 'Nouveau' | 'En cours' | 'Envoyé' | 'À contacter';
}) {
  const statusColors: Record<string, string> = {
    Nouveau: Colors.electric,
    'En cours': Colors.warning,
    Envoyé: Colors.success,
    'À contacter': Colors.grey400,
  };

  return (
    <View style={styles.opportunityRow}>
      <View style={[styles.opportunityType, { backgroundColor: Colors.grey200 }]}>
        <Text style={styles.opportunityTypeText}>{type}</Text>
      </View>
      <View style={styles.opportunityContent}>
        <Text style={styles.opportunityCompany}>{company}</Text>
        <Text style={styles.opportunityEvent}>{event} · {date}</Text>
      </View>
      <StatusBadge label={status} color={statusColors[status]} />
    </View>
  );
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const today = new Date();
  const dayName = today.toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <AnimatedCard delay={0}>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Bonjour, Esteban 👋</Text>
              <Text style={styles.dateText}>
                {dayName.charAt(0).toUpperCase() + dayName.slice(1)}, {dateStr}
              </Text>
            </View>
            <View style={styles.logoContainer}>
              <Text style={styles.logoSF}>SF</Text>
            </View>
          </View>
        </AnimatedCard>

        {/* ── KPI Strip ──────────────────────────────────────────────── */}
        <AnimatedCard delay={100}>
          <View style={styles.kpiStrip}>
            <KpiCard value="7" label="Réunions ce mois" trend="2 vs mois dernier" trendUp={true} />
            <View style={styles.kpiDivider} />
            <KpiCard value="23" label="Opportunités" trend="5 nouvelles" trendUp={true} />
            <View style={styles.kpiDivider} />
            <KpiCard value="3" label="En attente" trend="1 urgente" trendUp={false} />
          </View>
        </AnimatedCard>

        {/* ── Section Label ──────────────────────────────────────────── */}
        <AnimatedCard delay={160}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Modules</Text>
            <View style={styles.sectionLine} />
          </View>
        </AnimatedCard>

        {/* ── Module 1 — Analyse Réunions ────────────────────────────── */}
        <AnimatedCard delay={220}>
          <ModuleCard
            tag="MODULE 01"
            title="Analyse de réunions"
            description="Enregistrez ou importez un fichier audio. L'IA transcrit, extrait les besoins et génère un plan d'action."
            stat="4 analyses"
            statLabel="cette semaine"
            accentColor={Colors.electric}
            gradient={[Colors.black, '#0D1A33']}
            onPress={() => {}}
          />
        </AnimatedCard>

        {/* ── Module 2 — Prospection IA ──────────────────────────────── */}
        <AnimatedCard delay={300}>
          <ModuleCard
            tag="MODULE 02"
            title="Prospection IA"
            description="Détection automatique de salons, anniversaires décennaux et lancements de véhicules."
            stat="12 leads"
            statLabel="identifiés aujourd'hui"
            accentColor={Colors.success}
            gradient={['#071A12', '#0C0C0C']}
            onPress={() => {}}
          />
        </AnimatedCard>

        {/* ── Section Label ──────────────────────────────────────────── */}
        <AnimatedCard delay={360}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Opportunités du jour</Text>
            <Pressable>
              <Text style={styles.seeAll}>Voir tout</Text>
            </Pressable>
          </View>
        </AnimatedCard>

        {/* ── Opportunity Feed ───────────────────────────────────────── */}
        <AnimatedCard delay={400}>
          <View style={styles.opportunityList}>
            <OpportunityRow
              type="🎪"
              company="Renault Group"
              event="Mondial de l'Auto 2026"
              date="Oct 2026"
              status="Nouveau"
            />
            <View style={styles.separatorLine} />
            <OpportunityRow
              type="🏆"
              company="Hermès"
              event="100e anniversaire de la marque"
              date="2 ans"
              status="En cours"
            />
            <View style={styles.separatorLine} />
            <OpportunityRow
              type="🚀"
              company="Stellantis"
              event="Lancement Citroën ë-C3"
              date="Jun 2026"
              status="Envoyé"
            />
            <View style={styles.separatorLine} />
            <OpportunityRow
              type="🎨"
              company="Louis Vuitton"
              event="Pop-up Champs-Élysées"
              date="Avr 2026"
              status="À contacter"
            />
          </View>
        </AnimatedCard>

        {/* ── Score Banner ───────────────────────────────────────────── */}
        <AnimatedCard delay={460}>
          <LinearGradient
            colors={[Colors.electric, Colors.electricDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scoreBanner}
          >
            <View>
              <Text style={styles.scoreBannerLabel}>Dernière réunion analysée</Text>
              <Text style={styles.scoreBannerCompany}>Peugeot Design Lab</Text>
            </View>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreValue}>4.2</Text>
              <Text style={styles.scoreMax}>/5</Text>
            </View>
          </LinearGradient>
        </AnimatedCard>

        {/* ── Bottom padding for FAB ──────────────────────────────────── */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Floating Action Button ─────────────────────────────────── */}
      <AnimatedCard delay={600} style={styles.fabWrapper}>
        <Pressable style={styles.fab}>
          <LinearGradient
            colors={[Colors.electric, Colors.electricDark]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.fabIcon}>+</Text>
          </LinearGradient>
        </Pressable>
      </AnimatedCard>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 64,
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
    gap: Spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  greeting: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 26,
    color: Colors.black,
    letterSpacing: -0.5,
  },
  dateText: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: Colors.grey400,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  logoContainer: {
    width: 44,
    height: 44,
    backgroundColor: Colors.black,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSF: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: Colors.cream,
    letterSpacing: 1,
  },

  // KPI Strip
  kpiStrip: {
    backgroundColor: Colors.black,
    borderRadius: Radius.md,
    flexDirection: 'row',
    padding: Spacing.md,
    alignItems: 'center',
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  kpiValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: Colors.white,
    letterSpacing: -1,
  },
  kpiLabel: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 10,
    color: Colors.grey500,
    textAlign: 'center',
    lineHeight: 14,
  },
  kpiTrend: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
  },
  kpiDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.grey200,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: Colors.black,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.grey600 + '44',
    marginLeft: Spacing.sm,
  },
  seeAll: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    color: Colors.electric,
  },

  // Module Card
  moduleCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: 8,
    overflow: 'hidden',
  },
  moduleTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: 4,
  },
  moduleTagText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 10,
    color: Colors.black,
    letterSpacing: 1.5,
  },
  moduleTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: Colors.white,
    letterSpacing: -0.5,
    lineHeight: 27,
  },
  moduleDesc: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: Colors.grey500,
    lineHeight: 19,
    marginBottom: 8,
  },
  moduleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  moduleStat: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: Colors.white,
  },
  moduleStatLabel: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    color: Colors.grey500,
  },
  moduleArrow: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleArrowText: {
    fontSize: 18,
    color: Colors.black,
    fontWeight: '600',
  },

  // Opportunity List
  opportunityList: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  opportunityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 12,
  },
  opportunityType: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opportunityTypeText: {
    fontSize: 16,
  },
  opportunityContent: {
    flex: 1,
  },
  opportunityCompany: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: Colors.black,
    letterSpacing: -0.3,
  },
  opportunityEvent: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: Colors.grey400,
    marginTop: 1,
  },
  separatorLine: {
    height: 1,
    backgroundColor: Colors.cream,
    marginHorizontal: Spacing.md,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Score Banner
  scoreBanner: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreBannerLabel: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    color: Colors.electricLight,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scoreBannerCompany: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: Colors.white,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  scoreCircle: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  scoreValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 40,
    color: Colors.white,
    lineHeight: 44,
    letterSpacing: -2,
  },
  scoreMax: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
    color: Colors.electricLight,
    marginBottom: 6,
  },

  // FAB
  fabWrapper: {
    position: 'absolute',
    bottom: 96,
    right: Spacing.md,
  },
  fab: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: Colors.electric,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: 28,
    color: Colors.white,
    fontWeight: '300',
    lineHeight: 32,
  },
});
