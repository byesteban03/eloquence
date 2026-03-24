import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  Animated,
  RefreshControl,
  StatusBar,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
  PanResponder,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, QualifColors } from '../../constants/tokens';
import { usePlan } from '../../hooks/usePlan';
import { SignalCode } from '../../constants/signaux';
import PaywallScreen from '../paywall';

// ─── Design System (Linear/Premium) ───────────────────────────────────────────

const C = {
  base: '#0E0E0F',
  surface: '#161618',
  elevated: '#1E1E21',
  border: '#2A2A2E',
  borderSubtle: '#1A1A1C',
  textPrimary: '#F0EEE8',
  textSecondary: '#888780',
  textTertiary: '#555553',
  accent: '#4F6EF7',
  accentMuted: '#0D1A3A',
  success: '#4ADE80',
  successMuted: '#0A2A0F',
  warning: '#F59E0B',
  warningMuted: '#2A1A00',
  premium: '#8B5CF6',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntrepriseData {
  nom_officiel: string;
  adresse: string;
  effectifs: string;
  code_naf: string;
  secteur: string;
  dirigeants: { nom: string; prenom: string; qualite: string }[];
  chiffre_affaires: number | null;
  score_bonus: number;
  siren?: string;
  siret_siege?: string;
  nombre_etablissements?: number;
  score_bonus_details?: string[];
  found?: boolean;
}

type OppType  = 'salon' | 'anniversaire' | 'auto' | string;
type OppQualif = 'Non qualifié' | 'À contacter' | 'Qualifié chaud' | 'Non pertinent' | string;

interface Opportunite {
  id: string;
  created_at: string;
  type: OppType;
  nom: string;
  detail: string;
  qualification: OppQualif;
  score_pertinence: number;
  secteur?: string;
  signal_code: SignalCode;
  signal_source: string;
  signal_date?: string;
  signaux_croises: string[];
  score_pertinence_v2?: number;
  score_global_v2?: number;
  fenetre_optimale_debut?: string;
  fenetre_optimale_fin?: string;
  ville?: string;
  latitude?: number;
  longitude?: number;
  distance_km?: number;
  zone_cible_id?: string;
  enrichissement?: any;
}

interface ZoneCible {
  id: string;
  user_id: string;
  nom: string;
  type: 'ville' | 'departement' | 'region' | 'rayon';
  code_postal?: string;
  ville?: string;
  departement?: string;
  region?: string;
  adresse_centre?: string;
  latitude_centre?: number;
  longitude_centre?: number;
  rayon_km?: number;
  active: boolean;
}

interface ContactData {
  nom?: string;
  poste?: string;
  email?: string;
  linkedin?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUALIF_OPTIONS: OppQualif[] = ['Nouveau', 'À contacter', 'Qualifié chaud'];

function getQualifCfg(q: string) {
  if (q === 'Qualifié chaud') return { label: 'CHAUD', color: QualifColors.hot };
  if (q === 'À contacter')   return { label: 'À CONTACTER', color: QualifColors.contact };
  return { label: 'NOUVEAU', color: C.textTertiary };
}

function getScoreColor(s: number) {
  if (s >= 80) return C.success;
  if (s >= 50) return C.warning;
  return C.textTertiary;
}

function nextMonday() {
  const d = new Date();
  const daysUntil = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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

// ─── Shimmer ──────────────────────────────────────────────────────────────────

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

function SkeletonRow({ width = '100%', height = 16, marginBottom = 8 }: { width?: any, height?: number, marginBottom?: number }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[{ width, height, marginBottom, backgroundColor: Colors.border, borderRadius: Radius.sm }, { opacity }]} />;
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

const KPI_ITEMS = [
  { label: 'Détections', key: 'count' as const },
  { label: 'Pertinents', key: 'hot' as const },
  { label: 'Prochaine MAJ', key: 'next' as const },
];

function SummaryStrip({ opps }: { opps: Opportunite[] }) {
  const hotCount = opps.filter(o => (o.score_global_v2 ?? 0) >= 80).length;

  return (
    <View style={styles.strip}>
      {KPI_ITEMS.map((item, idx) => (
        <React.Fragment key={item.key}>
          <View style={styles.stripItem}>
            <Text style={[styles.stripVal, { color: C.textPrimary }]}>
              {item.key === 'count' ? opps.length : item.key === 'hot' ? hotCount : nextMonday()}
            </Text>
            <Text style={styles.stripLabel}>{item.label.toUpperCase()}</Text>
          </View>
          {idx < KPI_ITEMS.length - 1 && <View style={styles.stripDiv} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const SIGNAL_FILTERS = [
  { code: 'tous', label: 'Tous' },
  { code: 'anniversaire_entreprise', label: 'Anniversaires' },
  { code: 'creation_entreprise', label: 'Créations' },
  { code: 'fusion_acquisition', label: 'Fusions' },
  { code: 'appel_offres_public', label: 'Marchés publics' },
  { code: 'recrutement_massif', label: 'Recrutements' },
  { code: 'permis_construire', label: 'Permis construire' },
  { code: 'changement_dirigeant', label: 'Dirigeants' },
  { code: 'demenagement_siege', label: 'Déménagements' },
];

function SignalFilterBar({ active, setActive }: { active: string; setActive: (k: string) => void }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterLabel}>Signal</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {SIGNAL_FILTERS.map(f => (
          <TouchableOpacity
            key={f.code}
            style={[styles.pill, active === f.code && styles.pillActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActive(f.code);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillText, active === f.code && styles.pillTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function ZoneFilterBar({ zones, active, setActive, onAddZone }: { zones: ZoneCible[]; active: string; setActive: (id: string) => void; onAddZone: () => void }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterLabel}>Zone</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.pill, active === 'all' && styles.pillActive]}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setActive('all');
          }}
        >
          <Text style={[styles.pillText, active === 'all' && styles.pillTextActive]}>Toutes</Text>
        </TouchableOpacity>
        {zones.map(z => (
          <TouchableOpacity
            key={z.id}
            style={[styles.pill, active === z.id && styles.pillActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActive(z.id);
            }}
          >
            <Text style={[styles.pillText, active === z.id && styles.pillTextActive]}>
              {z.nom || z.ville || z.departement || z.region || 'France'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.pill, { borderColor: C.accent }]} onPress={onAddZone}>
          <Text style={[styles.pillText, { color: C.accent }]}>+ Ajouter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Opp Card ─────────────────────────────────────────────────────────────────

function OppCard({ opp, onPress, onSwipe, isLocked }: { opp: Opportunite; onPress: () => void; onSwipe: (id: string, action: 'ignore' | 'hot') => void, isLocked?: boolean }) {
  const { scale, onIn, onOut } = useScalePress();
  const swipeRef = useRef<Swipeable>(null);

  const score = opp.score_global_v2 ?? 0;
  const scoreLabel = score > 0 ? score.toString() : '—';
  
  const getScoreColor = (s: number) => {
    if (s >= 80) return C.success;
    if (s >= 50) return C.warning;
    return C.textSecondary;
  };

  const getQualifCfg = (q: string) => {
    switch (q) {
      case 'Qualifié chaud': return { label: 'PRIORITAIRE', color: C.success };
      case 'À contacter': return { label: 'À CONTACTER', color: C.warning };
      default: return { label: 'NOUVEAU', color: C.textTertiary };
    }
  };
  const qCfg = getQualifCfg(opp.qualification || 'Nouveau');

  const handleSwipe = (direction: 'left' | 'right') => {
    if (isLocked) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSwipe(opp.id, direction === 'left' ? 'ignore' : 'hot');
    swipeRef.current?.close();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Swipeable
        ref={swipeRef}
        enabled={!isLocked}
        renderLeftActions={() => (
          <View style={[styles.swipeAction, { backgroundColor: '#EF4444' }]}>
            <Text style={styles.swipeTxt}>IGNORER</Text>
          </View>
        )}
        renderRightActions={() => (
          <View style={[styles.swipeAction, { backgroundColor: C.success }]}>
            <Text style={styles.swipeTxt}>CHAUD</Text>
          </View>
        )}
        onSwipeableOpen={(dir) => handleSwipe(dir as 'left' | 'right')}
      >
        <Pressable 
          style={[styles.card, isLocked && styles.cardLocked]} 
          onPress={onPress}
          onPressIn={onIn} 
          onPressOut={onOut}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.qualifDot, { backgroundColor: qCfg.color }]} />
              <Text style={[styles.qualifText, { color: qCfg.color }]}>{qCfg.label}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={[styles.scoreValue, { color: getScoreColor(score) }]}>{scoreLabel}</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{opp.nom}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>{opp.detail}</Text>
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardMetaLabel}>{opp.ville?.toUpperCase() || 'FRANCE'}</Text>
              {opp.distance_km != null && (
                <Text style={styles.cardMetaLabel}>· {opp.distance_km.toFixed(1)}KM</Text>
              )}
              {opp.signaux_croises && opp.signaux_croises.length > 1 && (
                <View style={styles.signalBadge}>
                  <Text style={styles.signalBadgeText}>CROISÉ</Text>
                </View>
              )}
            </View>
            
            {isLocked && (
              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textTertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M11 11H13M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11M5 11H19V22H5V11Z" />
              </Svg>
            )}
          </View>
        </Pressable>
      </Swipeable>
    </Animated.View>
  );
}

function BannerLocked({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.bannerContent}>
        <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.warning} strokeWidth="2.5">
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </Svg>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Plan Gratuit — Limite atteinte</Text>
          <Text style={styles.bannerSub}>Débloquez l'accès illimité et les données enrichies.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Opp Detail Sheet ─────────────────────────────────────────────────────────

function OppDetailSheet({
  opp, visible, onClose, onQualifChange,
}: {
  opp: Opportunite | null;
  visible: boolean;
  onClose: () => void;
  onQualifChange: (id: string, q: OppQualif) => void;
}) {
  const [contact, setContact]     = useState<ContactData | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [updatingQualif, setUpdatingQualif] = useState(false);
  const [entrepriseData, setEntrepriseData] = useState<EntrepriseData | null>(null);
  const [loadingEntreprise, setLoadingEntreprise] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(-100)).current;

  const showToast = (txt: string) => {
    setToastVisible(true);
    Animated.sequence([
      Animated.spring(toastAnim, { toValue: 60, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: -100, duration: 300, useNativeDriver: true })
    ]).start(() => setToastVisible(false));
  };

  const slideAnim = useRef(new Animated.Value(800)).current;

  useEffect(() => {
    if (visible && opp) {
      setContact(null);
      setAiMessage('');
      setEntrepriseData(null);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 120 }).start();
      searchContact(opp);
      enrichEntreprise(opp);
    } else {
      Animated.timing(slideAnim, { toValue: 800, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, opp]);

  const searchContact = async (o: Opportunite) => {
    setLoadingContact(true);
    try {
      const { data } = await supabase.functions.invoke('search-contact', { body: { organizationName: o.nom } });
      if (data?.contacts?.length > 0) {
        const c = data.contacts[0];
        setContact({
          nom: c.nom ?? c.full_name ?? null,
          poste: c.titre ?? c.poste ?? null,
          email: c.email ?? null,
          linkedin: c.linkedin_url ?? null,
        });
      }
    } finally {
      setLoadingContact(false);
    }
  };

  const enrichEntreprise = async (o: Opportunite) => {
    setLoadingEntreprise(true);
    try {
      const apiUrl = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(o.nom)}&per_page=1`;
      const res = await fetch(apiUrl);
      const gouvData = await res.json();
      if (gouvData?.results?.length > 0) {
        const r = gouvData.results[0];
        setEntrepriseData({
          nom_officiel: r.nom_complet || '',
          adresse: r.siege?.adresse_ligne_1 || '',
          effectifs: r.tranche_effectif_salarie || 'N/A',
          code_naf: r.activite_principale || '',
          secteur: r.libelle_activite_principale || '',
          dirigeants: [],
          chiffre_affaires: null,
          score_bonus: 0,
        });
      }
    } finally {
      setLoadingEntreprise(false);
    }
  };

  const generateMessage = async () => {
    if (!opp) return;
    setLoadingMsg(true);
    try {
      const prompt = `Email de prospection court pour ${opp.nom}. Contexte: ${opp.detail}. Signe Esteban.`;
      const { data } = await supabase.functions.invoke('analyse-reunion', { body: { transcription: prompt, mode: 'message' } });
      setAiMessage(data?.message ?? '');
    } finally {
      setLoadingMsg(false);
    }
  };

  if (!opp) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.sheetHandleArea}><View style={styles.sheetHandle} /></View>
        
        <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.sheetSection}>
            <Text style={styles.sheetTitle}>{opp.nom}</Text>
            <Text style={styles.sheetSub}>{opp.detail}</Text>
          </View>

          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>Qualification</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['Nouveau', 'À contacter', 'Qualifié chaud'].map(q => (
                <TouchableOpacity 
                  key={q} 
                  style={[styles.qualifPill, opp.qualification === q && styles.pillActive]}
                  onPress={() => onQualifChange(opp.id, q)}
                >
                  <Text style={[styles.qualifPillTxt, opp.qualification === q && styles.pillTextActive]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {entrepriseData && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Entreprise</Text>
              <View style={styles.contactCard}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.contactName}>{entrepriseData.nom_officiel}</Text>
                  <Text style={styles.contactRole}>{entrepriseData.adresse}</Text>
                  <Text style={styles.contactMeta}>{entrepriseData.effectifs} employés · {entrepriseData.secteur}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>Contact LinkedIn</Text>
            {loadingContact ? <ActivityIndicator color={C.accent} /> : contact ? (
              <View style={styles.contactCard}>
                <View style={styles.contactAvatar}>
                   <Text style={styles.contactInitials}>{contact.nom?.split(' ').map(n=>n[0]).join('')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{contact.nom}</Text>
                  <Text style={styles.contactRole}>{contact.poste}</Text>
                </View>
              </View>
            ) : <Text style={styles.emptyTxt}>Aucun contact trouvé</Text>}
          </View>

          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>Prospection IA</Text>
            {aiMessage ? (
              <View style={styles.messageCard}>
                <Text style={styles.messageTxt}>{aiMessage}</Text>
                <TouchableOpacity 
                  style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  onPress={() => {
                    Clipboard.setStringAsync(aiMessage);
                    showToast('Copié !');
                  }}
                >
                  <Ionicons name="copy-outline" size={14} color={C.accent} />
                  <Text style={{ color: C.accent, fontFamily: 'Outfit_600SemiBold', fontSize: 13 }}>Copier le message</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.generateBtn} onPress={generateMessage} disabled={loadingMsg}>
                {loadingMsg ? <ActivityIndicator color="#FFF" /> : <Text style={styles.generateBtnTxt}>Générer l'approche</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {toastVisible && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastAnim }] }]}>
          <Text style={styles.toastTxt}>Copié dans le presse-papier</Text>
        </Animated.View>
      )}
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProspectingScreen() {
  const [opps, setOpps] = useState<Opportunite[]>([]);
  const [zones, setZones] = useState<ZoneCible[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<string>('tous');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [selectedOpp, setSelectedOpp] = useState<Opportunite | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<'feature_locked' | 'manual'>('manual');

  const { plan } = usePlan();

  const anim0 = useFadeIn(0);
  const anim1 = useFadeIn(60);
  const anim2 = useFadeIn(120);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const setFilterTypeAnimated = useCallback((k: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilterType(k);
  }, []);

  const setFilterZoneAnimated = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilterZone(id);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [oppsRes, zonesRes] = await Promise.all([
        supabase.from('opportunites').select('*').order('score_global_v2', { ascending: false }),
        supabase.from('zones_cibles').select('*').eq('active', true),
      ]);
      
      if (oppsRes.error) throw oppsRes.error;
      if (zonesRes.error) throw zonesRes.error;
      
      setOpps(oppsRes.data ?? []);
      setZones(zonesRes.data ?? []);
    } catch (e) {
      console.error('loadData error', e);
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

  const openDetail = (opp: Opportunite, index: number) => {
    const isLocked = plan === 'free' && index >= 10;
    if (isLocked) {
      setPaywallTrigger('feature_locked');
      setShowPaywall(true);
      return;
    }
    setSelectedOpp(opp);
    setSheetVisible(true);
  };

  const handleQualifChange = (id: string, q: OppQualif) => {
    setOpps(prev => prev.map(o => o.id === id ? { ...o, qualification: q } : o));
    if (selectedOpp?.id === id) setSelectedOpp(prev => prev ? { ...prev, qualification: q } : prev);
  };

  const handleSwipeCard = async (id: string, action: 'ignore' | 'hot') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (action === 'ignore') {
      setOpps(prev => prev.filter(o => o.id !== id));
      await supabase.from('opportunites').update({ qualification: 'Non pertinent' }).eq('id', id);
    } else {
      setOpps(prev => prev.map(o => o.id === id ? { ...o, qualification: 'Qualifié chaud' } : o));
      await supabase.from('opportunites').update({ qualification: 'Qualifié chaud' }).eq('id', id);
    }
  };

  const filtered = opps.filter(o => {
    // Filter Type
    let matchType = true;
    if (filterType !== 'tous') matchType = o.signal_code === filterType;

    // Filter Zone
    let matchZone = true;
    if (filterZone !== 'all') matchZone = o.zone_cible_id === filterZone;

    return matchType && matchZone;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      {/* Header */}
      <Animated.View style={[styles.header, anim0]}>
        <View>
          <Text style={styles.headerTitle}>Prospection</Text>
          <Text style={styles.headerSub}>Détection automatique en temps réel</Text>
        </View>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>Live</Text>
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        contentContainerStyle={styles.scroll}
      >
        {/* Summary Strip */}
        <Animated.View style={anim1}>
          <SummaryStrip opps={opps} />
          {plan === 'free' && <BannerLocked onPress={() => { setPaywallTrigger('manual'); setShowPaywall(true); }} />}
        </Animated.View>

        {/* Filters */}
        <Animated.View style={anim1}>
          <SignalFilterBar active={filterType} setActive={setFilterTypeAnimated} />
          <ZoneFilterBar 
            zones={zones} 
            active={filterZone} 
            setActive={setFilterZoneAnimated} 
            onAddZone={() => {}} // TODO: Navigation vers settings
          />
        </Animated.View>

        {/* List */}
        <Animated.View style={[{ gap: Spacing.md }, anim2]}>
          <View style={styles.listHeader}>
            <Text style={styles.listLabel}>OPPORTUNITÉS DÉTECTÉES</Text>
            <Text style={styles.listCount}>{filtered.length}</Text>
          </View>

          {loading ? (
            [0, 1, 2].map(i => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={40} color={C.border} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTxt}>Aucune opportunité dans ce filtre</Text>
            </View>
          ) : (
            filtered.map((m, i) => (
              <OppCard 
                key={m.id} 
                opp={m} 
                onPress={() => openDetail(m, i)} 
                onSwipe={handleSwipeCard} 
                isLocked={plan === 'free' && i >= 10}
              />
            ))
          )}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Sheet */}
      <OppDetailSheet
        opp={selectedOpp}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onQualifChange={handleQualifChange}
      />

      {/* Paywall Modal */}
      <Modal visible={showPaywall} animationType="slide" presentationStyle="pageSheet">
        <PaywallScreen 
          trigger={paywallTrigger} 
          featureName="l'accès illimité aux opportunités" 
          onClose={() => setShowPaywall(false)} 
        />
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.base },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, color: C.textPrimary, letterSpacing: -0.4 },
  headerSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: C.textSecondary, marginTop: 3 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.successMuted,
    borderWidth: 0.5, borderColor: C.success,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  liveTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.xs, color: C.success },

  filterSection: { gap: 10, marginBottom: 8 },
  filterLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 2 },
  filterRow: { gap: 8 },

  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },

  // Summary Strip
  strip: {
    backgroundColor: C.surface,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: C.border,
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  stripItem: { flex: 1, alignItems: 'center', gap: 4 },
  stripVal: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xl, letterSpacing: -0.8 },
  stripLabel: { fontFamily: 'Outfit_400Regular', fontSize: 9, color: C.textSecondary, letterSpacing: 0.5 },
  stripDiv: { width: 0.5, height: 24, backgroundColor: C.border },

  // Banner
  banner: { 
    marginTop: 12, 
    backgroundColor: '#1C1917', 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#292524',
    padding: 12,
  },
  bannerContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerTitle: { fontFamily: 'Outfit_700Bold', fontSize: 13, color: C.textPrimary },
  bannerSub: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: C.textSecondary, marginTop: 1 },

  // Opp card
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 0,
  },
  cardLocked: { opacity: 0.6, backgroundColor: C.elevated },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qualifDot: { width: 6, height: 6, borderRadius: 3 },
  qualifText: { fontFamily: 'Outfit_700Bold', fontSize: 10, letterSpacing: 0.5 },
  scoreBox: { 
    backgroundColor: C.elevated, 
    width: 32, height: 32, borderRadius: 8, 
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border
  },
  scoreValue: { fontFamily: 'Outfit_700Bold', fontSize: 13 },
  
  cardBody: { marginBottom: 16 },
  cardTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 17, color: C.textPrimary, marginBottom: 4 },
  cardSubtitle: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: C.textTertiary, lineHeight: 18 },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMetaLabel: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: C.textSecondary },
  signalBadge: { backgroundColor: C.accentMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  signalBadgeText: { fontFamily: 'Outfit_700Bold', fontSize: 9, color: C.accent },

  // Filter bar pills
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillActive: { backgroundColor: C.textPrimary, borderColor: C.textPrimary },
  pillText: { fontFamily: 'Outfit_500Medium', fontSize: 13, color: C.textSecondary },
  pillTextActive: { color: C.base },

  // List header
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  listLabel: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  listCount: { fontFamily: 'Outfit_700Bold', fontSize: 12, color: C.textSecondary },

  // Swipe
  swipeAction: { justifyContent: 'center', alignItems: 'center', width: 80, height: '100%', borderRadius: 12 },
  swipeTxt: { fontFamily: 'Outfit_800ExtraBold', fontSize: 10, color: '#FFF' },

  // Sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: C.border,
    maxHeight: '92%',
  },
  sheetHandleArea: { width: '100%', height: 32, alignItems: 'center', justifyContent: 'center' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  sheetSection: { marginBottom: 24 },
  sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: C.textPrimary, marginBottom: 8 },
  sheetSub: { fontFamily: 'Outfit_400Regular', fontSize: 15, color: C.textTertiary, lineHeight: 22 },
  sheetSectionLabel: { fontFamily: 'Outfit_700Bold', fontSize: 11, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  
  // Qualif pills
  qualifPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  qualifPillTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: C.textSecondary },

  // Contact card
  contactCard: { backgroundColor: C.elevated, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  contactInitials: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: '#FFF' },
  contactName: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: C.textPrimary },
  contactRole: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: C.textSecondary },
  contactMeta: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: C.textTertiary },

  // Message
  messageCard: { backgroundColor: C.elevated, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  messageTxt: { fontFamily: 'Outfit_400Regular', fontSize: 14, color: C.textPrimary, lineHeight: 22 },
  generateBtn: { backgroundColor: C.accent, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  generateBtnTxt: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: '#FFF' },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { fontFamily: 'Outfit_400Regular', fontSize: 14, color: C.textSecondary },

  // Skeleton
  skeletonCard: { height: 120, backgroundColor: C.surface, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },

  // Toast
  toast: {
    position: 'absolute', top: 60, alignSelf: 'center',
    backgroundColor: C.textPrimary, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  toastTxt: { fontFamily: 'Outfit_700Bold', fontSize: 13, color: C.base },
});
