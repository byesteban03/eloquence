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
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, TypeColors, QualifColors, scoreStyle } from '../../constants/tokens';

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
}

interface ContactData {
  nom?: string;
  poste?: string;
  email?: string;
  linkedin?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTypeCfg(type: string) {
  return TypeColors[type as keyof typeof TypeColors] ?? TypeColors.default;
}

const QUALIF_OPTIONS: OppQualif[] = ['Non qualifié', 'À contacter', 'Qualifié chaud', 'Non pertinent'];

function nextMonday() {
  const d = new Date();
  const daysUntil = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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

function StripItem({ emoji, count, label, color, onPress }: {
  emoji: string; count: number; label: string; color: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.timing(scale, { toValue: 0.96, duration: 100, useNativeDriver: true }).start();
  const onOut = () => Animated.timing(scale, { toValue: 1,    duration: 100, useNativeDriver: true }).start();
  return (
    <Animated.View style={[styles.stripItem, { transform: [{ scale }] }]}>
      <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ alignItems: 'center', gap: 3 }}>
        <Text style={{ fontSize: 16 }}>{emoji}</Text>
        <Text style={[styles.stripVal, { color }]}>{count}</Text>
        <Text style={styles.stripLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function SummaryStrip({ opps, onFilter }: { opps: Opportunite[]; onFilter: (k: FilterKey) => void }) {
  const salons        = opps.filter(o => o.type === 'salon').length;
  const anniversaires = opps.filter(o => o.type === 'anniversaire').length;
  const autos         = opps.filter(o => o.type === 'auto').length;

  const items: { emoji: string; count: number; label: string; color: string; filterKey: FilterKey }[] = [
    { emoji: '🏛', count: salons,        label: 'Salons',   color: Colors.accent,  filterKey: 'salon'        },
    { emoji: '🎂', count: anniversaires, label: 'Anniv.',   color: Colors.warning, filterKey: 'anniversaire' },
    { emoji: '🚗', count: autos,         label: 'Auto',     color: Colors.success, filterKey: 'auto'         },
  ];

  return (
    <View style={styles.strip}>
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          <StripItem emoji={item.emoji} count={item.count} label={item.label} color={item.color} onPress={() => onFilter(item.filterKey)} />
          {i < items.length - 1 && <View style={styles.stripDiv} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'salon' | 'anniversaire' | 'auto' | 'hot';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tous'       },
  { key: 'hot',         label: '🔥 Chauds'  },
  { key: 'salon',       label: '🏛 Salons'  },
  { key: 'anniversaire',label: '🎂 Anniv.'  },
  { key: 'auto',        label: '🚗 Auto'    },
];

function FilterBar({ active, setActive }: { active: FilterKey; setActive: (k: FilterKey) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f.key}
          style={[styles.pill, active === f.key && styles.pillActive]}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setActive(f.key);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.pillTxt, active === f.key && styles.pillTxtActive]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Opp Card ─────────────────────────────────────────────────────────────────

function OppCard({ opp, onPress, onSwipe }: { opp: Opportunite; onPress: () => void; onSwipe: (id: string, action: 'ignore' | 'hot') => void }) {
  const { scale, onIn, onOut } = useScalePress();
  const cfg   = getTypeCfg(opp.type);
  const sc    = scoreStyle(opp.score_pertinence ?? 0);
  const qCol  = QualifColors[opp.qualification] ?? Colors.textTertiary;
  
  const swipeRef = useRef<Swipeable>(null);

  const handleSwipe = (direction: 'left' | 'right') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSwipe(opp.id, direction === 'left' ? 'ignore' : 'hot');
    if (direction === 'right') {
      swipeRef.current?.close();
    }
  };

  const renderLeftActions = () => (
    <View style={[styles.swipeAction, styles.swipeLeft]}>
      <Ionicons name="trash-outline" size={24} color="#FFF" />
      <Text style={styles.swipeTxt}>Ignorer</Text>
    </View>
  );

  const renderRightActions = () => (
    <View style={[styles.swipeAction, styles.swipeRight]}>
      <Text style={{ fontSize: 24 }}>🔥</Text>
      <Text style={styles.swipeTxt}>Chaud</Text>
    </View>
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Swipeable
        ref={swipeRef}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableOpen={(dir) => handleSwipe(dir as 'left' | 'right')}
        friction={2}
        leftThreshold={80}
        rightThreshold={80}
      >
        <Pressable style={[styles.card, { marginBottom: 0 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }} onPressIn={onIn} onPressOut={onOut}>
        <View style={styles.cardRow}>
          <View style={[styles.typeIcon, { backgroundColor: cfg.bg }]}>
            <Text style={{ fontSize: 16 }}>{cfg.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName} numberOfLines={1}>{opp.nom}</Text>
            <Text style={styles.cardDetail} numberOfLines={1}>{opp.detail}</Text>
          </View>
          <View style={[styles.scoreBubble, { backgroundColor: sc.bg }]}>
            <Text style={[styles.scoreTxt, { color: sc.color }]}>{opp.score_pertinence ?? 0}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.qualifDot, { backgroundColor: qCol }]} />
          <Text style={[styles.qualifTxt, { color: qCol }]}>{opp.qualification ?? 'Non qualifié'}</Text>
        </View>
      </Pressable>
      </Swipeable>
      <View style={{ height: Spacing.sm }} />
    </Animated.View>
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
  const [contactSource, setContactSource]   = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [updatingQualif, setUpdatingQualif] = useState(false);
  const [entrepriseData, setEntrepriseData] = useState<EntrepriseData | null>(null);
  const [loadingEntreprise, setLoadingEntreprise] = useState(false);
  const [entrepriseFound, setEntrepriseFound] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [toastVisible, setToastVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(-100)).current;

  const showToast = () => {
    setToastVisible(true);
    Animated.sequence([
      Animated.spring(toastAnim, { toValue: 50, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastAnim, { toValue: -100, duration: 250, useNativeDriver: true })
    ]).start(() => setToastVisible(false));
  };

  const copyToClipboard = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(aiMessage);
    showToast();
  };

  const slideAnim = useRef(new Animated.Value(600)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Animated.timing(opacityAnim, { toValue: 0.4, duration: 150, useNativeDriver: true }).start();
        // @ts-ignore
        slideAnim.setOffset(slideAnim._value);
        slideAnim.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        slideAnim.flattenOffset();
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        if (gestureState.dy > 80 || gestureState.vy > 1) {
          onClose();
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 150 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      setContact(null);
      setAiMessage('');
      setContactSource('');
      setEntrepriseData(null);
      setEntrepriseFound(true);
      slideAnim.setValue(600);
      slideAnim.flattenOffset();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 150 }).start();
      if (opp) {
        Promise.all([searchContact(opp), enrichEntreprise(opp)]);
      }
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, opp]);

  const searchContact = async (o: Opportunite) => {
    setLoadingContact(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-contact', {
        body: { organizationName: o.nom }
      });
      if (error) throw error;
      if (data?.contacts?.length > 0) {
        const c = data.contacts[0];
        setContact({
          nom:     c.nom ?? c.full_name ?? null,
          poste:   c.titre ?? c.poste ?? null,
          email:   c.email ?? null,
          linkedin: c.linkedin_url ?? null,
        });
        setContactSource('Apollo');
      }
    } catch (e) {
      console.error('[searchContact] error:', e);
    } finally {
      setLoadingContact(false);
    }
  };

  const enrichEntreprise = async (o: Opportunite) => {
    setLoadingEntreprise(true);
    setEntrepriseFound(true);
    try {
      // 1. Vérifier le cache Supabase d'abord
      const { data: opp } = await supabase
        .from('opportunites')
        .select('enrichissement')
        .eq('id', o.id)
        .single();

      if (opp?.enrichissement && Object.keys(opp.enrichissement).length > 0) {
        if (opp.enrichissement.found === false) {
          setEntrepriseFound(false);
          return;
        }
        setEntrepriseData(opp.enrichissement as EntrepriseData);
        return;
      }

      // 2. Appel direct data.gouv.fr (API publique, pas de clé)
      const apiUrl = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(o.nom)}&per_page=1`;
      const res = await fetch(apiUrl);
      const gouvData = await res.json();

      if (!gouvData?.results || gouvData.results.length === 0) {
        await supabase.from('opportunites').update({ enrichissement: { found: false } }).eq('id', o.id);
        setEntrepriseFound(false);
        return;
      }

      const result = gouvData.results[0];
      const s = result.siege || {};
      const adresse = [s.adresse_ligne_1 || s.adresse, s.code_postal, s.libelle_commune].filter(Boolean).join(', ');
      const effectifs = result.tranche_effectif_salarie || 'Inconnu';
      const dirigeants = (result.dirigeants || []).slice(0, 3).map((d: any) => ({
        nom: d.nom, prenom: d.prenoms, qualite: d.qualite
      }));
      const financesArray = result.finances || [];
      const CA = financesArray.length > 0 ? financesArray[0].chiffre_affaires : null;

      // Scoring & Détails
      let score_bonus = 0;
      const score_bonus_details: string[] = [];
      
      const effLower = effectifs.toLowerCase();
      let eVal = 0;
      if (effLower.includes('500') || effLower.includes('1 000') || effLower.includes('2 000')) eVal = 500;
      else if (effLower.includes('100') || effLower.includes('200') || effLower.includes('250')) eVal = 100;
      else if (effLower.includes('50')) eVal = 50;
      score_bonus = Math.min(score_bonus, 25);

      const enrichissement: EntrepriseData = {
        nom_officiel: result.nom_complet || '',
        adresse,
        effectifs,
        code_naf: result.activite_principale || '',
        secteur: result.libelle_activite_principale || result.section_activite_principale || '',
        dirigeants,
        chiffre_affaires: CA,
        score_bonus,
      };

      // 3. Sauvegarder en cache
      await supabase.from('opportunites').update({ enrichissement }).eq('id', o.id);
      setEntrepriseData(enrichissement);
    } catch (e) {
      console.warn('[enrichEntreprise] non bloquant:', e);
      setEntrepriseFound(false);
    } finally {
      setLoadingEntreprise(false);
    }
  };

  const generateMessage = async () => {
    if (!opp) return;
    setLoadingMsg(true);
    try {
      const prompt = `Génère un email de prospection B2B pour Scénographie France (agence de scénographie événementielle) à destination de ${opp.nom}.\nContexte de l'opportunité : ${opp.detail}.${contact?.nom ? `\nContact ciblé : ${contact.nom}${contact.poste ? `, ${contact.poste}` : ''}.` : ''}\nL'email doit être court, professionnel, valoriser notre expertise événementielle, et proposer un échange rapide. Signe "Esteban — Scénographie France".`;
      const { data, error } = await supabase.functions.invoke('analyse-reunion', {
        body: { transcription: prompt, mode: 'message' }
      });
      if (error) throw new Error(error.message);
      const msg = data?.message ?? '';
      setAiMessage(msg);
    } catch (e) {
      console.error('[generateMessage] error:', e);
    } finally {
      setLoadingMsg(false);
    }
  };

  const handleQualif = async (q: OppQualif) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!opp) return;
    setUpdatingQualif(true);
    try {
      await supabase.from('opportunites').update({ qualification: q }).eq('id', opp.id);
      onQualifChange(opp.id, q);
    } finally {
      setUpdatingQualif(false);
    }
  };

  if (!opp) return null;
  const cfg = getTypeCfg(opp.type);
  const sc  = scoreStyle(opp.score_pertinence ?? 0);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <Animated.View {...panResponder.panHandlers} style={[styles.sheetHandleArea, { opacity: opacityAnim }]}>
          <View style={styles.sheetHandle} />
        </Animated.View>

        {/* Nav */}
        <View style={styles.sheetNav}>
          <TouchableOpacity onPress={onClose} style={styles.sheetBackBtn}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={[styles.scoreBubble, { backgroundColor: sc.bg }]}>
            <Text style={[styles.scoreTxt, { color: sc.color }]}>{opp.score_pertinence ?? 0}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={[styles.typeIcon, { backgroundColor: cfg.bg, width: 44, height: 44 }]}>
              <Text style={{ fontSize: 20 }}>{cfg.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{opp.nom}</Text>
              <Text style={styles.sheetSub}>{opp.detail}</Text>
            </View>
          </View>

          {/* Entreprise */}
          {entrepriseFound && (
            <View style={styles.sheetSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
                <Text style={[styles.sheetSectionLabel, { marginBottom: 0 }]}>DONNÉES ENTREPRISE</Text>
                {entrepriseData && entrepriseData.score_bonus > 0 && (
                  <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.sm, color: Colors.success }}>
                    [score +{entrepriseData.score_bonus}]
                  </Text>
                )}
              </View>

              {loadingEntreprise ? (
                <View style={[styles.contactCard, { paddingVertical: Spacing.xl }]}>
                  <SkeletonRow width="60%" />
                  <SkeletonRow width="80%" />
                  <SkeletonRow width="40%" marginBottom={0} />
                </View>
              ) : entrepriseData ? (
                <View style={[styles.contactCard, { gap: 6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary }}>🏢  {entrepriseData.nom_officiel}</Text>
                  </View>
                  <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary }}>📍  {entrepriseData.adresse}</Text>
                  <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary }}>👥  {entrepriseData.effectifs}</Text>
                  {entrepriseData.code_naf || entrepriseData.secteur ? (
                    <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary }}>🏭  {entrepriseData.code_naf}{entrepriseData.code_naf && entrepriseData.secteur ? ' — ' : ''}{entrepriseData.secteur}</Text>
                  ) : null}
                  {entrepriseData.chiffre_affaires && (
                    <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary }}>💰  CA : {(entrepriseData.chiffre_affaires / 1000000).toFixed(1)} M€</Text>
                  )}

                  {/* SIREN / SIRET */}
                  {entrepriseData.siren && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textTertiary }}>
                        SIREN : {entrepriseData.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
                      </Text>
                      <TouchableOpacity 
                        onPress={async () => {
                          await Clipboard.setStringAsync(entrepriseData.siren!);
                          setCopiedField('siren');
                          Haptics.selectionAsync();
                          setTimeout(() => setCopiedField(null), 1500);
                        }}
                      >
                        <Ionicons 
                          name={copiedField === 'siren' ? 'checkmark' : 'copy-outline'} 
                          size={14} 
                          color={copiedField === 'siren' ? Colors.success : Colors.textTertiary} 
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                  {entrepriseData.siret_siege && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textTertiary }}>
                        SIRET : {entrepriseData.siret_siege.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')}
                      </Text>
                      <TouchableOpacity 
                        onPress={async () => {
                          await Clipboard.setStringAsync(entrepriseData.siret_siege!);
                          setCopiedField('siret');
                          Haptics.selectionAsync();
                          setTimeout(() => setCopiedField(null), 1500);
                        }}
                      >
                        <Ionicons 
                          name={copiedField === 'siret' ? 'checkmark' : 'copy-outline'} 
                          size={14} 
                          color={copiedField === 'siret' ? Colors.success : Colors.textTertiary} 
                        />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Badge Établissements */}
                  {entrepriseData.nombre_etablissements && entrepriseData.nombre_etablissements > 1 && (
                    <View style={{ 
                      marginTop: Spacing.sm, 
                      padding: Spacing.sm, 
                      borderRadius: Radius.md, 
                      backgroundColor: Colors.accentMuted + '15',
                      borderWidth: 1,
                      borderColor: Colors.accentMuted,
                      gap: 2
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="business-outline" size={16} color={Colors.accent} />
                        <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.sm, color: Colors.accent }}>
                          🏢 {entrepriseData.nombre_etablissements} établissements
                        </Text>
                        {entrepriseData.nombre_etablissements > 10 && (
                          <View style={{ backgroundColor: Colors.successMuted + '33', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Outfit_600SemiBold' }}>🔥 SIGNAL FORT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' }}>
                        Signal commercial fort — potentiellement {entrepriseData.nombre_etablissements} sites à équiper
                      </Text>
                    </View>
                  )}

                  {entrepriseData.dirigeants && entrepriseData.dirigeants.length > 0 && (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 4 }}>DIRIGEANTS</Text>
                      {entrepriseData.dirigeants.map((d, i) => (
                        <Text key={i} style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary }}>• {d.prenom} {d.nom} {d.qualite ? `— ${d.qualite}` : ''}</Text>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          )}

          {/* Qualification */}
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>QUALIFICATION</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {QUALIF_OPTIONS.map(q => {
                const qCol = QualifColors[q] ?? Colors.textTertiary;
                const isActive = opp.qualification === q;
                return (
                  <TouchableOpacity
                    key={q}
                    style={[styles.qualifPill, isActive && { backgroundColor: qCol + '22', borderColor: qCol }]}
                    onPress={() => handleQualif(q)}
                    disabled={updatingQualif}
                  >
                    <Text style={[styles.qualifPillTxt, isActive && { color: qCol }]}>{q}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Contact */}
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>CONTACT {contactSource ? `· ${contactSource}` : ''}</Text>
            {loadingContact ? (
              <View style={[styles.contactCard, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={{ color: Colors.textSecondary, fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm }}>
                  Recherche LinkedIn en cours...
                </Text>
              </View>
            ) : contact ? (
              <View style={styles.contactCard}>
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactInitials}>
                    {(contact.nom ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{contact.nom}</Text>
                  {contact.poste  && <Text style={styles.contactRole}>{contact.poste}</Text>}
                  {contact.email  && <Text style={styles.contactMeta}>{contact.email}</Text>}
                </View>
              </View>
            ) : (
              <Text style={styles.contactNone}>Aucun contact trouvé</Text>
            )}
          </View>

          {/* AI Message */}
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>MESSAGE IA</Text>
            {aiMessage ? (
              <View style={[styles.messageCard, { position: 'relative' }]}>
                <TouchableOpacity 
                   style={{ position: 'absolute', top: 12, right: 12, padding: 8, backgroundColor: Colors.surface, borderRadius: Radius.md, zIndex: 10, borderWidth: 1, borderColor: Colors.border }} 
                   onPress={copyToClipboard}
                >
                  <Ionicons name="copy-outline" size={16} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.messageTxt, { fontFamily: 'Outfit_400Regular', color: Colors.textPrimary, lineHeight: 22 }]}>{aiMessage}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.generateBtn} onPress={generateMessage} disabled={loadingMsg}>
                {loadingMsg
                  ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                  : <Text style={styles.generateBtnTxt}>✨ Générer un message</Text>}
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </Animated.View>

      {/* Toast Notification */}
      {toastVisible && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastAnim }] }]}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} style={{ marginRight: 8 }} />
          <Text style={styles.toastTxt}>Email copié dans le presse-papier</Text>
        </Animated.View>
      )}
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProspectingScreen() {
  const [opps, setOpps] = useState<Opportunite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedOpp, setSelectedOpp] = useState<Opportunite | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const anim0 = useFadeIn(0);
  const anim1 = useFadeIn(60);
  const anim2 = useFadeIn(120);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const setFilterAnimated = useCallback((k: FilterKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilter(k);
  }, []);

  const loadOpps = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('opportunites')
        .select('*')
        .order('score_pertinence', { ascending: false });
      if (error) throw error;
      setOpps(data ?? []);
    } catch (e) {
      console.error('loadOpps error', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadOpps();
      setLoading(false);
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOpps();
    setRefreshing(false);
  };

  const openDetail = (opp: Opportunite) => {
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
    if (filter === 'all')  return true;
    if (filter === 'hot')  return (o.score_pertinence ?? 0) >= 80;
    return o.type === filter;
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
          <SummaryStrip opps={opps} onFilter={setFilterAnimated} />
        </Animated.View>

        {/* Filter Bar */}
        <Animated.View style={anim1}>
          <FilterBar active={filter} setActive={setFilterAnimated} />
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
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTxt}>Aucune opportunité dans ce filtre</Text>
            </View>
          ) : (
            filtered.map(opp => (
              <OppCard key={opp.id} opp={opp} onPress={() => openDetail(opp)} onSwipe={handleSwipeCard} />
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.base },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, color: Colors.textPrimary, letterSpacing: -0.4 },
  headerSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 3 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.successMuted,
    borderWidth: 0.5, borderColor: Colors.success,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.xs, color: Colors.success },

  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },

  // Summary Strip
  strip: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  stripItem: { flex: 1, alignItems: 'center', gap: 3 },
  stripVal: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, letterSpacing: -0.8 },
  stripLabel: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textSecondary },
  stripDiv: { width: 0.5, height: 36, backgroundColor: Colors.border },

  // Filter bar
  filterBar: { gap: 8, paddingVertical: 2 },
  pill: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevated,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.textSecondary },
  pillTxtActive: { color: Colors.textPrimary },

  // List header
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -4 },
  listLabel: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.08 },
  listCount: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.sm, color: Colors.textSecondary },

  // Opp card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  typeIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.lg, color: Colors.textPrimary, letterSpacing: -0.2 },
  cardDetail: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1, opacity: 0.5 },
  scoreBubble: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
  scoreTxt: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.sm },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -2 },
  qualifDot: { width: 6, height: 6, borderRadius: 3 },
  qualifTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs },

  // Swipe
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
  },
  swipeLeft: {
    backgroundColor: Colors.danger,
    marginRight: Spacing.sm,
  },
  swipeRight: {
    backgroundColor: Colors.success,
    marginLeft: Spacing.sm,
  },
  swipeTxt: {
    color: '#FFF',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 10,
    marginTop: 4,
  },

  // Skeleton
  skeletonCard: { height: 80, backgroundColor: Colors.surface, borderRadius: Radius.lg },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: Spacing.sm },
  emptyEmoji: { fontSize: 36 },
  emptyTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textTertiary },

  // Sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 0.5, borderColor: Colors.border,
    maxHeight: '90%',
  },
  sheetHandleArea: {
    width: '100%', paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center'
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  sheetBackBtn: {
    minWidth: 44, minHeight: 44, borderRadius: Radius.pill,
    backgroundColor: Colors.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetScroll: { padding: Spacing.lg, gap: Spacing.xl },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xl, color: Colors.textPrimary, letterSpacing: -0.3, flex: 1 },
  sheetSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 3, flex: 1 },
  sheetSection: { gap: Spacing.sm },
  sheetSectionLabel: {
    fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs,
    color: Colors.textTertiary, letterSpacing: 0.08, textTransform: 'uppercase',
  },

  toast: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 999,
  },
  toastTxt: {
    fontFamily: 'Outfit_500Medium',
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },

  // Qualif pills
  qualifPill: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevated, borderWidth: 0.5, borderColor: Colors.border,
  },
  qualifPillTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.textSecondary },

  // Contact card
  contactCard: {
    backgroundColor: Colors.elevated, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  contactAvatar: {
    width: 42, height: 42, borderRadius: Radius.md,
    backgroundColor: Colors.accentMuted, borderWidth: 0.5, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  contactInitials: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.sm, color: Colors.accent },
  contactName: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary },
  contactRole: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  contactMeta: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  contactNone: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textTertiary, fontStyle: 'italic' },

  // Message
  messageCard: {
    backgroundColor: Colors.elevated, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, padding: Spacing.lg,
  },
  messageTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  generateBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  generateBtnTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary },
});
