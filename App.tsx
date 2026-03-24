
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Animated, TouchableOpacity, Easing, TextInput, Linking, Clipboard, Alert, Platform, ActivityIndicator, PanResponder, Dimensions, Modal } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from './lib/supabase';
import { useAudioRecorder } from './hooks/useAudioRecorder';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  cream: '#F4F1EB', cream2: '#EAE6DE',
  white: '#FFFFFF',
  black: '#0C0C0C',
  blue: '#1A6BFF', blueBg: '#EBF1FF',
  muted: '#9B9590', muted2: '#C2BDB6',
  green: '#16A34A', greenBg: '#DCFCE7',
  orange: '#EA580C', orangeBg: '#FFF0E8',
  red: '#DC2626', redBg: '#FEE2E2',
  border: '#E0DBD3',
};

const CLASH    = 'Outfit_700Bold';
const CLASH_MD = 'Outfit_600SemiBold';
const INTER    = 'Outfit_400Regular';
const INTER_MD = 'Outfit_500Medium';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function scoreStyle(s: number) {
  if (s >= 76) return { bg: C.greenBg, color: C.green };
  if (s >= 50) return { bg: C.blueBg,  color: C.blue  };
  return              { bg: C.redBg,   color: C.red   };
}

function formatTime(s: number) {
  const mins = Math.floor(s / 60).toString().padStart(2, '0');
  const secs = (s % 60).toString().padStart(2, '0');
  return mins + ':' + secs;
}

// ─── ANIMATED ENTER ───────────────────────────────────────────────────────────
function AnimUp({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 400, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 400, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: ty }] }, style]}>{children}</Animated.View>;
}

// ─── PULSING DOT ──────────────────────────────────────────────────────────────
function PulseDot({ color = C.green }: { color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const op    = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
        Animated.timing(op,    { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1,   duration: 1000, useNativeDriver: true }),
        Animated.timing(op,    { toValue: 1,   duration: 1000, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return <Animated.View style={[shared.dot, { backgroundColor: color, transform: [{ scale }], opacity: op }]} />;
}

const shared = StyleSheet.create({
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});

// ─── DATA ─────────────────────────────────────────────────────────────────────
type Status = 'Nouveau' | 'En cours' | 'Envoyé' | 'À contacter';
const STATUS_STYLE: Record<Status, { bg: string; color: string }> = {
  'Nouveau':     { bg: C.blueBg,   color: C.blue   },
  'En cours':    { bg: C.orangeBg, color: C.orange },
  'Envoyé':      { bg: C.greenBg,  color: C.green  },
  'À contacter': { bg: C.cream2,   color: C.muted  },
};
type OppItem   = { emoji: string; emojiBg: string; name: string; detail: string; status: Status; opp?: Opp };
type FolderDat = { id: string; date: string; count: string; isNew: boolean; items: OppItem[] };

const FOLDERS_DASH: FolderDat[] = [
  {
    id: 'today', date: "Aujourd'hui — 09 Mars", count: '3 new', isNew: true,
    items: [
      { emoji: '🏛', emojiBg: C.blueBg,   name: 'Salon Space 2026',     detail: 'Sept. 2026 · Rennes · 1 400 exposants', status: 'Nouveau' },
      { emoji: '🎂', emojiBg: C.orangeBg, name: 'Sojasun — 30 ans',     detail: 'Anniversaire décennal 2028',            status: 'Nouveau' },
      { emoji: '🚗', emojiBg: C.greenBg,  name: 'BYD Orca — Lancement', detail: 'Q2 2026 · Contact identifié',          status: 'Nouveau' },
    ],
  },
  {
    id: 'yesterday', date: 'Hier — 08 Mars', count: '2', isNew: false,
    items: [
      { emoji: '🏛', emojiBg: C.blueBg,  name: 'Viva Technology 2026', detail: 'Juin 2026 · Paris · Tech & Innovation', status: 'En cours' },
      { emoji: '🎂', emojiBg: C.greenBg, name: 'Groupama — 20 ans',    detail: 'Anniversaire 2027 · Contact trouvé',   status: 'Envoyé'   },
    ],
  },
  {
    id: 'friday', date: 'Vendredi — 06 Mars', count: '4', isNew: false,
    items: [
      { emoji: '🚗', emojiBg: C.orangeBg, name: 'Renault R5 Turbo 3E', detail: 'Lancement Q3 2026 · Révélation', status: 'Envoyé'      },
      { emoji: '🏛', emojiBg: C.blueBg,   name: 'Batimat 2026',        detail: 'Nov. 2026 · Paris Le Bourget', status: 'À contacter' },
    ],
  },
];

const FOLDERS_ALL: FolderDat[] = [
  FOLDERS_DASH[0], FOLDERS_DASH[1],
  {
    id: 'friday_all', date: 'Vendredi — 06 Mars', count: '4', isNew: false,
    items: [
      { emoji: '🚗', emojiBg: C.orangeBg, name: 'Renault R5 Turbo 3E', detail: 'Lancement Q3 2026',     status: 'Envoyé'      },
      { emoji: '🏛', emojiBg: C.blueBg,   name: 'Batimat 2026',        detail: 'Nov. 2026 · Le Bourget', status: 'À contacter' },
      { emoji: '🎂', emojiBg: C.orangeBg, name: 'BNP Paribas — 50 ans',detail: 'Anniversaire 2028',     status: 'À contacter' },
      { emoji: '🚗', emojiBg: C.greenBg,  name: 'Peugeot E-408',       detail: 'Lancement Q4 2026',     status: 'Nouveau'     },
    ],
  },
  { id: 'thursday', date: 'Jeudi — 05 Mars', count: '1', isNew: false,
    items: [{ emoji: '🏛', emojiBg: C.blueBg, name: 'SIAL Paris 2026', detail: 'Oct. 2026 · Agroalimentaire', status: 'Envoyé' }] },
];

const MEETINGS_DATA = [
  { score: 91, name: 'Renault France',    meta: 'Hier · 42 min · Révélation Alpine A310', pillBg: C.greenBg,  pillColor: C.green,  pill: 'Auto'  },
  { score: 67, name: 'Westfield Parly 2', meta: 'Lun. 06 · 28 min · Pop-up store',        pillBg: C.blueBg,   pillColor: C.blue,   pill: 'Stand' },
  { score: 78, name: 'Groupe Convivio',   meta: 'Ven. 04 · 55 min · Soirée gala',         pillBg: C.orangeBg, pillColor: C.orange, pill: 'Scéno' },
  { score: 44, name: 'Startup XYZ',       meta: 'Jeu. 03 · 18 min · Stand événement',     pillBg: C.blueBg,   pillColor: C.blue,   pill: 'Stand' },
  { score: 88, name: 'DS Automobiles',    meta: 'Mar. 01 · 37 min · Showroom éphémère',   pillBg: C.greenBg,  pillColor: C.green,  pill: 'Auto'  },
];

const ANALYSES = [
  { name: 'Renault France',    date: 'Hier · 42 min',     score: 91, tag: 'Auto',  tagBg: C.greenBg,  tagColor: C.green  },
  { name: 'Westfield Parly 2', date: 'Lun. 06 · 28 min', score: 67, tag: 'Stand', tagBg: C.blueBg,   tagColor: C.blue   },
  { name: 'Groupe Convivio',   date: 'Ven. 04 · 55 min', score: 78, tag: 'Scéno', tagBg: C.orangeBg, tagColor: C.orange },
  { name: 'DS Automobiles',    date: 'Mar. 01 · 37 min', score: 88, tag: 'Auto',  tagBg: C.greenBg,  tagColor: C.green  },
  { name: 'Startup XYZ',       date: 'Jeu. 03 · 18 min', score: 44, tag: 'Stand', tagBg: C.blueBg,   tagColor: C.blue   },
];

// ─── FOLDER COMPONENT ─────────────────────────────────────────────────────────
function Folder({ data, defaultOpen = false, onNavigateOpp }: { data: FolderDat; defaultOpen?: boolean; onNavigateOpp?: (opp: Opp) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const rot = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    Animated.timing(rot, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start();
    setOpen(!open);
  };

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={ds.folder}>
      <TouchableOpacity onPress={toggle} style={ds.folderHeader} activeOpacity={0.7}>
        <Text style={ds.folderIcon}>📁</Text>
        <Text style={ds.folderDate}>{data.date}</Text>
        <View style={[ds.folderCount, data.isNew && ds.folderCountNew]}>
          <Text style={[ds.folderCountTxt, data.isNew && ds.folderCountTxtNew]}>{data.count}</Text>
        </View>
        <Animated.Text style={[ds.folderChev, { transform: [{ rotate }] }]}>›</Animated.Text>
      </TouchableOpacity>
      {open && (
        <View style={ds.folderItems}>
          {data.items?.filter(item => item != null)?.map((item, i) => (
            <View key={i}>
              <TouchableOpacity style={ds.oppItem} activeOpacity={0.7} onPress={() => { if (item.opp && onNavigateOpp) onNavigateOpp(item.opp); }}>
                <View style={[ds.oppEmoji, { backgroundColor: item.emojiBg }]}>
                  <Text style={{ fontSize: 15 }}>{item.emoji}</Text>
                </View>
                <View style={ds.oppInfo}>
                  <Text style={ds.oppName} numberOfLines={1}>{item.name}</Text>
                  <Text style={ds.oppDetail}>{item.detail}</Text>
                </View>
                {item.status && STATUS_STYLE[item.status] && (
                  <View style={[ds.oppStatus, { backgroundColor: STATUS_STYLE[item.status].bg }]}>
                    <Text style={[ds.oppStatusTxt, { color: STATUS_STYLE[item.status].color }]}>{item.status}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {i < data.items.length - 1 && <View style={ds.oppSep} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSE SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const STEPS_DATA = [
  { icon: '🎙', label: 'Transcription audio',    iconBg: C.greenBg, start: 0,  end: 25  },
  { icon: '🧠', label: 'Extraction des besoins', iconBg: C.blueBg,  start: 25, end: 60  },
  { icon: '🎨', label: 'Recommandations Scéno',  iconBg: C.cream,   start: 60, end: 85  },
  { icon: '📊', label: 'Génération rapport',      iconBg: C.cream,   start: 85, end: 100 },
];

const WAVE_BARS = [14, 22, 30, 18, 34, 26, 10, 20, 32, 24, 12, 28, 8, 22, 18, 30, 14, 26, 20, 34, 16, 24, 10, 28, 22];

function AnalyseScreen({ 
  onViewReport, 
  audioLabel = 'Réunion enregistrée', 
  audioDuration = '00:00',
  audioBase64,
  durationMs
}: {
  onViewReport: (data: any) => void;
  audioLabel?: string;
  audioDuration?: string;
  audioBase64?: string | null;
  durationMs?: number | null;
}) {
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(0);
  const [isDone,   setIsDone]   = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Animations
  const spinAnim    = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const btnFade     = useRef(new Animated.Value(0)).current;
  const doneScale   = useRef(new Animated.Value(0.7)).current;

  // SVG ring constants
  const RING_R    = 44;
  const RING_CIRC = 2 * Math.PI * RING_R;
  const ARC       = RING_CIRC * 0.28;

  const runAnalysis = async () => {
    try {
      console.log('[AnalyseScreen] Starting runAnalysis...');
      console.log('Params reçus:', JSON.stringify({ audioLabel, audioDuration, audioBase64Length: audioBase64?.length, durationMs }));
      setErrorMsg(null);
      setProgress(10); // Start transcription
      
      // ── Step 1: Upload audio to Supabase Storage ──────────────────
      let audioUrl: string | null = null;
      let cleanBase64: string | undefined | null = audioBase64; // Declare cleanBase64 here
      if (audioBase64) {
        try {
          console.log('[AnalyseScreen] Uploading audio to storage...');
          cleanBase64 = audioBase64.includes(';base64,') ? audioBase64.split(';base64,').pop() : audioBase64;
          const binaryStr = atob(cleanBase64!);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const timestamp = Date.now();
          const fileName = `reunion_${timestamp}.webm`;
          const { data: storageData, error: storageErr } = await supabase.storage
            .from('reunions-audio')
            .upload(fileName, bytes, { contentType: 'audio/webm', upsert: false });
          if (storageErr) {
            console.warn('[AnalyseScreen] Audio upload failed (non-blocking):', storageErr.message);
          } else {
            const { data: urlData } = supabase.storage.from('reunions-audio').getPublicUrl(fileName);
            audioUrl = urlData?.publicUrl || null;
            console.log('[AnalyseScreen] Audio uploaded, URL:', audioUrl);
          }
        } catch(e: any) {
          console.warn('[AnalyseScreen] Audio upload error (non-blocking):', e.message);
        }
      }

      // ── Step 2: Transcription ──────────────────────────────────────
      let transcriptionText = "";
      if (audioBase64) {
        if (audioBase64.length > 33000000) {
          Alert.alert("Analyse long format", "Audio long détecté — la transcription s'effectuera en plusieurs parties pour garantir la précision.");
        }
        console.log("Envoi à transcribe-audio...");
        console.log("[AnalyseScreen] Calling transcribe-audio edge function with base64 length:", audioBase64.length);
        const res1 = await supabase.functions.invoke('transcribe-audio', {
          body: { audioBase64, duration: durationMs },
        });
        console.log('Réponse transcription complète:', JSON.stringify(res1));
        if (res1.error) {
          throw new Error("Erreur Whisper: " + (res1.error.message || JSON.stringify(res1.error)));
        }
        if (!res1.data || !res1.data.transcription) {
          throw new Error("Réponse Whisper vide ou malformée: " + JSON.stringify(res1.data));
        }
        transcriptionText = res1.data.transcription;
        console.log('[AnalyseScreen] Transcription OK, longueur:', transcriptionText.length);
      } else {
        console.log('[AnalyseScreen] Aucun audioBase64 — pas de transcription possible.');
        throw new Error("Aucun audio détecté. Veuillez enregistrer ou importer un fichier audio.");
      }

      
      Animated.timing(progressAnim, { toValue: 25, duration: 500, useNativeDriver: false }).start();
      setProgress(30); // Start extraction

      // ── Step 3: GPT-4o Analysis ────────────────────────────────────
      // Appel analyse-reunion supprimé ici car redondant avec meetings.tsx
      console.log('Analyse-reunion ignorée dans App.tsx (Doublon détecté avec meetings.tsx)');
      const res2 = { data: { analysis: {} }, error: null }; 
      console.log('Réponse GPT-4o:', JSON.stringify(res2));
      if (res2.error) throw new Error(res2.error.message || "Error during analysis");
      
      const analysisJSON = res2.data.analysis;
      // Merge audioUrl into analysis for RapportScreen
      const fullReport = { ...analysisJSON, audio_url: audioUrl };
      setReportData(fullReport);
      
      Animated.timing(progressAnim, { toValue: 60, duration: 500, useNativeDriver: false }).start();
      setProgress(65); // Save to DB

      // ── Step 4: Save to DB ─────────────────────────────────────────
      console.log("[AnalyseScreen] Saving to Supabase database...");
      const dbRes = await supabase.from('reunions').insert([{
        prospect_nom: analysisJSON.prospect_nom,
        prospect_secteur: analysisJSON.prospect_secteur,
        duree_audio: audioDuration,
        transcription: transcriptionText,
        score_global: analysisJSON.score_global,
        indicateurs: analysisJSON.indicateurs,
        besoins: analysisJSON.besoins_detectes,
        prestations: analysisJSON.prestations_recommandees,
        plan_action: analysisJSON.plan_action,
        audio_url: audioUrl,
        propositions_techniques: analysisJSON.propositions_techniques || null,
        email_suivi: analysisJSON.email_suivi || null,
        budget_detecte: analysisJSON.budget_detecte || null,
        deadline_detectee: analysisJSON.deadline_detectee || null,
        mots_cles: analysisJSON.mots_cles || null,
        decideurs: analysisJSON.decideurs_identifies || null,
        concurrents: analysisJSON.concurrents_mentionnes || null,
      }]).select().single();
      console.log('[AnalyseScreen] Supabase insert response:', JSON.stringify(dbRes));
      
      if (dbRes.error) throw new Error(dbRes.error.message);

      Animated.timing(progressAnim, { toValue: 100, duration: 800, useNativeDriver: false }).start(() => {
        setIsDone(true);
        Animated.parallel([
          Animated.spring(doneScale, { toValue: 1, friction: 5, useNativeDriver: true }),
          Animated.timing(btnFade,  { toValue: 1, duration: 700, delay: 400, useNativeDriver: true }),
        ]).start();
      });

    } catch (err: any) {
      console.error('[AnalyseScreen] Catch error:', err);
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    Animated.loop(Animated.timing(spinAnim, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true })).start();
    runAnalysis();
    
    const listener = progressAnim.addListener(({ value }) => {
      // Don't override progress abruptly if it's jumping
      if (value > progress) setProgress(Math.round(value));
    });
    return () => progressAnim.removeListener(listener);
  }, []);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  function stepStatus(s: typeof STEPS_DATA[0]) {
    if (errorMsg && progress >= s.start && progress < s.end) return 'error';
    if (progress >= s.end)   return 'done';
    if (progress >= s.start) return 'active';
    return 'pending';
  }

  return (
    <View style={[as.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={as.header}>
        <Text style={as.headerTitle}>Analyse en cours</Text>
        <Text style={as.headerSub}>Ne quittez pas l'application</Text>
      </View>

      <ScrollView contentContainerStyle={as.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Central animation ─────────────────────────────────── */}
        <View style={as.central}>
          <View style={as.ringWrapper}>
            {!isDone ? (
              <>
                {/* Spinning arc */}
                <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: spin }] }]}>
                  <Svg width={120} height={120}>
                    {/* Track */}
                    <Circle cx={60} cy={60} r={RING_R} fill="none" stroke={C.border} strokeWidth={5} />
                    {/* Moving arc */}
                    <Circle
                      cx={60} cy={60} r={RING_R}
                      fill="none" stroke={C.blue} strokeWidth={5}
                      strokeLinecap="round"
                      strokeDasharray={`${ARC} ${RING_CIRC - ARC}`}
                      transform={`rotate(-90, 60, 60)`}
                    />
                  </Svg>
                </Animated.View>
                {/* Dark inner circle */}
                <View style={as.innerCircle}>
                  <Text style={{ fontSize: 34 }}>🧠</Text>
                </View>
              </>
            ) : (
              /* Done — green circle springs in */
              <Animated.View style={[as.innerCircleDone, { transform: [{ scale: doneScale }] }]}>
                <Text style={as.checkMark}>✓</Text>
              </Animated.View>
            )}
          </View>

          {/* Percentage / done text */}
          {isDone ? (
            <Animated.Text style={[as.doneText, { opacity: btnFade }]}>Analyse terminée !</Animated.Text>
          ) : (
            <Text style={as.percent}>{progress}%</Text>
          )}
        </View>

        {/* ── Steps ─────────────────────────────────────────────── */}
        <View style={as.stepsCard}>
          {STEPS_DATA.map((step, i) => {
            const status = stepStatus(step);
            const isPending = status === 'pending';
            return (
              <View key={i}>
                <View style={as.stepRow}>
                  <View style={[as.stepIcon, { backgroundColor: step.iconBg }, isPending && as.stepIconPending]}>
                    <Text style={{ fontSize: 16 }}>{step.icon}</Text>
                  </View>
                  <Text style={[as.stepLabel, isPending && { color: C.muted }]}>{step.label}</Text>
                  <View>
                    {status === 'done' && (
                      <Text style={as.statusDone}>Terminé ✓</Text>
                    )}
                    {status === 'active' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <PulseDot color={C.blue} />
                        <Text style={as.statusActive}>En cours...</Text>
                      </View>
                    )}
                    {status === 'pending' && (
                      <Text style={as.statusPending}>En attente</Text>
                    )}
                  </View>
                </View>
                {i < STEPS_DATA.length - 1 && <View style={as.stepSep} />}
              </View>
            );
          })}
        </View>

        {/* ── Audio info card ───────────────────────────────────── */}
        <View style={as.audioCard}>
          <View style={as.audioRow}>
            <View>
              <Text style={as.audioName}>{audioLabel}</Text>
              <Text style={as.audioDur}>{audioDuration}</Text>
            </View>
            <View style={as.waveform}>
              {WAVE_BARS.map((h, i) => (
                <View key={i} style={[as.waveBar, { height: h }]} />
              ))}
            </View>
          </View>
        </View>

        {/* ── Error block ────────────────────────────────────────── */}
        {errorMsg && (
          <View style={{ marginTop: 16, padding: 14, backgroundColor: C.redBg, borderRadius: 12, borderColor: C.red, borderWidth: 1 }}>
            <Text style={{ color: C.red, fontFamily: CLASH_MD, fontSize: 14, marginBottom: 4 }}>❌ Erreur</Text>
            <Text style={{ color: C.red, fontFamily: INTER, fontSize: 13, lineHeight: 18 }}>{errorMsg}</Text>
          </View>
        )}

        {/* ── Report button (appears when done) ─────────────────── */}
        <Animated.View style={{ opacity: btnFade }}>
          {isDone && (
            <TouchableOpacity style={as.reportBtn} onPress={() => onViewReport(reportData)} activeOpacity={0.85}>
              <Text style={as.reportBtnTxt}>Voir le rapport →</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RÉUNION SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function ReunionScreen({ topPad, onStartAnalyse, onViewPastReport }: { topPad: number; onStartAnalyse: (source: string, durFormatted: string, base64: string, durMs: number | null) => void; onViewPastReport: (reportData: any) => void }) {
  const { isRecording, duration, startRecording, stopRecording, importAudio } = useAudioRecorder();

  const [pastAnalyses, setPastAnalyses] = useState<any[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);

  useEffect(() => {
    async function fetchReunions() {
      try {
        const { data, error } = await supabase
          .from('reunions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (error) throw error;
        setPastAnalyses(data || []);
      } catch (err: any) {
        console.warn('Error fetching past analyses:', err.message);
      } finally {
        setLoadingAnalyses(false);
      }
    }
    fetchReunions();
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
  };

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const anim1Ref  = useRef<Animated.CompositeAnimation | null>(null);
  const anim2Ref  = useRef<Animated.CompositeAnimation | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isRecording) {
      pulse1.setValue(0); pulse2.setValue(0);
      const a1 = Animated.loop(Animated.timing(pulse1, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
      a1.start(); anim1Ref.current = a1;
      timer2Ref.current = setTimeout(() => {
        const a2 = Animated.loop(Animated.timing(pulse2, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
        a2.start(); anim2Ref.current = a2;
      }, 500);
    } else {
      anim1Ref.current?.stop(); anim2Ref.current?.stop();
      if (timer2Ref.current) clearTimeout(timer2Ref.current);
      pulse1.setValue(0); pulse2.setValue(0);
    }
    return () => {
      anim1Ref.current?.stop(); anim2Ref.current?.stop();
      if (timer2Ref.current) clearTimeout(timer2Ref.current);
    };
  }, [isRecording]);

  const r1Scale   = pulse1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.0] });
  const r1Opacity = pulse1.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.15, 0.1, 0] });
  const r2Scale   = pulse2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const r2Opacity = pulse2.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.08, 0.05, 0] });

  const formatDur = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    return formatTime(totalSeconds);
  };

  const handleMicPress = async () => {
    if (isRecording) {
      const res = await stopRecording();
      if (res) {
        onStartAnalyse('Réunion enregistrée', formatDur(res.duration), res.audioBase64, res.duration);
      }
    } else {
      await startRecording();
    }
  };

  const handleStop = async () => {
    const res = await stopRecording();
    if (res) {
      onStartAnalyse('Réunion enregistrée', formatDur(res.duration), res.audioBase64, res.duration);
    }
  };

  const handleImport = async () => {
    const res = await importAudio();
    if (res) {
      onStartAnalyse(res.fileName || 'Fichier importé', '00:00', res.audioBase64, res.duration);
    }
  };

  return (
    <View style={[rs.container, { paddingTop: topPad }]}>
      <View style={rs.header}>
        <TouchableOpacity style={rs.headerBtn}><Text style={rs.headerBack}>←</Text></TouchableOpacity>
        <Text style={rs.headerTitle}>Réunion</Text>
        <TouchableOpacity style={rs.headerBtn}><Text style={{ fontSize: 16 }}>◷</Text></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={rs.scrollContent}>
        <AnimUp delay={0}>
          <View style={rs.recordCard}>
            <Text style={rs.recordTitle}>Nouvelle réunion</Text>
            <Text style={rs.recordSub}>Enregistrez ou importez un fichier audio</Text>
            <View style={rs.micWrapper}>
              <Animated.View style={[rs.pulseRing, { transform: [{ scale: r2Scale }], opacity: r2Opacity }]} />
              <Animated.View style={[rs.pulseRing, { transform: [{ scale: r1Scale }], opacity: r1Opacity }]} />
              <TouchableOpacity
                style={[rs.micBtn, { backgroundColor: isRecording ? C.red : C.blue }]}
                onPress={handleMicPress}
                activeOpacity={0.85}
              >
                <Text style={rs.micIcon}>🎙</Text>
              </TouchableOpacity>
            </View>
            {isRecording ? (
              <View style={rs.recordingStatus}>
                <PulseDot color={C.green} />
                <Text style={rs.recordingText}>Enregistrement en cours...</Text>
              </View>
            ) : (
              <Text style={rs.tapText}>Appuyer pour enregistrer</Text>
            )}
            <Text style={rs.timer}>{formatDur(duration || 0)}</Text>
            {isRecording && (
              <TouchableOpacity style={rs.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <Text style={rs.stopBtnText}>■  Arrêter</Text>
              </TouchableOpacity>
            )}
          </View>
        </AnimUp>

        <AnimUp delay={60}>
          <View style={rs.separator}>
            <View style={rs.sepLine} />
            <Text style={rs.sepText}>— ou —</Text>
            <View style={rs.sepLine} />
          </View>
        </AnimUp>

        <AnimUp delay={100}>
          <TouchableOpacity style={rs.importBtn} activeOpacity={0.8} onPress={handleImport}>
            <Text style={{ fontSize: 20 }}>📎</Text>
            <View style={{ flex: 1 }}>
              <Text style={rs.importTitle}>Importer un fichier audio</Text>
              <Text style={rs.importSub}>MP3, WAV, M4A</Text>
            </View>
            <Text style={rs.importArrow}>›</Text>
          </TouchableOpacity>
        </AnimUp>

        <AnimUp delay={180}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rs.analysesList} style={{ marginHorizontal: -22 }}>
            <View style={{ width: 22 }} />
            {loadingAnalyses ? (
              <View style={{ padding: 20, justifyContent: 'center', alignItems: 'center', width: 200 }}>
                <ActivityIndicator color={C.blue} />
              </View>
            ) : pastAnalyses.length === 0 ? (
              <View style={{ backgroundColor: '#222', borderRadius: 14, padding: 20, width: 220, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: INTER, fontSize: 12, color: C.muted, textAlign: 'center' }}>Aucune analyse pour le moment</Text>
              </View>
            ) : (
              pastAnalyses.map((a, i) => {
                const sc = scoreStyle(a.score_global);
                return (
                  <TouchableOpacity key={i} style={rs.analyseCard} activeOpacity={0.85} onPress={() => onViewPastReport(a)}>
                    <View style={rs.analyseTop}>
                      <View style={[rs.scoreCircle, { backgroundColor: sc.bg }]}>
                        <Text style={[rs.scoreCircleTxt, { color: sc.color }]}>{a.score_global || 0}</Text>
                      </View>
                      <View style={[rs.tagPill, { backgroundColor: C.blueBg }]}>
                        <Text style={[rs.tagPillTxt, { color: C.blue }]}>{a.prospect_secteur || 'Autre'}</Text>
                      </View>
                    </View>
                    <Text style={rs.analyseName} numberOfLines={2}>{a.prospect_nom || 'Prospect Inconnu'}</Text>
                    <Text style={rs.analyseDate}>{formatDate(a.created_at)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ width: 6 }} />
          </ScrollView>
        </AnimUp>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAPPORT SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const SCORE_BARS = [
  { label: 'Engagement prospect',   value: 84, display: '84%',          color: C.green },
  { label: 'Clarté du besoin',       value: 91, display: '91%',          color: C.green },
  { label: 'Probabilité conversion', value: 78, display: '78%',          color: C.blue  },
  { label: 'Budget détecté',         value: 65, display: '65%',          color: C.blue  },
  { label: 'Objections',             value: 20, display: '2 détectées', color: C.red   },
];
const NEEDS = [
  'Stand immersif 200m² pour Salon de l\'Auto 2026',
  'Budget estimé 80–120k€',
  'Livraison avant septembre 2026',
  'Référence dans le secteur automobile souhaitée',
];
const RECO_CARDS = [
  { emoji: '🚗', title: 'Révélation véhicule',        desc: 'Dispositif immersif haute impact pour révéler votre modèle phare.' },
  { emoji: '🏛', title: 'Stand immersif 200m²',        desc: 'Stand modulaire premium avec espaces d\'accueil et démo live.' },
  { emoji: '🎨', title: 'Scénographie événementielle', desc: 'Mise en scène artistique pour maximiser l\'impact de votre événement.' },
];
const ACTION_PLAN = [
  'Envoyer la plaquette références auto sous 48h',
  'Proposer une visite studio la semaine prochaine',
  'Préparer un devis stand 200m² avec options modulaires',
];

function RapportScreen({ reportData, onBack, onNavigateMessages }: { reportData?: any; onBack: () => void; onNavigateMessages?: () => void }) {
  const insets = useSafeAreaInsets();
  
  // GPT retourne indicateurs comme un objet {engagement: 85, clarte_besoin: 90, ...}
  // ou comme un array [{nom, score}, ...] selon les versions. On gère les deux cas.
  const INDICATEUR_LABELS: Record<string, string> = {
    engagement: 'Engagement prospect',
    clarte_besoin: 'Clarté du besoin',
    probabilite_conversion: 'Probabilité conversion',
    budget_detecte: 'Budget détecté',
    objections: 'Objections',
  };

  const scoreBars = (() => {
    const ind = reportData?.indicateurs;
    if (!ind) return SCORE_BARS;
    // Cas 1 : array [{nom, score}, ...]
    if (Array.isArray(ind) && ind.length > 0) {
      return ind.map((i: any) => ({
        label: i.nom || i.label || 'Indicateur',
        value: i.score || i.value || 0,
        display: `${i.score || i.value || 0}/100`,
        color: (i.score || i.value || 0) >= 80 ? C.green : (i.score || i.value || 0) >= 50 ? C.orange : C.red,
      }));
    }
    // Cas 2 : objet {engagement: 85, clarte_besoin: 90, ...}
    if (typeof ind === 'object' && !Array.isArray(ind)) {
      return Object.entries(ind).map(([key, val]: [string, any]) => {
        const v = typeof val === 'number' ? val : 0;
        return {
          label: INDICATEUR_LABELS[key] || key,
          value: v,
          display: `${v}/100`,
          color: v >= 80 ? C.green : v >= 50 ? C.orange : C.red,
        };
      });
    }
    return SCORE_BARS;
  })();

  const needs = Array.isArray(reportData?.besoins_detectes) && reportData.besoins_detectes.length > 0
    ? reportData.besoins_detectes
    : NEEDS;

  const recos = Array.isArray(reportData?.prestations_recommandees) && reportData.prestations_recommandees.length > 0
    ? reportData.prestations_recommandees.map((rec: any) => ({
        title: rec.nom_prestation || rec.nom || rec.title || 'Prestation',
        desc: rec.justification || rec.description || rec.desc || '',
        emoji: rec.emoji || '✨',
      }))
    : RECO_CARDS;

  const plan = Array.isArray(reportData?.plan_action) && reportData.plan_action.length > 0
    ? reportData.plan_action
    : ACTION_PLAN;

  const barAnims = useRef(scoreBars.map(() => new Animated.Value(0))).current;

  // Audio player state
  const player = useAudioPlayer(reportData?.audio_url || null);
  const isPlaying = player.playing;
  const audioPosition = Math.floor(player.currentTime * 1000);
  const audioDurationMs = Math.floor(player.duration * 1000) || 0;

  // Email expand state
  const [emailExpanded, setEmailExpanded] = useState(false);

  useEffect(() => {
    Animated.stagger(120, barAnims.map((anim: Animated.Value) =>
      Animated.timing(anim, { toValue: 1, duration: 900, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    )).start();
  }, []);

  const toggleAudio = () => {
    const url = reportData?.audio_url;
    if (!url) return;
    try {
      if (player.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch (e: any) {
      console.warn('Audio play error:', e.message);
    }
  };

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  };

  return (
    <View style={[rp.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={rp.header}>
        <TouchableOpacity style={rp.headerBtn} onPress={onBack}><Text style={rp.headerBack}>←</Text></TouchableOpacity>
        <Text style={rp.headerTitle}>Rapport</Text>
        <TouchableOpacity style={rp.shareBtn}><Text style={rp.shareTxt}>Partager</Text></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={rp.scroll}>

        {/* ── S1 Identité réunion ──────────────────────────────── */}
        <AnimUp delay={0}>
          <View style={rp.identCard}>
            <View style={rp.identTop}>
              <Text style={rp.prospectName}>{reportData?.prospect_nom ?? 'Prospect inconnu'}</Text>
              <View style={[rp.tagPill, { backgroundColor: C.greenBg }]}>
                <Text style={[rp.tagTxt, { color: C.green }]}>{reportData?.prospect_secteur || 'Secteur Inconnu'}</Text>
              </View>
            </View>
            <Text style={rp.identMeta}>{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  Rapport généré par IA</Text>
          </View>
        </AnimUp>

        {/* ── S2 Score global ──────────────────────────────────── */}
        <AnimUp delay={60}>
          <View style={rp.scoreCard}>
            <Text style={rp.scoreCardTitle}>Score de réunion</Text>
            <Text style={[rp.bigScore, { color: reportData != null ? scoreStyle(reportData.score_global ?? 0).color : C.green }]}>{reportData?.score_global ?? 91}</Text>
            <Text style={rp.bigScoreSub}>/100</Text>
            <View style={rp.bars}>
              {scoreBars.map((b: any, i: number) => (
                <View key={i} style={rp.barRow}>
                  <Text style={rp.barLabel}>{b.label}</Text>
                  <View style={rp.barTrack}>
                    <Animated.View style={[rp.barFill, { backgroundColor: b.color, width: barAnims[i] ? barAnims[i].interpolate({ inputRange: [0,1], outputRange: ['0%', `${b.value}%`] }) : `${b.value}%` }]} />
                  </View>
                  <Text style={rp.barVal}>{b.display}</Text>
                </View>
              ))}
            </View>
          </View>
        </AnimUp>

        {/* ── S3 Besoins détectés ──────────────────────────────── */}
        <AnimUp delay={100}>
          <Text style={rp.secTitle}>Ce que veut le prospect</Text>
          <View style={rp.needsList}>
            {needs.map((n: string, i: number) => (
              <View key={i} style={rp.needRow}>
                <View style={rp.needDot} />
                <Text style={rp.needTxt}>{n}</Text>
              </View>
            ))}
          </View>
        </AnimUp>

        {/* ── S4 Recommandations ─────────────────────────────── */}
        <AnimUp delay={140}>
          <Text style={rp.secTitle}>Ce qu'on peut proposer</Text>
        </AnimUp>
        <AnimUp delay={160}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rp.recoList} style={{ marginHorizontal: -22 }}>
            <View style={{ width: 22 }} />
            {recos.map((c: any, i: number) => (
              <TouchableOpacity key={i} style={rp.recoCard} activeOpacity={0.85}>
                <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
                <Text style={rp.recoTitle}>{c.title}</Text>
                <Text style={rp.recoDesc}>{c.desc}</Text>
                <View style={rp.recoBadge}><Text style={rp.recoBadgeTxt}>Recommandé</Text></View>
              </TouchableOpacity>
            ))}
            <View style={{ width: 6 }} />
          </ScrollView>
        </AnimUp>

        {/* ── S5-A Signaux Détectés ─────────────────────────────── */}
        {reportData && (reportData.budget_detecte || reportData.deadline_detectee || reportData.decideurs_identifies?.length || reportData.mots_cles?.length) && (
          <AnimUp delay={190}>
            <Text style={rp.secTitle}>Signaux détectés</Text>
            <View style={{ backgroundColor: C.black, borderRadius: 14, padding: 18, marginBottom: 8 }}>
              {/* Budget */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>💰</Text>
                <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: '#AAA', marginRight: 6 }}>Budget</Text>
                <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: reportData.budget_detecte ? '#FFF' : '#555' }}>
                  {reportData.budget_detecte || 'Non mentionné'}
                </Text>
              </View>
              {/* Deadline */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>📅</Text>
                <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: '#AAA', marginRight: 6 }}>Deadline</Text>
                <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: reportData.deadline_detectee ? '#FFF' : '#555' }}>
                  {reportData.deadline_detectee || 'Non mentionnée'}
                </Text>
              </View>
              {/* Décideurs */}
              {Array.isArray(reportData.decideurs_identifies) && reportData.decideurs_identifies.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 16, marginRight: 8 }}>👥</Text>
                    <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: '#AAA' }}>Décideurs</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {reportData.decideurs_identifies.map((d: string, i: number) => (
                      <View key={i} style={{ backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: INTER_MD, fontSize: 11, color: C.black }}>{d}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {/* Mots-clés */}
              {Array.isArray(reportData.mots_cles) && reportData.mots_cles.length > 0 && (
                <View style={{ marginBottom: reportData.concurrents_mentionnes?.length ? 10 : 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 16, marginRight: 8 }}>🏷</Text>
                    <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: '#AAA' }}>Mots-clés</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {reportData.mots_cles.map((kw: string, i: number) => (
                        <View key={i} style={{ backgroundColor: '#2A2A2A', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ fontFamily: INTER, fontSize: 11, color: '#CCC' }}>{kw}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
              {/* Concurrents */}
              {Array.isArray(reportData.concurrents_mentionnes) && reportData.concurrents_mentionnes.length > 0 && (
                <View style={{ backgroundColor: '#3D0000', borderRadius: 8, padding: 10, marginTop: 4 }}>
                  <Text style={{ fontFamily: INTER_MD, fontSize: 12, color: '#FF6B6B' }}>
                    ⚠️ Concurrents : {reportData.concurrents_mentionnes.join(', ')}
                  </Text>
                </View>
              )}
            </View>
          </AnimUp>
        )}

        {/* ── S5-B Propositions Scénographie ───────────────────── */}
        {Array.isArray(reportData?.propositions_techniques) && reportData.propositions_techniques.length > 0 && (
          <AnimUp delay={210}>
            <Text style={rp.secTitle}>Ideas IA ✦</Text>
            {reportData.propositions_techniques.map((prop: any, i: number) => (
              <View key={i} style={{
                backgroundColor: C.white, borderRadius: 14, padding: 18,
                borderLeftWidth: 3, borderLeftColor: C.blue, marginBottom: 12,
                shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 22, marginRight: 10 }}>{prop.emoji || '🎨'}</Text>
                  <Text style={{ fontFamily: CLASH_MD, fontSize: 14, color: C.black, flex: 1 }}>{prop.titre}</Text>
                </View>
                <Text style={{ fontFamily: INTER, fontSize: 12, color: C.muted, lineHeight: 18, marginBottom: 12 }}>
                  {prop.description}
                </Text>
                {Array.isArray(prop.elements) && prop.elements.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {prop.elements.map((el: string, j: number) => (
                      <View key={j} style={{ backgroundColor: C.cream2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: INTER, fontSize: 11, color: C.muted }}>{el}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {prop.budget_estime && (
                  <View style={{ backgroundColor: C.blueBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: CLASH_MD, fontSize: 12, color: C.blue }}>
                      💶 {prop.budget_estime}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </AnimUp>
        )}

        {/* ── S5-C Email de suivi ───────────────────────────────── */}
        {reportData?.email_suivi && (
          <AnimUp delay={230}>
            <Text style={rp.secTitle}>Email de suivi</Text>
            <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 8 }}>
              <Text style={{ fontFamily: CLASH_MD, fontSize: 13, color: C.black, marginBottom: 10 }}>
                📧 {reportData.email_suivi.objet}
              </Text>
              <Text
                style={{ fontFamily: INTER, fontSize: 12, color: C.muted, lineHeight: 19, marginBottom: 12 }}
                numberOfLines={emailExpanded ? undefined : 3}
              >
                {reportData.email_suivi.corps}
              </Text>
              <TouchableOpacity onPress={() => setEmailExpanded(!emailExpanded)} style={{ marginBottom: 14 }}>
                <Text style={{ fontFamily: INTER_MD, fontSize: 12, color: C.blue }}>
                  {emailExpanded ? 'Réduire ↑' : 'Voir tout ↓'}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}
                  onPress={() => {
                    Clipboard.setString(`${reportData.email_suivi.objet}\n\n${reportData.email_suivi.corps}`);
                    Alert.alert('✓ Copié', 'Email copié dans le presse-papier');
                  }}
                >
                  <Text style={{ fontFamily: INTER_MD, fontSize: 13, color: C.black }}>📋 Copier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: C.blue, alignItems: 'center' }}
                  onPress={() => {
                    const subj = encodeURIComponent(reportData.email_suivi.objet || '');
                    const body = encodeURIComponent(reportData.email_suivi.corps || '');
                    Linking.openURL(`mailto:?subject=${subj}&body=${body}`);
                  }}
                >
                  <Text style={{ fontFamily: INTER_MD, fontSize: 13, color: '#FFF' }}>✉️ Envoyer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </AnimUp>
        )}

        {/* ── S5-D Enregistrement Audio ─────────────────────────── */}
        <AnimUp delay={250}>
          <Text style={rp.secTitle}>Enregistrement</Text>
          <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity
                onPress={reportData?.audio_url ? toggleAudio : undefined}
                style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: reportData?.audio_url ? C.black : C.cream2,
                  alignItems: 'center', justifyContent: 'center',
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 20 }}>{isPlaying ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={{ height: 4, backgroundColor: C.cream2, borderRadius: 2, marginBottom: 6 }}>
                  <View style={{
                    height: 4, borderRadius: 2, backgroundColor: reportData?.audio_url ? C.blue : C.cream2,
                    width: audioDurationMs > 0 ? `${(audioPosition / audioDurationMs) * 100}%` : '0%',
                  }} />
                </View>
                <Text style={{ fontFamily: INTER, fontSize: 11, color: C.muted }}>
                  {reportData?.audio_url
                    ? `${fmtMs(audioPosition)} / ${fmtMs(audioDurationMs || 0)}`
                    : 'Aucun enregistrement disponible'}
                </Text>
              </View>
            </View>
          </View>
        </AnimUp>

        {/* ── S5 Plan d'action ─────────────────────────────────── */}
        <AnimUp delay={180}>
          <Text style={rp.secTitle}>Prochaines étapes</Text>
          <View style={rp.actionList}>
            {plan.map((a: string, i: number) => (
              <View key={i} style={rp.actionRow}>
                <View style={rp.actionNum}><Text style={rp.actionNumTxt}>{i + 1}</Text></View>
                <Text style={rp.actionTxt}>{a}</Text>
              </View>
            ))}
          </View>
        </AnimUp>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Fixed CTA above bottom nav */}
      <View style={rp.ctaWrapper}>
        <TouchableOpacity style={rp.ctaBtn} activeOpacity={0.85} onPress={onNavigateMessages}>
          <Text style={rp.ctaBtnTxt}>Générer le message prospect →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROSPECTION SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
type OppCat = 'salon' | 'anniv' | 'auto';
type OppSt  = 'NOUVEAU' | 'URGENT' | 'EN COURS' | 'ENVOYÉ' | 'À CONTACTER';
type OppQualif = 'Non qualifié' | 'À contacter' | 'Qualifié chaud' | 'Qualifié froid' | 'Non pertinent';

interface Opp { 
  id?: string; 
  emoji: string; 
  emojiBg: string; 
  name: string; 
  detail: string; 
  cat: OppCat; 
  status: OppSt; 
  contact?: string; 
  contact_data?: any; 
  qualification: OppQualif;
  score_pertinence: number;
  created_at?: string;
}

const QUALIF_STYLE: Record<OppQualif, { bg: string; color: string; fill: string }> = {
  'Non qualifié':   { bg: C.cream2,   color: C.muted,  fill: C.border },
  'À contacter':    { bg: C.blueBg,   color: C.blue,   fill: C.blue   },
  'Qualifié chaud': { bg: C.redBg,    color: C.red,    fill: C.red    },
  'Qualifié froid': { bg: '#E0F2FE',  color: '#0284C7',fill: '#0284C7'},
  'Non pertinent':  { bg: '#F3F4F6',  color: '#9CA3AF',fill: '#9CA3AF'} // barré handled in UI
};

const OPP_ST: Record<OppSt, { bg: string; color: string; label: string }> = {
  'NOUVEAU':     { bg: C.blueBg,   color: C.blue,   label: 'Nouveau'      },
  'URGENT':      { bg: C.redBg,    color: C.red,    label: 'Urgent'       },
  'EN COURS':    { bg: C.orangeBg, color: C.orange, label: 'En cours'     },
  'ENVOYÉ':      { bg: C.greenBg,  color: C.green,  label: 'Envoyé'       },
  'À CONTACTER': { bg: C.cream2,   color: C.muted,  label: 'À contacter'  },
};
const FILTERS = ['Tous', 'Non qualifiés', 'Chaud', 'Salons', 'Anniversaires', 'Auto'];

// Calculates days to next Monday
function getNextMondayLabel() {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  const day = d.getDate();
  const months = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  return `Lundi ${day} ${months[d.getMonth()]}`;
}

const getStartOfWeek = () => {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  const day = d.getDay() || 7;
  if (day !== 1) d.setHours(-24 * (day - 1));
  return d;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function SwipeQualificationView({ opps, onClose, onQualify }: { opps: Opp[], onClose: () => void, onQualify: (id: string, q: OppQualif) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;
  
  const currentOpp = opps[currentIndex];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        position.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 120) {
          Animated.spring(position, { toValue: { x: SCREEN_WIDTH + 100, y: gestureState.dy }, useNativeDriver: false }).start(() => {
            onQualify(currentOpp.id!, 'À contacter');
            nextCard();
          });
        } else if (gestureState.dx < -120) {
          Animated.spring(position, { toValue: { x: -SCREEN_WIDTH - 100, y: gestureState.dy }, useNativeDriver: false }).start(() => {
            onQualify(currentOpp.id!, 'Non pertinent');
            nextCard();
          });
        } else if (gestureState.dy < -120) {
          Animated.spring(position, { toValue: { x: gestureState.dx, y: -SCREEN_HEIGHT - 100 }, useNativeDriver: false }).start(() => {
            onQualify(currentOpp.id!, 'Qualifié chaud');
            nextCard();
          });
        } else {
          Animated.spring(position, { toValue: { x: 0, y: 0 }, friction: 4, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  const nextCard = () => {
    setCurrentIndex(prev => prev + 1);
    position.setValue({ x: 0, y: 0 });
  };

  if (currentIndex >= opps.length) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.cream, justifyContent: 'center', alignItems: 'center', zIndex: 1000 }]}>
        <Text style={{ fontFamily: CLASH_MD, fontSize: 24, marginBottom: 20 }}>Tout est qualifié ! 🎉</Text>
        <TouchableOpacity style={{ backgroundColor: C.black, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }} onPress={onClose}>
          <Text style={{ color: C.white, fontFamily: INTER_MD, fontSize: 16 }}>Retour au radar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rotate = position.x.interpolate({ inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2], outputRange: ['-10deg', '0deg', '10deg'], extrapolate: 'clamp' });
  const likeOpacity = position.x.interpolate({ inputRange: [0, SCREEN_WIDTH / 4], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = position.x.interpolate({ inputRange: [-SCREEN_WIDTH / 4, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const hotOpacity = position.y.interpolate({ inputRange: [-SCREEN_HEIGHT / 4, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, justifyContent: 'center', alignItems: 'center' }]}>
      <TouchableOpacity style={{ position: 'absolute', top: 60, right: 24, width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Text style={{ color: C.white, fontSize: 20, fontWeight: 'bold' }}>✕</Text>
      </TouchableOpacity>
      <Text style={{ position: 'absolute', top: 65, left: 24, color: C.white, fontFamily: INTER_MD, fontSize: 14 }}>{opps.length - currentIndex} restants à qualifier</Text>
      
      <Animated.View
        {...panResponder.panHandlers}
        style={[ { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }, { width: SCREEN_WIDTH - 48, backgroundColor: C.white, borderRadius: 24, padding: 24, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 } ]}
      >
        <Animated.View style={{ position: 'absolute', top: 30, left: 30, zIndex: 10, opacity: likeOpacity, transform: [{ rotate: '-15deg' }] }}>
          <Text style={{ borderWidth: 4, borderColor: C.green, color: C.green, fontSize: 32, fontWeight: '800', padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.8)' }}>À CONTACTER</Text>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', top: 30, right: 30, zIndex: 10, opacity: nopeOpacity, transform: [{ rotate: '15deg' }] }}>
          <Text style={{ borderWidth: 4, borderColor: C.red, color: C.red, fontSize: 32, fontWeight: '800', padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.8)' }}>NON</Text>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', top: 100, alignSelf: 'center', zIndex: 10, opacity: hotOpacity }}>
          <Text style={{ borderWidth: 4, borderColor: C.orange, color: C.orange, fontSize: 32, fontWeight: '800', padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.8)' }}>CHAUD 🔥</Text>
        </Animated.View>

        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: currentOpp.emojiBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 40 }}>{currentOpp.emoji}</Text>
          </View>
          <Text style={{ fontFamily: CLASH, fontSize: 28, textAlign: 'center', marginBottom: 8 }}>{currentOpp.name}</Text>
          <Text style={{ fontFamily: INTER_MD, fontSize: 16, color: C.muted, textAlign: 'center', marginBottom: 16 }}>{currentOpp.detail}</Text>
          
          {currentOpp.score_pertinence > 0 && (
            <View style={{ backgroundColor: scoreStyle(currentOpp.score_pertinence).bg, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24 }}>
              <Text style={{ fontFamily: INTER_MD, fontSize: 16, color: scoreStyle(currentOpp.score_pertinence).color }}>Score IA : {currentOpp.score_pertinence}/100</Text>
            </View>
          )}

          {currentOpp.contact && (
            <View style={{ width: '100%', backgroundColor: C.cream, padding: 16, borderRadius: 12 }}>
              <Text style={{ fontFamily: INTER_MD, fontSize: 12, color: C.muted, marginBottom: 4, textTransform: 'uppercase' }}>Contact détecté</Text>
              <Text style={{ fontFamily: CLASH_MD, fontSize: 18 }}>{currentOpp.contact}</Text>
            </View>
          )}
        </View>
      </Animated.View>
      
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 40 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>❌</Text>
        </View>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>🔥</Text>
        </View>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>✅</Text>
        </View>
      </View>
    </View>
  );
}

function ProspectionScreen({ topPad, onSelectOpp, view, setView }: { topPad: number; onSelectOpp: (opp: Opp) => void; view: 'crm'|'radar'|'archives'; setView: (v:'crm'|'radar'|'archives')=>void }) {
  const [activeFilter, setActiveFilter] = useState('Tous');
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSwipe, setShowSwipe] = useState(false);

  useEffect(() => {
    async function loadOpps() {
      try {
        const { data, error } = await supabase.from('opportunites').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        let shouldRefresh = false;
        if (!data || data.length === 0) {
          shouldRefresh = true;
        } else {
          const latest = new Date(data[0].created_at).getTime();
          const now = new Date().getTime();
          if (now - latest > 24 * 60 * 60 * 1000) {
            shouldRefresh = true;
          }
        }
        
        if (shouldRefresh) {
          setRefreshing(true);
          await supabase.functions.invoke('refresh-opportunites');
          const res = await supabase.from('opportunites').select('*').order('created_at', { ascending: false });
          if (res.data) formatAndSetOpps(res.data);
        } else {
          formatAndSetOpps(data);
        }
      } catch (err: any) {
        console.warn('Error loadOpps:', err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
    loadOpps();
  }, []);

  const formatAndSetOpps = (dbData: any[]) => {
    const formatted: Opp[] = dbData.map(o => {
      let cat: OppCat = 'auto';
      let emoji = '🚗';
      let emojiBg = C.greenBg;
      
      if (o.type === 'salon') {
        cat = 'salon';
        emoji = '🏛';
        emojiBg = C.blueBg;
      } else if (o.type === 'anniversaire') {
        cat = 'anniv';
        emoji = '🎂';
        emojiBg = C.orangeBg;
      }

      let contactName = undefined;
      // Extract main contact if present
      if (o.contact_data && o.contact_data[0]) {
        contactName = `${o.contact_data[0].prenom} ${o.contact_data[0].nom}`;
      }

      return {
        id: o.id,
        name: o.nom,
        detail: o.detail,
        cat,
        emoji,
        emojiBg,
        status: o.status || 'NOUVEAU',
        contact: contactName,
        contact_data: o.contact_data,
        qualification: o.qualification || 'Non qualifié',
        score_pertinence: o.score_pertinence || 0,
        created_at: o.created_at
      };
    });
    setOpps(formatted);
  };

  const qualOrder: Record<string, number> = {
    'Qualifié chaud': 0,
    'À contacter': 1,
    'Qualifié froid': 2,
    'Non qualifié': 3,
    'Non pertinent': 4
  };

  const startOfWeek = getStartOfWeek().getTime();
  
  const thisWeekOpps = opps.filter(o => o.created_at && new Date(o.created_at).getTime() >= startOfWeek);
  
  const nbSalons = thisWeekOpps.filter(o => o.cat === 'salon').length;
  const nbAnnivs = thisWeekOpps.filter(o => o.cat === 'anniv').length;
  const nbAuto = thisWeekOpps.filter(o => o.cat === 'auto').length;
  const nbQualifs = thisWeekOpps.filter(o => o.qualification !== 'Non qualifié').length;
  const totalOppsThisWeek = 20; // Hard limit per week
  const nextUpdateLabel = getNextMondayLabel();

  const handleRestore = async (opp: Opp) => {
    if (opp.id) {
      await supabase.from('opportunites').update({ qualification: 'Non qualifié' }).eq('id', opp.id);
      setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, qualification: 'Non qualifié' } : o));
    }
  };

  const filtered = (
    view === 'archives' ? opps.filter(o => o.qualification === 'Non pertinent') :
    activeFilter === 'Salons'          ? opps.filter(o => o.cat === 'salon' && o.qualification !== 'Non pertinent')
    : activeFilter === 'Anniversaires' ? opps.filter(o => o.cat === 'anniv' && o.qualification !== 'Non pertinent')
    : activeFilter === 'Auto'          ? opps.filter(o => o.cat === 'auto' && o.qualification !== 'Non pertinent')
    : activeFilter === 'Chaud'         ? opps.filter(o => o.qualification === 'Qualifié chaud')
    : activeFilter === 'Non qualifiés' ? opps.filter(o => o.qualification === 'Non qualifié')
    : opps.filter(o => o.qualification !== 'Non pertinent')
  ).sort((a, b) => qualOrder[a.qualification] - qualOrder[b.qualification]);

  return (
    <View style={[pp.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={pp.header}>
        <View>
          <Text style={pp.headerTitle}>Prospection</Text>
          <Text style={pp.headerSub}>Détection automatique en temps réel</Text>
        </View>
        <View style={pp.livePill}>
          {loading || refreshing ? (
             <ActivityIndicator color={C.green} size="small" />
          ) : <PulseDot color={C.green} />}
          <Text style={pp.liveTxt}>{refreshing ? 'Mise à jour...' : 'Live'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 22, marginBottom: 16 }}>
        <TouchableOpacity style={[ds.tab, {flex: 1, alignItems: 'center'}, view === 'crm' ? ds.tabOn : ds.tabOff]} onPress={() => setView('crm')}><Text style={[ds.tabTxt, view === 'crm' ? ds.tabTxtOn : ds.tabTxtOff]}>CRM</Text></TouchableOpacity>
        <TouchableOpacity style={[ds.tab, {flex: 1, alignItems: 'center'}, view === 'radar' ? ds.tabOn : ds.tabOff]} onPress={() => setView('radar')}><Text style={[ds.tabTxt, view === 'radar' ? ds.tabTxtOn : ds.tabTxtOff]}>Radar</Text></TouchableOpacity>
        <TouchableOpacity style={[ds.tab, {flex: 1, alignItems: 'center'}, view === 'archives' ? ds.tabOn : ds.tabOff]} onPress={() => setView('archives')}><Text style={[ds.tabTxt, view === 'archives' ? ds.tabTxtOn : ds.tabTxtOff]}>Archives</Text></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pp.scroll}>
        
        {/* Weekly Dashboard Start */}
        <AnimUp delay={0}>
          <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontFamily: CLASH_MD, fontSize: 16, color: C.black }}>Semaine courante</Text>
              <Text style={{ fontFamily: INTER_MD, fontSize: 12, color: C.muted }}>Prochaine maj: {nextUpdateLabel}</Text>
            </View>
            <Text style={{ fontFamily: INTER, fontSize: 13, color: C.black, marginBottom: 8 }}>
              {nbQualifs} opportunités qualifiées sur {totalOppsThisWeek} détectées
            </Text>
            <View style={{ height: 6, backgroundColor: C.cream2, borderRadius: 3, marginBottom: 16 }}>
              <View style={{ height: '100%', backgroundColor: C.green, borderRadius: 3, width: `${(nbQualifs / totalOppsThisWeek) * 100}%` }} />
            </View>
            <TouchableOpacity style={{ backgroundColor: C.black, borderRadius: 8, paddingVertical: 12, alignItems: 'center' }} onPress={() => setShowSwipe(true)}>
              <Text style={{ fontFamily: INTER_MD, fontSize: 13, color: C.white }}>Tout qualifier (Mode Swipe)</Text>
            </TouchableOpacity>
          </View>
        </AnimUp>

        {/* Counters */}
        <AnimUp delay={20}>
          <View style={pp.counters}>
            {[
              { emoji: '🏛', val: nbSalons.toString(), label: 'Salons',         blue: true  },
              { emoji: '🎂', val: nbAnnivs.toString(), label: 'Anniversaires',  blue: false },
              { emoji: '🚗', val: nbAuto.toString(), label: 'Lancements Auto', blue: false },
            ].map((c, i) => (
              <View key={i} style={pp.counterCard}>
                <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
                <Text style={[pp.counterVal, c.blue && { color: C.blue }]}>{c.val}</Text>
                <Text style={pp.counterLbl}>{c.label}</Text>
              </View>
            ))}
          </View>
        </AnimUp>

        {/* Filter pills */}
        <AnimUp delay={40}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pp.filterList} style={{ marginHorizontal: -22 }}>
            <View style={{ width: 22 }} />
            {FILTERS.map(f => (
              <TouchableOpacity key={f} style={[pp.filterPill, activeFilter === f && pp.filterPillOn]} onPress={() => setActiveFilter(f)} activeOpacity={0.8}>
                <Text style={[pp.filterTxt, activeFilter === f && pp.filterTxtOn]}>{f}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ width: 6 }} />
          </ScrollView>
        </AnimUp>

        {/* Opportunities list */}
        <AnimUp delay={80}>
          <View style={pp.secHead}>
            <Text style={pp.secTitle}>Opportunités détectées</Text>
            <Text style={pp.secCount}>({opps.length})</Text>
          </View>
        </AnimUp>

        <View style={pp.oppList}>
          {loading && opps.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.blue} />
          ) : (
            filtered.map((opp, i) => {
              const qStyle = QUALIF_STYLE[opp.qualification];
              const isStrike = opp.qualification === 'Non pertinent';
              const pScore = opp.score_pertinence || 0;
              const pStyle = scoreStyle(pScore);
              
              return (
                <AnimUp key={i} delay={100 + i * 40}>
                  <TouchableOpacity style={[pp.oppCard, isStrike && { opacity: 0.6 }]} activeOpacity={0.85} onPress={() => onSelectOpp(opp)}>
                    <View style={pp.oppRow}>
                      <View style={[pp.oppIcon, { backgroundColor: opp.emojiBg }]}>
                        <Text style={{ fontSize: 16 }}>{opp.emoji}</Text>
                      </View>
                      <View style={pp.oppInfo}>
                        <View style={pp.oppTopRow}>
                          <Text style={[pp.oppName, isStrike && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{opp.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {pScore > 0 && (
                              <View style={[pp.oppBadge, { backgroundColor: pStyle.bg }]}>
                                <Text style={[pp.oppBadgeTxt, { color: pStyle.color }]}>IA {pScore}</Text>
                              </View>
                            )}
                            <View style={[pp.oppBadge, { backgroundColor: qStyle.bg }]}>
                              <Text style={[pp.oppBadgeTxt, { color: qStyle.color }]}>{opp.qualification}</Text>
                            </View>
                          </View>
                        </View>
                        <Text style={pp.oppDetail}>{opp.detail}</Text>
                        {opp.contact ? (
                          <View style={pp.contactRow}>
                            <View style={pp.contactPill}><Text style={pp.contactPillTxt}>Contact trouvé</Text></View>
                            <Text style={pp.contactName}>{opp.contact}</Text>
                          </View>
                        ) : (
                          <View style={pp.searchPill}><Text style={pp.searchTxt}>Recherche auto en filigrane...</Text></View>
                        )}
                        {view === 'archives' && (
                          <TouchableOpacity 
                            style={{ alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.cream2, borderRadius: 8 }}
                            onPress={() => handleRestore(opp)}
                          >
                            <Text style={{ fontFamily: INTER_MD, fontSize: 12, color: C.black }}>Restaurer l'opportunité 📦</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={pp.chev}>›</Text>
                    </View>
                  </TouchableOpacity>
                </AnimUp>
              );
            })
          )}
        </View>

        {/* Relance du jour */}
        <AnimUp delay={200}>
          <View style={pp.relanceCard}>
            <Text style={pp.relanceTitle}>Relance du jour</Text>
            <View style={pp.relanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={pp.relanceName}>Marie Dupont · Salon Space 2026</Text>
                <Text style={pp.relanceMsg}>Suite à notre échange, voici nos références stands auto...</Text>
              </View>
              <TouchableOpacity style={pp.relanceBtn} activeOpacity={0.85}>
                <Text style={pp.relanceBtnTxt}>Envoyer →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AnimUp>

        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={showSwipe} animationType="slide" transparent>
        <SwipeQualificationView 
          opps={opps.filter(o => o.qualification === 'Non qualifié')} 
          onClose={() => setShowSwipe(false)} 
          onQualify={async (id, qualif) => {
            setOpps(prev => prev.map(o => o.id === id ? { ...o, qualification: qualif } : o));
            await supabase.from('opportunites').update({ qualification: qualif }).eq('id', id);
          }} 
        />
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEWS
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// OPP DETAIL SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const MSG_TYPES = ['Prospect froid', 'Connaissance', 'Client', 'Devis en cours'];
const CONTACT_ROLES: Record<string, string> = {
  'Marie Dupont': 'Directrice Marketing — Coopérative Terrena',
  'Paul Martin':  'Responsable Communication — Sojasun',
  'Sophie Chen':  'Event Manager — Viva Technology',
  'Luc Bernard':  'Chef de Projet — Groupama',
  'Alex Petit':   'Brand Manager — Renault France',
};
const WHY: Record<OppCat, string> = {
  salon: 'Ce salon rassemble les leaders du secteur. Les exposants investissent massivement dans leurs stands pour se démarquer. Scénographie France a déjà collaboré avec 3 exposants de cet événement.',
  anniv: 'Les anniversaires d\'entreprise génèrent des investissements événementiels importants. C\'est le moment idéal pour proposer une révélation marquante et mémorable.',
  auto:  'Les lancements véhicules sont des opportunités majeures. Les constructeurs cherchent des dispositifs immersifs pour créer l\'effet waouh lors de la révélation officielle.',
};

function OppDetailScreen({ opp, onBack, onNavigateMessages, topPad }: { opp: Opp; onBack: () => void; onNavigateMessages: () => void; topPad: number }) {
  const [contactData, setContactData] = useState<any>(opp.contact_data ? opp.contact_data[0] : null);
  const [loadingContact, setLoadingContact] = useState<boolean>(!!(!opp.contact_data && opp.id));
  const [generatedMessage, setGeneratedMessage] = useState<string | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [qualification, setQualification] = useState<OppQualif>(opp.qualification || 'Non qualifié');
  const [searchTimeout, setSearchTimeout] = useState(false);

  const relAnim = useRef(new Animated.Value(0)).current;

  const getOrgName = (name: string, cat: string) => {
    if (cat === 'anniv') return name.split(' — ')[0]?.trim() || name;
    // For salons like "Viva Technology", we want the full name, not just the first word
    // But for salons like "SIAL Paris", maybe just "SIAL"
    // Let's try to be smart: if it's a known short name keep it, otherwise take first 2 words or whole name
    const parts = name.split(' ');
    if (parts.length > 1 && parts[1].length > 3) return parts.slice(0, 2).join(' ');
    return parts[0];
  };

  const updateQualif = async (q: OppQualif) => {
    setQualification(q);
    if (opp.id) {
      await supabase.from('opportunites').update({ qualification: q }).eq('id', opp.id);
    }
  };

  // Search contact on load if missing, and generate AI message
  useEffect(() => {
    async function init() {
      let currentContact = contactData;

      // 1. Fetch Contact — LinkedIn scraper first, Apollo fallback
      if (!currentContact && opp.id) {
        setLoadingContact(true);
        try {
          const orgName = getOrgName(opp.name, opp.cat);

          // ── Passe 1 : Scraper LinkedIn (Railway) ──────────────────
          let contacts: any[] = [];
          try {
            const { data: liData } = await supabase.functions.invoke('scrape-linkedin-contacts', {
              body: { organizationName: orgName }
            });
            if (liData?.contacts?.length > 0) contacts = liData.contacts;
          } catch (liErr: any) {
            console.warn('LinkedIn scraper error:', liErr.message);
          }

          // ── Passe 2 : Apollo fallback si LinkedIn vide ────────────
          if (contacts.length === 0) {
            console.log('LinkedIn empty → trying Apollo for:', orgName);
            try {
              const { data: apData } = await supabase.functions.invoke('search-contact', {
                body: { organizationName: orgName }
              });
              if (apData?.contacts?.length > 0) {
                // Apollo retourne { prenom, nom } ou { nom } — normalise
                contacts = apData.contacts.map((c: any) => ({
                  nom: c.nom || `${c.prenom ?? ''} ${c.last_name ?? ''}`.trim() || c.name || '',
                  titre: c.titre || c.title || '',
                  email: c.email || null,
                  linkedin_url: c.linkedin_url || null,
                }));
              }
            } catch (apErr: any) {
              console.warn('Apollo error:', apErr.message);
            }
          }

          if (contacts.length > 0) {
            currentContact = contacts[0];
            setContactData(currentContact);
            // Cache en DB
            await supabase.from('opportunites').update({ contact_data: contacts }).eq('id', opp.id);
          } else {
            // Aucune source n'a trouvé → URLs de recherche manuelle
            setContactData(null);
          }
        } catch (e: any) {
          console.warn('Contact fetch error:', e.message);
          setContactData(null);
        } finally {
          setLoadingContact(false);
        }
      }

      // 2. Generate Msg
      if (currentContact) {
        setGeneratingMsg(true);
        try {
          const getTone = (q: OppQualif) => {
            if (q === 'Qualifié chaud') return 'urgent, très direct, orienté sur une action immédiate';
            if (q === 'À contacter') return 'chaleureux, informatif, propose un premier échange';
            return 'léger, très court, non-intrusif';
          };
          const contactName = currentContact.nom || `${currentContact.prenom ?? ''} ${currentContact.nom ?? ''}`.trim() || 'le/la responsable';
          const prompt = `Génère un message de prospection pour ${contactName} de ${opp.name} en tant que commercial de Scénographie France. Contexte : ${opp.detail}. Ton requis : ${getTone(qualification)}. Maximum 5 lignes.`;
          // const aiRes = await supabase.functions.invoke('analyse-reunion', { body: { transcription: prompt, mode: 'message' } });
          const aiRes = { data: { message: "Message désactivé dans App.tsx (Legacy)" }, error: null };
          if (aiRes.data?.message) {
            setGeneratedMessage(aiRes.data.message);
          }
        } catch (e: any) {
          console.warn('AI Message error:', e.message);
        } finally {
          setGeneratingMsg(false);
        }
      }
    }
    
    init();
  }, [opp.id, qualification]);

  useEffect(() => {
    Animated.timing(relAnim, { toValue: 0.94, duration: 900, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, []);
  
  const st       = OPP_ST[opp.status];
  const displayContact = contactData?.nom ? contactData.nom : opp.contact;
  const initials = (displayContact ?? 'MD').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const role     = contactData ? contactData.titre : (opp.contact ? (CONTACT_ROLES[opp.contact] ?? 'Responsable Marketing') : null);
  const parts    = opp.detail.split('·');
  const d1       = parts[0]?.trim() ?? 'Sept 2026';
  const d2       = parts[1]?.trim() ?? 'France';

  const QUALIFS: OppQualif[] = ['Non qualifié', 'À contacter', 'Qualifié chaud', 'Qualifié froid', 'Non pertinent'];

  return (
    <View style={[od.container, { paddingTop: topPad }]}>
      <View style={od.header}>
        <TouchableOpacity style={od.hBtn} onPress={onBack}><Text style={od.hBack}>←</Text></TouchableOpacity>
        <Text style={od.hTitle}>Opportunité</Text>
        <TouchableOpacity style={od.hBtn}><Text style={{ fontSize: 15 }}>🔖</Text></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={od.scroll}>
        <AnimUp delay={0}>
          <View style={od.identCard}>
            
            {/* Qualification Selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
               {QUALIFS.map(q => {
                 const isActive = qualification === q;
                 const qStyle = QUALIF_STYLE[q];
                 return (
                   <TouchableOpacity 
                     key={q} 
                     style={[
                       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
                       isActive && { backgroundColor: qStyle.bg, borderColor: qStyle.color }
                     ]}
                     onPress={() => updateQualif(q)}
                   >
                     <Text style={[{ fontFamily: INTER_MD, fontSize: 12, color: C.muted }, isActive && { color: qStyle.color }, q === 'Non pertinent' && { textDecorationLine: 'line-through' }]}>
                       {q}
                     </Text>
                   </TouchableOpacity>
                 )
               })}
            </ScrollView>

            <View style={od.identTop}>
              <View style={[od.identIcon, { backgroundColor: opp.emojiBg }]}><Text style={{ fontSize: 22 }}>{opp.emoji}</Text></View>
              {/* Note: We keep status for backward compatibility styling, but focus is on qualification now */}
              <View style={[od.pill, { backgroundColor: QUALIF_STYLE[qualification].bg }]}><Text style={[od.pillTxt, { color: QUALIF_STYLE[qualification].color }]}>{qualification}</Text></View>
            </View>
            <Text style={[od.identTitle, qualification === 'Non pertinent' && { textDecorationLine: 'line-through' }]}>{opp.name}</Text>
            <Text style={od.identSub}>{opp.detail}</Text>
            <View style={od.sep} />
            <View style={od.statsRow}>
              {opp.cat === 'anniv' ? (
                <>
                  <View style={od.stat}>
                    <Text style={od.statVal}>{(() => {
                      const yr = opp.detail.match(/(\d{4})/)?.[0];
                      if(!yr) return 'Dans';
                      return new Date().getFullYear() === parseInt(yr) ? 'Cette année' : `En ${yr}`;
                    })()}</Text>
                    <Text style={od.statLbl}>Échéance</Text>
                  </View>
                  <View style={od.stat}>
                    <Text style={od.statVal}>{opp.detail.includes('40') ? '40 ans' : (opp.detail.includes('20') ? '20 ans' : '15 ans')}</Text>
                    <Text style={od.statLbl}>Événement</Text>
                  </View>
                  <View style={od.stat}>
                    <Text style={od.statVal}>National</Text>
                    <Text style={od.statLbl}>Portée</Text>
                  </View>
                </>
              ) : opp.cat === 'salon' ? (
                <>
                  <View style={od.stat}>
                    <Text style={od.statVal}>{d1.split(' ').slice(0, -1).join(' ') || d1}</Text>
                    <Text style={od.statLbl}>{d1.split(' ').slice(-1) || 'Date'}</Text>
                  </View>
                  <View style={od.stat}>
                    <Text style={od.statVal} numberOfLines={1} adjustsFontSizeToFit>{d2}</Text>
                    <Text style={od.statLbl}>Lieu</Text>
                  </View>
                  <View style={od.stat}>
                    <Text style={od.statVal}>800+</Text>
                    <Text style={od.statLbl}>Exposants</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={od.stat}>
                    <Text style={od.statVal}>{d1}</Text>
                    <Text style={od.statLbl}>Date</Text>
                  </View>
                  <View style={od.stat}>
                    <Text style={od.statVal} numberOfLines={1} adjustsFontSizeToFit>{d2}</Text>
                    <Text style={od.statLbl}>Lieu/Marque</Text>
                  </View>
                  <View style={od.stat}>
                    <Text style={od.statVal}>Majeur</Text>
                    <Text style={od.statLbl}>Impact</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </AnimUp>

        <AnimUp delay={60}>
          <Text style={od.secTitle}>Pourquoi maintenant</Text>
          <View style={od.whyCard}>
            <View style={od.whyRow}>
              <Text style={{ fontSize: 17 }}>💡</Text>
              <Text style={od.whyTxt}>{WHY[opp.cat]}</Text>
            </View>
            <Text style={od.whyTag}>Signal détecté le 09 Mars 2026</Text>
          </View>
        </AnimUp>

        {opp && (
          <AnimUp delay={100}>
            <Text style={od.secTitle}>Contact trouvé</Text>
            <View style={od.contactCard}>
              {loadingContact ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator color={C.blue} />
                  <Text style={{ marginTop: 10, color: C.muted, fontFamily: INTER, fontSize: 13 }}>Recherche LinkedIn en cours...</Text>
                  {searchTimeout && (
                    <Text style={{ marginTop: 8, color: C.red, fontFamily: INTER, fontSize: 11 }}>Recherche longue... le scraper LinkedIn met du temps.</Text>
                  )}
                </View>
              ) : !contactData ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, marginBottom: 8 }}>🔍</Text>
                  <Text style={{ color: C.muted, fontFamily: INTER, fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
                    Aucun contact trouvé automatiquement pour "{getOrgName(opp.name, opp.cat)}"
                  </Text>
                  <TouchableOpacity 
                    style={{ backgroundColor: C.blue, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
                    onPress={() => {
                      const query = encodeURIComponent(`${getOrgName(opp.name, opp.cat)} directeur communication`);
                      Linking.openURL(`https://www.linkedin.com/search/results/people/?keywords=${query}`);
                    }}
                  >
                    <Text style={{ color: C.white, fontFamily: CLASH, fontSize: 13 }}>Rechercher sur LinkedIn</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={od.contactRow}>
                    <View style={od.avatar}><Text style={od.avatarTxt}>{initials}</Text></View>
                    <View>
                      <Text style={od.cName}>{displayContact}</Text>
                      <Text style={od.cRole}>{role}</Text>
                    </View>
                  </View>
                  <View style={od.cSep} />
                  <View style={od.actionRow}>
                    <TouchableOpacity 
                      style={[od.actionBtn, { backgroundColor: C.blueBg, opacity: contactData?.linkedin_url ? 1 : 0.5 }]} 
                      activeOpacity={0.8}
                      onPress={() => contactData?.linkedin_url && Linking.openURL(contactData.linkedin_url)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>in</Text>
                      <Text style={[od.actionTxt, { color: C.blue }]}>LinkedIn</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[od.actionBtn, { backgroundColor: C.cream, opacity: contactData?.email ? 1 : 0.5 }]} 
                      activeOpacity={0.8}
                      onPress={() => {
                        if (contactData?.email) {
                          Linking.openURL(`mailto:${contactData.email}`);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 12 }}>✉️</Text>
                      <Text style={od.actionTxt}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[od.actionBtn, { backgroundColor: C.greenBg }]} activeOpacity={0.8}>
                      <Text style={{ fontSize: 12 }}>📞</Text>
                      <Text style={[od.actionTxt, { color: C.green }]}>Appeler</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={od.relRow}>
                    <Text style={od.relLbl}>Fiabilité contact</Text>
                    <Text style={[od.relLbl, { color: C.blue }]}>94%</Text>
                  </View>
                  <View style={od.relTrack}>
                    <Animated.View style={[od.relFill, { width: relAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }]} />
                  </View>
                </>
              )}
            </View>
          </AnimUp>
        )}

        <AnimUp delay={140}>
          <Text style={od.secTitle}>Message IA prêt</Text>
          <View style={[od.msgCard, { marginTop: 12 }]}>
            {generatingMsg ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator color={C.blue} />
                <Text style={{ marginTop: 10, color: C.muted, fontFamily: INTER, fontSize: 13 }}>Création automatique selon la qualification...</Text>
              </View>
            ) : (
              <Text style={od.msgTxt}>{generatedMessage || "Message en attente de génération..."}</Text>
            )}
            {!generatingMsg && <TouchableOpacity style={od.editBtn}><Text style={od.editTxt}>✏  Modifier</Text></TouchableOpacity>}
          </View>
        </AnimUp>

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={od.ctaWrap}>
        <TouchableOpacity style={od.ctaBtn} activeOpacity={0.85} onPress={onNavigateMessages}>
          <Text style={od.ctaTxt}>Envoyer le message →</Text>
        </TouchableOpacity>
        <View style={od.channels}>
          {([{ lbl: 'LinkedIn', color: C.blue, icon: 'in' }, { lbl: 'Email', color: C.black, icon: '✉' }, { lbl: 'SMS', color: C.green, icon: '💬' }] as {lbl:string;color:string;icon:string}[]).map((c, i) => (
            <TouchableOpacity key={i} style={od.channel} activeOpacity={0.7}>
              <Text style={{ fontSize: 13, color: c.color }}>{c.icon}</Text>
              <Text style={[od.channelTxt, { color: c.color }]}>{c.lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGES SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
type MsgStatus = 'À envoyer' | 'Envoyé' | 'En attente réponse' | 'Archivé';
type MsgChannel = 'LinkedIn' | 'Email' | 'SMS';
type MsgRel = 'Prospect froid' | 'Connaissance' | 'Client' | 'Devis en cours';
interface Msg {
  initials: string; name: string; avatarBg: string; avatarCol: string;
  channel: MsgChannel; rel: MsgRel; preview: string; status: MsgStatus; date: string;
}

const MSGS: Msg[] = [
  { initials: 'MD', name: 'Marie Dupont',   avatarBg: C.blueBg,   avatarCol: C.blue,   channel: 'LinkedIn', rel: 'Prospect froid', preview: "Bonjour Marie, j'ai vu que la Coopérative Terrena exposera au Salon Space...", status: 'À envoyer', date: 'Aujourd\'hui' },
  { initials: 'PM', name: 'Paul Martin',    avatarBg: C.greenBg,  avatarCol: C.green,  channel: 'Email',    rel: 'Prospect froid', preview: "Bonjour Paul, nous avons remarqué que Sojasun fêtera ses 30 ans en 2028...", status: 'À envoyer', date: 'Aujourd\'hui' },
  { initials: 'RF', name: 'Renault France', avatarBg: C.black,    avatarCol: C.white,  channel: 'Email',    rel: 'Client',         preview: "Bonjour, suite à notre réunion de mardi concernant la révélation Alpine A310...", status: 'En attente réponse', date: 'Hier' },
  { initials: 'SC', name: 'Sophie Chen',    avatarBg: C.orangeBg, avatarCol: C.orange, channel: 'LinkedIn', rel: 'Connaissance',   preview: "Bonjour Sophie, en voyant l'annonce de Viva Technology...", status: 'Envoyé', date: 'Lun. 06 Mars' },
  { initials: 'LB', name: 'Luc Bernard',    avatarBg: C.blueBg,   avatarCol: C.blue,   channel: 'Email',    rel: 'Client',         preview: "Bonjour Luc, je reviens vers vous concernant notre proposition pour l'événement Groupama...", status: 'Envoyé', date: 'Ven. 03 Mars' },
  { initials: 'AP', name: 'Alex Petit',     avatarBg: C.greenBg,  avatarCol: C.green,  channel: 'SMS',      rel: 'Devis en cours', preview: "Bonjour Alex, notre devis pour le stand Renault R5 Turbo...", status: 'En attente réponse', date: 'Jeu. 02 Mars' },
];

const MSG_FILTERS = ['Tous', 'À envoyer', 'Envoyés', 'En attente réponse', 'Archivés'];

function MessagesScreen({ topPad }: { topPad: number }) {
  const [activeFilter, setActiveFilter] = useState('Tous');

  const filtered = activeFilter === 'Tous' ? MSGS : MSGS.filter(m => {
    if (activeFilter === 'Envoyés') return m.status === 'Envoyé';
    return m.status === activeFilter;
  });

  return (
    <View style={[mm.container, { paddingTop: topPad }]}>
      <View style={mm.header}>
        <View>
          <Text style={mm.headerTitle}>Messages</Text>
          <Text style={mm.headerSub}>Brouillons générés par l'IA</Text>
        </View>
        <View style={mm.badge}>
          <Text style={mm.badgeTxt}>12</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={mm.scroll}>
        <AnimUp delay={0}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mm.filterList} style={{ marginHorizontal: -22 }}>
            <View style={{ width: 22 }} />
            {MSG_FILTERS.map(f => (
              <TouchableOpacity key={f} style={[mm.filterPill, activeFilter === f && mm.filterPillOn]} onPress={() => setActiveFilter(f)} activeOpacity={0.8}>
                <Text style={[mm.filterTxt, activeFilter === f && mm.filterTxtOn]}>{f}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ width: 6 }} />
          </ScrollView>
        </AnimUp>

        <View style={mm.msgList}>
          {filtered.map((m, i) => {
            let stColor = C.muted; let stBg = C.cream2;
            if (m.status === 'À envoyer') { stColor = C.blue; stBg = C.blueBg; }
            if (m.status === 'Envoyé') { stColor = C.green; stBg = C.greenBg; }
            if (m.status === 'En attente réponse') { stColor = C.orange; stBg = C.orangeBg; }

            return (
              <AnimUp key={i} delay={40 + i * 30}>
                <TouchableOpacity style={mm.card} activeOpacity={0.85}>
                  <View style={mm.row1}>
                    <View style={[mm.avatar, { backgroundColor: m.avatarBg }]}><Text style={[mm.avatarTxt, { color: m.avatarCol }]}>{m.initials}</Text></View>
                    <Text style={mm.name}>{m.name}</Text>
                    <Text style={mm.date}>{m.date}</Text>
                  </View>
                  <View style={mm.row2}>
                    <View style={mm.tagChan}><Text style={mm.tagChanTxt}>{m.channel}</Text></View>
                    <View style={mm.tagRel}><Text style={mm.tagRelTxt}>{m.rel}</Text></View>
                  </View>
                  <Text style={mm.preview} numberOfLines={2}>{m.preview}</Text>
                  <View style={mm.row4}>
                    <View style={{ flex: 1 }} />
                    <View style={[mm.statusBadge, { backgroundColor: stBg }]}>
                      <Text style={[mm.statusTxt, { color: stColor }]}>{m.status}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </AnimUp>
            );
          })}
        </View>

        <AnimUp delay={filtered.length * 30 + 80}>
          <View style={mm.statsCard}>
            <Text style={mm.statsTitle}>Cette semaine</Text>
            <View style={mm.statsRow}>
              <Text style={[mm.statItem, { color: C.green }]}>4 envoyés</Text>
              <Text style={[mm.statItem, { color: C.orange }]}>3 en attente</Text>
              <Text style={[mm.statItem, { color: C.blue }]}>2 réponses</Text>
            </View>
            <View style={mm.statsSep} />
            <Text style={mm.statsBot}>Taux de réponse estimé : 67%</Text>
          </View>
        </AnimUp>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// PROSPECTS CRM SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
type CrmStatus = 'À contacter' | 'Devis envoyé' | 'En négociation' | 'Client actif' | 'Perdu';
interface CrmOpp {
  initials: string; name: string; avatarBg: string; avatarCol: string; sector: string;
  contact: string; role: string; lastInt: string; status: CrmStatus; progress: number; progressCol: string;
}

const CRM_OPPS: CrmOpp[] = [
  { initials: 'RF', name: 'Renault France',   avatarBg: C.black,    avatarCol: C.white, sector: 'Auto',    contact: 'Alex Petit',   role: 'Resp. Événementiel', lastInt: 'Réunion hier',          status: 'Client actif',   progress: 100, progressCol: C.green },
  { initials: 'SD', name: 'Sojasun',          avatarBg: C.greenBg,  avatarCol: C.green, sector: 'Agro',    contact: 'Paul Martin',  role: 'Dir. Marketing',     lastInt: 'Opportunité détectée', status: 'À contacter',    progress: 15,  progressCol: C.red },
  { initials: 'WF', name: 'Westfield',        avatarBg: C.blueBg,   avatarCol: C.blue,  sector: 'Retail',  contact: 'Julie Moreau', role: 'Dir. Comm',          lastInt: 'Devis envoyé il y a 3j', status: 'Devis envoyé',   progress: 50,  progressCol: C.blue },
  { initials: 'GC', name: 'Groupe Convivio',  avatarBg: C.orangeBg, avatarCol: C.orange,sector: 'Restau',  contact: 'Marc Denis',   role: 'DG',                 lastInt: 'Réunion ven.',         status: 'En négociation', progress: 70,  progressCol: C.orange },
  { initials: 'DS', name: 'DS Automobiles',   avatarBg: C.black,    avatarCol: C.white, sector: 'Auto',    contact: 'Claire Roy',   role: 'Brand Manager',      lastInt: 'Message envoyé',       status: 'À contacter',    progress: 25,  progressCol: C.red },
  { initials: 'BYD',name: 'BYD France',       avatarBg: C.redBg,    avatarCol: C.red,   sector: 'Auto',    contact: 'Thomas Lee',   role: 'Dir. Marketing',     lastInt: 'Urgent',               status: 'À contacter',    progress: 10,  progressCol: C.red },
  { initials: 'GP', name: 'Groupama',         avatarBg: C.blueBg,   avatarCol: C.blue,  sector: 'Assur',   contact: 'Luc Bernard',  role: 'Dir. Événementiel',  lastInt: 'Envoyé',               status: 'Devis envoyé',   progress: 55,  progressCol: C.blue },
  { initials: 'VT', name: 'Viva Tech',        avatarBg: C.black,    avatarCol: C.white, sector: 'Tech',    contact: 'Sophie Chen',  role: 'Event Manager',      lastInt: 'Connaissance',         status: 'En négociation', progress: 65,  progressCol: C.orange },
];

const CRM_FILTERS = ['Tous', 'À contacter', 'Devis envoyé', 'En négociation', 'Client actif', 'Perdu'];

function ProspectsCrmScreen({ topPad, view, setView, onSelectProspect }: { topPad: number; view: 'crm'|'radar'|'archives'; setView: (v:'crm'|'radar'|'archives')=>void; onSelectProspect:(p:any)=>void }) {
  const [activeFilter, setActiveFilter] = useState('Tous');
  const [searchQuery, setSearchQuery]   = useState('');

  let filtered = CRM_OPPS;
  if (activeFilter !== 'Tous') {
    filtered = filtered.filter(o => o.status === activeFilter);
  }
  if (searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(o => o.name.toLowerCase().includes(q) || o.contact.toLowerCase().includes(q));
  }

  return (
    <View style={[pc.container, { paddingTop: topPad }]}>
      <View style={pc.header}>
        <View>
          <Text style={pc.headerTitle}>Prospects</Text>
          <Text style={pc.headerSub}>12 contacts actifs</Text>
        </View>
        <TouchableOpacity style={pc.addBtn} activeOpacity={0.8}><Text style={pc.addIcon}>+</Text></TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 22, marginBottom: 12 }}>
        <TouchableOpacity style={[ds.tab, {flex: 1, alignItems: 'center'}, view === 'crm' ? ds.tabOn : ds.tabOff]} onPress={() => setView('crm')}><Text style={[ds.tabTxt, view === 'crm' ? ds.tabTxtOn : ds.tabTxtOff]}>CRM</Text></TouchableOpacity>
        <TouchableOpacity style={[ds.tab, {flex: 1, alignItems: 'center'}, view === 'radar' ? ds.tabOn : ds.tabOff]} onPress={() => setView('radar')}><Text style={[ds.tabTxt, view === 'radar' ? ds.tabTxtOn : ds.tabTxtOff]}>Radar</Text></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pc.scroll}>
        <AnimUp delay={0}>
          <View style={pc.searchWrap}>
            <Text style={pc.searchIcon}>🔎</Text>
            <TextInput
              style={pc.searchInput}
              placeholder="Rechercher un prospect..."
              placeholderTextColor={C.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </AnimUp>

        <AnimUp delay={40}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pc.filterList} style={{ marginHorizontal: -22 }}>
            <View style={{ width: 22 }} />
            {CRM_FILTERS.map(f => (
              <TouchableOpacity key={f} style={[pc.filterPill, activeFilter === f && pc.filterPillOn]} onPress={() => setActiveFilter(f)} activeOpacity={0.8}>
                <Text style={[pc.filterTxt, activeFilter === f && pc.filterTxtOn]}>{f}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ width: 6 }} />
          </ScrollView>
        </AnimUp>

        <View style={pc.list}>
          {filtered.map((opp, i) => (
            <AnimUp key={i} delay={80 + i * 30}>
              <TouchableOpacity style={pc.card} activeOpacity={0.85} onPress={() => onSelectProspect(opp)}>
                <View style={pc.row1}>
                  <View style={[pc.avatar, { backgroundColor: opp.avatarBg }]}><Text style={[pc.avatarTxt, { color: opp.avatarCol }]}>{opp.initials}</Text></View>
                  <Text style={pc.name}>{opp.name}</Text>
                  <View style={pc.tagSec}><Text style={pc.tagSecTxt}>{opp.sector}</Text></View>
                </View>
                <View style={pc.row2}>
                  <Text style={pc.contactName}>{opp.contact}</Text>
                  <Text style={pc.dot}> · </Text>
                  <Text style={pc.role}>{opp.role}</Text>
                </View>
                <View style={pc.row3}>
                  <Text style={pc.lastInt}>{opp.lastInt}</Text>
                  <View style={[pc.statusBadge, { backgroundColor: opp.progressCol + '15' }]}>
                    <Text style={[pc.statusTxt, { color: opp.progressCol }]}>{opp.status}</Text>
                  </View>
                </View>
                <View style={pc.progTrack}>
                  <View style={[pc.progFill, { width: `${opp.progress}%`, backgroundColor: opp.progressCol }]} />
                </View>
              </TouchableOpacity>
            </AnimUp>
          ))}
        </View>

        <AnimUp delay={160 + filtered.length * 30}>
          <View style={pc.pipeCard}>
            <Text style={pc.pipeTitle}>Pipeline</Text>
            <View style={pc.pipeCols}>
              {[
                { count: '3', label: 'À contacter', color: C.red },
                { count: '2', label: 'Devis', color: C.blue },
                { count: '2', label: 'Négo', color: C.orange },
                { count: '1', label: 'Client', color: C.green },
              ].map((c, i) => (
                <View key={i} style={pc.pipeCol}>
                  <Text style={[pc.pipeCount, { color: c.color }]}>{c.count}</Text>
                  <Text style={pc.pipeLbl}>{c.label}</Text>
                </View>
              ))}
            </View>
            <View style={pc.pipeBar}>
              <View style={[pc.pipeSeg, { flex: 3, backgroundColor: C.red }]} />
              <View style={[pc.pipeSeg, { flex: 2, backgroundColor: C.blue }]} />
              <View style={[pc.pipeSeg, { flex: 2, backgroundColor: C.orange }]} />
              <View style={[pc.pipeSeg, { flex: 1, backgroundColor: C.green }]} />
            </View>
          </View>
        </AnimUp>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function ProfileScreen({ topPad }: { topPad: number }) {
  const Toggle = ({ on }: { on: boolean }) => (
    <View style={[pr.tTrack, on ? pr.tTrackOn : pr.tTrackOff]}>
      <View style={[pr.tThumb, on ? pr.tThumbOn : pr.tThumbOff]} />
    </View>
  );

  return (
    <View style={[pr.container, { paddingTop: topPad }]}>
      <View style={pr.header}>
        <Text style={pr.headerTitle}>Profil</Text>
        <Text style={pr.headerSub}>Scénographie France</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pr.scroll}>
        <AnimUp delay={0}>
          <View style={pr.idCard}>
            <View style={pr.avatar}><Text style={pr.avatarTxt}>ES</Text></View>
            <Text style={pr.idName}>Esteban Niochet</Text>
            <Text style={pr.idRole}>Commercial — Scénographie France</Text>
            <View style={pr.idSep} />
            <View style={pr.idStats}>
              <View style={pr.idStat}><Text style={pr.idStatVal}>1 200+</Text><Text style={pr.idStatLbl}>projets</Text></View>
              <View style={pr.idStat}><Text style={pr.idStatVal}>14</Text><Text style={pr.idStatLbl}>ans d'expérience</Text></View>
              <View style={pr.idStat}><Text style={pr.idStatVal}>12</Text><Text style={pr.idStatLbl}>prospects actifs</Text></View>
            </View>
          </View>
        </AnimUp>

        <AnimUp delay={40}>
          <Text style={pr.secTitle}>Connexions</Text>
          <View style={pr.connList}>
            <View style={pr.connCard}>
              <View style={[pr.cxIcon, { backgroundColor: C.blueBg }]}><Text style={[pr.cxIconTxt, { color: C.blue }]}>in</Text></View>
              <View style={pr.cxInfo}>
                <Text style={pr.cxName}>LinkedIn Sales Navigator</Text>
                <Text style={pr.cxStatOn}>Connecté ✓</Text>
              </View>
              <Toggle on={true} />
            </View>
            <View style={pr.connCard}>
              <View style={[pr.cxIcon, { backgroundColor: C.cream2 }]}><Text style={pr.cxIconTxt}>✉️</Text></View>
              <View style={pr.cxInfo}>
                <Text style={pr.cxName}>Gmail</Text>
                <Text style={pr.cxStatOn}>Connecté ✓</Text>
              </View>
              <Toggle on={true} />
            </View>
            <View style={pr.connCard}>
              <View style={[pr.cxIcon, { backgroundColor: C.cream2 }]}><Text style={pr.cxIconTxt}>📅</Text></View>
              <View style={pr.cxInfo}>
                <Text style={pr.cxName}>Google Calendar</Text>
                <Text style={pr.cxStatOff}>Non connecté</Text>
              </View>
              <Toggle on={false} />
            </View>
          </View>
        </AnimUp>

        <AnimUp delay={80}>
          <Text style={pr.secTitle}>Préférences IA</Text>
          <View style={pr.prefCard}>
            {[
              { label: 'Alertes salons automatiques', sub: 'Suggestions auto via mots-clés', on: true },
              { label: 'Détection anniversaires entreprises', sub: 'Rappels 2 ans avant les décennies', on: true },
              { label: 'Veille sorties automobiles', sub: 'Notifications des lancements FR/EU', on: true },
              { label: 'Relances automatiques', sub: 'Délai configurable dans les brouillons', on: false },
            ].map((p, i) => (
              <View key={i} style={pr.prefRow}>
                <View style={pr.prefInfo}>
                  <Text style={pr.prefName}>{p.label}</Text>
                  <Text style={pr.prefSub}>{p.sub}</Text>
                </View>
                <Toggle on={p.on} />
              </View>
            ))}
          </View>
        </AnimUp>

        <AnimUp delay={120}>
          <Text style={pr.secTitle}>Notre agence</Text>
          <View style={pr.agCard}>
            <View style={pr.agHeader}>
              <View style={pr.agLogo}><Text style={pr.agLogoTxt}>SF</Text></View>
              <View>
                <Text style={pr.agName}>Scénographie France</Text>
                <Text style={pr.agSub}>Agence de scénographie événementielle · Rennes</Text>
              </View>
            </View>
            <View style={pr.agSep} />
            <View style={pr.agTags}>
              {['Stands immersifs', 'Révélation auto', 'Pop-up luxe'].map(t => (
                <View key={t} style={pr.agTag}><Text style={pr.agTagTxt}>{t}</Text></View>
              ))}
            </View>
          </View>
        </AnimUp>

        <AnimUp delay={160}>
          <Text style={pr.secTitle}>Paramètres</Text>
          <View style={pr.setList}>
            <TouchableOpacity style={pr.setRow} activeOpacity={0.7}><Text style={pr.setTxt}>Notifications</Text><Text style={pr.setArr}>›</Text></TouchableOpacity>
            <TouchableOpacity style={pr.setRow} activeOpacity={0.7}><Text style={pr.setTxt}>Langue</Text><View style={{flexDirection:'row',alignItems:'center'}}><Text style={pr.setVal}>Français</Text><Text style={[pr.setArr, {marginLeft: 6}]}>›</Text></View></TouchableOpacity>
            <TouchableOpacity style={pr.setRow} activeOpacity={0.7}><Text style={pr.setTxt}>Confidentialité</Text><Text style={pr.setArr}>›</Text></TouchableOpacity>
            <TouchableOpacity style={pr.setRow} activeOpacity={0.7}><Text style={pr.setTxt}>À propos d'Eloquence</Text><Text style={pr.setArr}>›</Text></TouchableOpacity>
            <TouchableOpacity style={[pr.setRow, { borderBottomWidth: 0 }]} activeOpacity={0.7}><Text style={pr.setTxtRed}>Déconnexion</Text></TouchableOpacity>
          </View>
        </AnimUp>
        
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROSPECTS TAB ORCHESTRATOR & DETAIL SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function ProspectsTabScreen({ topPad, onSelectOpp, onSelectProspect }: { topPad: number; onSelectOpp: any; onSelectProspect: any }) {
  const [view, setView] = useState<'crm'|'radar'|'archives'>('radar');
  if (view === 'crm') return <ProspectsCrmScreen topPad={topPad} onSelectProspect={onSelectProspect} view={view} setView={setView} />;
  return <ProspectionScreen topPad={topPad} onSelectOpp={onSelectOpp} view={view} setView={setView} />;
}

const P_INT_HISTORY = [
  { type: 'meeting', date: 'Mardi, 14h', title: 'Réunion découverte' },
  { type: 'message', date: 'Lundi, 10h', title: 'Message LinkedIn envoyé' },
  { type: 'opp', date: 'Il y a 1 sem', title: 'Opportunité détectée (Salon)' },
];

function ProspectDetailScreen({ prospect, onBack, topPad }: { prospect: any; onBack: () => void; topPad: number }) {
  const bColor = prospect.status === 'Client actif' ? C.green : prospect.status === 'À contacter' ? '#DC2626' : prospect.status === 'Devis envoyé' ? C.blue : '#F97316';
  const widthRatio = prospect.status === 'Client actif' ? '100%' : prospect.status === 'En négociation' ? '70%' : prospect.status === 'Devis envoyé' ? '50%' : '15%';

  return (
    <View style={[pd.container, { paddingTop: topPad }]}>
      <View style={pd.header}>
        <TouchableOpacity style={pd.headerBtn} onPress={onBack}><Text style={pd.headerBack}>←</Text></TouchableOpacity>
        <Text style={pd.headerTitle}>{prospect.name}</Text>
        <View style={{width: 44}}/>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pd.scroll}>
        <AnimUp delay={0}>
          <View style={pd.idCard}>
            <View style={[pd.avatar, { backgroundColor: prospect.avatarBg }]}><Text style={[pd.avatarTxt, { color: prospect.avatarCol }]}>{prospect.initials}</Text></View>
            <Text style={pd.idName}>{prospect.contact}</Text>
            <Text style={pd.idRole}>{prospect.role}</Text>
            <View style={pd.idSep} />
            <View style={pd.actions}>
              <TouchableOpacity style={pd.actBtn}><Text style={pd.actTxt}>in</Text></TouchableOpacity>
              <TouchableOpacity style={pd.actBtn}><Text style={pd.actTxt}>✉️</Text></TouchableOpacity>
              <TouchableOpacity style={pd.actBtn}><Text style={pd.actTxt}>📞</Text></TouchableOpacity>
            </View>
          </View>
        </AnimUp>

        <AnimUp delay={60}>
          <Text style={pd.secTitle}>Historique récent</Text>
          <View style={pd.histCard}>
            {P_INT_HISTORY.map((h, i) => (
              <View key={i} style={[pd.histRow, i !== P_INT_HISTORY.length - 1 && pd.histSep]}>
                <Text style={pd.histTop}>{h.title}</Text>
                <Text style={pd.histBot}>{h.date}</Text>
              </View>
            ))}
          </View>
        </AnimUp>

        <AnimUp delay={120}>
          <Text style={pd.secTitle}>Statut Pipeline</Text>
          <View style={pd.pipeCard}>
            <Text style={pd.pipeTxt}>{prospect.status}</Text>
            <View style={pc.progTrack}><View style={[pc.progFill, { width: widthRatio, backgroundColor: bColor }]} /></View>
          </View>
        </AnimUp>

        <AnimUp delay={180}>
          <Text style={pd.secTitle}>Dernier message généré</Text>
          <View style={pd.msgCard}>
            <Text style={pd.msgTxt} numberOfLines={3}>Bonjour {prospect.contact.split(' ')[0]}, suite à notre échange sur le devis, je voulais faire le point avant le salon. Quelques options supplémentaires à vous présenter.</Text>
          </View>
        </AnimUp>
        
        <View style={{height: 40}} />
      </ScrollView>
      <View style={od.ctaWrap}>
        <TouchableOpacity style={od.ctaBtn} activeOpacity={0.8}><Text style={od.ctaTxt}>Nouvelle interaction →</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
type ContentTab = 'dash' | 'folders' | 'meetings';

function DashboardView({ folders, onNavigateOpp }: { folders: FolderDat[], onNavigateOpp: (opp: Opp) => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={ds.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={{ height: 14 }} />
      <AnimUp delay={0}>
        <View style={ds.kpiRow}>
          <View style={ds.kpi}><Text style={ds.kpiVal}>7</Text><Text style={ds.kpiLbl}>{'Réunions\nSemaine'}</Text></View>
          <View style={[ds.kpi, ds.kpiBlue]}><Text style={[ds.kpiVal, ds.kpiValW]}>84</Text><Text style={[ds.kpiLbl, ds.kpiLblW]}>{'Score\nMoyen'}</Text></View>
          <View style={ds.kpi}><Text style={ds.kpiVal}>12</Text><Text style={ds.kpiLbl}>{'Prospects\nActifs'}</Text></View>
        </View>
      </AnimUp>
      <AnimUp delay={50}>
        <TouchableOpacity style={ds.cta} activeOpacity={0.93}>
          <View style={ds.ctaIcon}><Text style={{ fontSize: 22 }}>🎙</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={ds.ctaTitle}>Nouvelle réunion</Text>
            <Text style={ds.ctaSub}>Enregistrer ou importer un audio</Text>
          </View>
          <Text style={ds.ctaArrow}>›</Text>
        </TouchableOpacity>
      </AnimUp>
      <View style={ds.secHead}>
        <Text style={ds.secTitle}>Opportunités récentes</Text>
        <TouchableOpacity><Text style={ds.secLink}>Voir tout →</Text></TouchableOpacity>
      </View>
      <AnimUp delay={100}>
        <View style={ds.folders}>
          {folders.length > 0 ? folders.slice(0, 2).map((f, i) => <Folder key={f.id} data={f} defaultOpen={i === 0} onNavigateOpp={onNavigateOpp} />) : <Text style={{ fontFamily: INTER, fontSize: 13, color: C.muted, textAlign: 'center', padding: 20 }}>Aucune opportunité récente</Text>}
        </View>
      </AnimUp>
    </ScrollView>
  );
}

function DossiersView({ folders, onNavigateOpp }: { folders: FolderDat[], onNavigateOpp: (opp: Opp) => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={ds.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={{ height: 14 }} />
      <View style={ds.secHead}>
        <Text style={ds.secTitle}>Tous les dossiers</Text>
        <TouchableOpacity><Text style={ds.secLink}>Filtrer ↓</Text></TouchableOpacity>
      </View>
      <View style={ds.folders}>
        {folders.map((f, i) => <Folder key={f.id} data={f} defaultOpen={i === 0} onNavigateOpp={onNavigateOpp} />)}
      </View>
    </ScrollView>
  );
}

function MeetingsView() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={ds.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={{ height: 14 }} />
      <View style={ds.secHead}>
        <Text style={ds.secTitle}>Dernières réunions</Text>
        <TouchableOpacity><Text style={ds.secLink}>Filtrer ↓</Text></TouchableOpacity>
      </View>
      <AnimUp delay={80}>
        <View style={{ gap: 8 }}>
          {MEETINGS_DATA.map((m, i) => {
            const sc = scoreStyle(m.score);
            return (
              <TouchableOpacity key={i} style={ds.meetCard} activeOpacity={0.88}>
                <View style={[ds.scoreBox, { backgroundColor: sc.bg }]}>
                  <Text style={[ds.scoreVal, { color: sc.color }]}>{m.score}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={ds.meetName} numberOfLines={1}>{m.name}</Text>
                  <Text style={ds.meetMeta}>{m.meta}</Text>
                </View>
                <View style={[ds.meetPill, { backgroundColor: m.pillBg }]}>
                  <Text style={[ds.meetPillTxt, { color: m.pillColor }]}>{m.pill}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </AnimUp>
    </ScrollView>
  );
}

function DashboardPage({ insets, onNavigateOpp }: { insets: any, onNavigateOpp: (opp: Opp) => void }) {
  const [contentTab, setContentTab] = useState<ContentTab>('dash');
  const [dashFolders, setDashFolders] = useState<FolderDat[]>([]);

  useEffect(() => {
    async function loadDashFolders() {
      const { data } = await supabase
        .from('opportunites')
        .select('*')
        .in('status', ['NOUVEAU', 'URGENT', 'EN COURS', 'À CONTACTER'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        const groups: Record<string, OppItem[]> = {};
        
        data.forEach(o => {
          const dateStr = new Date(o.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short' });
          const key = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
          
          if (!groups[key]) groups[key] = [];
          
          let emoji = '🏛'; let emojiBg = C.blueBg; let cat: OppCat = 'salon';
          if (o.type === 'anniversaire') { emoji = '🎂'; emojiBg = C.orangeBg; cat = 'anniv'; }
          else if (o.type === 'auto')    { emoji = '🚗'; emojiBg = C.greenBg;  cat = 'auto'; }

          const contactName = o.contact_data && o.contact_data.length > 0 ? `${o.contact_data[0].prenom} ${o.contact_data[0].nom}` : undefined;

          const opp: Opp = {
            id: o.id,
            name: o.nom,
            detail: o.detail,
            cat,
            emoji,
            emojiBg,
            status: o.status || 'NOUVEAU',
            contact: contactName,
            contact_data: o.contact_data,
            qualification: o.qualification || 'Non qualifié',
            score_pertinence: o.score_pertinence || 0
          };

          groups[key].push({
            emoji,
            emojiBg,
            name: o.nom,
            detail: o.detail,
            status: (o.status || 'NOUVEAU') as Status,
            opp
          });
        });

        const folders: FolderDat[] = Object.keys(groups).map((key, i) => ({
          id: `f_${i}`,
          date: key,
          count: `${groups[key].length} opps`,
          isNew: i === 0,
          items: groups[key]
        }));
        
        setDashFolders(folders);
      }
    }
    loadDashFolders();
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View style={ds.statusBar}>
        <Text style={ds.statusTime}>09:41</Text>
        <Text style={ds.statusRight}>▲▲▲ · 100%</Text>
      </View>
      <View style={ds.header}>
        <View style={ds.headerTop}>
          <View style={ds.avatar}><Text style={ds.avatarTxt}>ES</Text></View>
          <View style={ds.bell}>
            <Text style={{ fontSize: 15 }}>🔔</Text>
            <View style={ds.bellDot} />
          </View>
        </View>
        <Text style={ds.headline}>{'Élo'}<Text style={ds.accent}>{'quence'}</Text></Text>
        <View style={ds.subline}>
          <Text style={ds.sublineTxt}>Bonjour Esteban —</Text>
          <View style={ds.livePill}>
            <PulseDot color={C.green} />
            <Text style={ds.livePillTxt}>Live</Text>
          </View>
        </View>
      </View>
      <View style={ds.tabs}>
        {([ { id: 'dash' as ContentTab, label: 'Dashboard' }, { id: 'folders' as ContentTab, label: 'Dossiers' }, { id: 'meetings' as ContentTab, label: 'Réunions' } ]).map(t => (
          <TouchableOpacity key={t.id} style={[ds.tab, contentTab === t.id ? ds.tabOn : ds.tabOff]} onPress={() => setContentTab(t.id)} activeOpacity={0.8}>
            <Text style={[ds.tabTxt, contentTab === t.id ? ds.tabTxtOn : ds.tabTxtOff]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {contentTab === 'dash'     && <DashboardView folders={dashFolders} onNavigateOpp={onNavigateOpp} />}
        {contentTab === 'folders'  && <DossiersView folders={dashFolders} onNavigateOpp={onNavigateOpp} />}
        {contentTab === 'meetings' && <MeetingsView />}
      </View>
    </View>
  );
}

// ─── NAVIGATION TYPES ─────────────────────────────────────────────────────────
type NavTab = 'home' | 'meeting' | 'analyse' | 'rapport' | 'prospects' | 'opp-detail' | 'prospect-detail' | 'messages' | 'profile';
const NAV_ITEMS = [
  { id: 'home'      as NavTab, icon: '⌂',  label: 'Home'      },
  { id: 'meeting'   as NavTab, icon: '🎙', label: 'Réunion'   },
  { id: 'prospects' as NavTab, icon: '🔎', label: 'Prospects'  },
  { id: 'messages'  as NavTab, icon: '✉️', label: 'Messages'  },
  { id: 'profile'   as NavTab, icon: '◎',  label: 'Profil'    },
];

// ─── APP CONTENT ──────────────────────────────────────────────────────────────
function AppContent() {
  const insets = useSafeAreaInsets();
  const [navTab, setNavTab]         = useState<NavTab>('home');
  
  // Navigation AI State
  const [audioPayload, setAudioPayload] = useState<{
    audioBase64: string | null;
    durationMs: number | null;
    sourceStr: string;
    durationStr: string;
  }>({ audioBase64: null, durationMs: null, sourceStr: 'Réunion enregistrée', durationStr: '00:00' });
  const [reportData, setReportData]     = useState<any>(null);

  const [selectedOpp, setSelectedOpp] = useState<Opp | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<any>(null);

  const isFullScreen = navTab === 'analyse'; // no bottom nav during analysis

  useEffect(() => {
    async function setupNotifications() {
      if (Platform.OS === 'web') return; // notifications non supportées sur web
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      await Notifications.cancelAllScheduledNotificationsAsync();

      // Schedule for every Monday at 8 AM
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🎯 20 nouvelles opportunités détectées !",
          body: "3 salons majeurs et 2 urgences auto. Découvrez-les dans votre radar.",
          data: { route: 'prospects' },
        },
        trigger: {
          // weekday logic in Expo: 1=Sunday, 2=Monday
          weekday: 2,
          hour: 8,
          minute: 0,
          repeats: true,
        } as any,
      });
    }
    setupNotifications();

    let sub: any;
    if (Platform.OS !== 'web') {
      sub = Notifications.addNotificationResponseReceivedListener(response => {
        const rte = response.notification.request.content.data?.route;
        if (rte === 'prospects') {
          setNavTab('prospects');
        }
      });
    }

    return () => {
      if (sub) sub.remove();
    };
  }, []);

  const handleStartAnalyse = (sourceStr: string, durationStr: string, audioBase64: string, durationMs: number | null) => {
    setAudioPayload({ sourceStr, durationStr, audioBase64, durationMs });
    setReportData(null);
    setNavTab('analyse');
  };

  return (
    <View style={ds.phone}>
      <StatusBar style="dark" />

      <View style={{ flex: 1 }}>
        {navTab === 'home'    && <DashboardPage insets={insets} onNavigateOpp={(opp) => { setSelectedOpp(opp); setNavTab('opp-detail'); }} />}
        {navTab === 'meeting' && <ReunionScreen topPad={insets.top} onStartAnalyse={handleStartAnalyse} onViewPastReport={(data) => {
          // data needs to be mapped to the expected format
          const mappedReport = {
            ...data,
            besoins_detectes: data.besoins,
            prestations_recommandees: data.prestations,
            decideurs_identifies: data.decideurs,
            concurrents_mentionnes: data.concurrents,
          };
          setReportData(mappedReport);
          setNavTab('rapport');
        }} />}
        {navTab === 'analyse' && <AnalyseScreen 
          onViewReport={(data) => {
            setReportData(data);
            setNavTab('rapport');
          }} 
          audioLabel={audioPayload.sourceStr} 
          audioDuration={audioPayload.durationStr} 
          audioBase64={audioPayload.audioBase64} 
          durationMs={audioPayload.durationMs}
        />}
        {navTab === 'rapport'  && <RapportScreen reportData={reportData} onBack={() => setNavTab('meeting')} onNavigateMessages={() => setNavTab('messages')} />}
        {navTab === 'prospects' && <ProspectsTabScreen topPad={insets.top} onSelectOpp={(opp: Opp) => { setSelectedOpp(opp); setNavTab('opp-detail'); }} onSelectProspect={(p: any) => { setSelectedProspect(p); setNavTab('prospect-detail'); }} />}
        {navTab === 'opp-detail' && selectedOpp && <OppDetailScreen opp={selectedOpp} onBack={() => setNavTab('prospects')} onNavigateMessages={() => setNavTab('messages')} topPad={insets.top} />}
        {navTab === 'prospect-detail' && selectedProspect && <ProspectDetailScreen prospect={selectedProspect} onBack={() => setNavTab('prospects')} topPad={insets.top} />}
        {navTab === 'messages' && <MessagesScreen topPad={insets.top} />}
        {navTab === 'profile' && <ProfileScreen topPad={insets.top} />}
      </View>

      {/* Bottom nav — hidden during analyse */}
      {!isFullScreen && (
        <View style={[ds.bnav, { paddingBottom: insets.bottom + 10 }]}>
          {NAV_ITEMS.map(n => {
            const activeId = navTab === 'rapport' ? 'meeting' : navTab === 'opp-detail' ? 'prospects' : navTab;
            const active = activeId === n.id;
            return (
              <TouchableOpacity key={n.id} style={[ds.ni, active && ds.niOn]} onPress={() => setNavTab(n.id)} activeOpacity={0.7}>
                <Text style={ds.niIco}>{n.icon}</Text>
                <Text style={[ds.niLbl, active && ds.niLblOn]}>{n.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  if (!fontsLoaded) return null;
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLESHEETS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const ds = StyleSheet.create({
  phone: { flex: 1, backgroundColor: C.cream, maxWidth: 390, alignSelf: 'center', width: '100%' },
  statusBar: { paddingHorizontal: 22, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusTime: { fontFamily: CLASH, fontSize: 15 },
  statusRight: { fontFamily: INTER, fontSize: 11 },
  header: { paddingHorizontal: 22, paddingTop: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontFamily: CLASH, fontSize: 13, color: C.cream },
  bell: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.blue, borderWidth: 1.5, borderColor: C.cream },
  headline: { fontFamily: CLASH, fontSize: 44, lineHeight: 40, letterSpacing: -2 },
  accent: { color: C.blue },
  subline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  sublineTxt: { fontFamily: INTER, fontSize: 11, color: C.muted, fontStyle: 'italic' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.black, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  livePillTxt: { fontFamily: CLASH_MD, fontSize: 9, color: C.cream, letterSpacing: 0.5 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingTop: 14 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  tabOn: { backgroundColor: C.black },
  tabOff: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  tabTxt: { fontFamily: CLASH_MD, fontSize: 11, letterSpacing: 0.3 },
  tabTxtOn: { color: C.cream },
  tabTxtOff: { color: C.muted },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 100 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  kpi: { flex: 1, backgroundColor: C.white, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  kpiBlue: { backgroundColor: C.blue, borderColor: C.blue },
  kpiVal: { fontFamily: CLASH, fontSize: 28, letterSpacing: -1, lineHeight: 28, marginBottom: 4 },
  kpiValW: { color: C.white },
  kpiLbl: { fontFamily: INTER, fontSize: 8.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', lineHeight: 13 },
  kpiLblW: { color: 'rgba(255,255,255,0.65)' },
  cta: { backgroundColor: C.blue, borderRadius: 18, padding: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  ctaIcon: { width: 46, height: 46, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontFamily: CLASH_MD, fontSize: 17, color: C.white, letterSpacing: -0.5, marginBottom: 3 },
  ctaSub: { fontFamily: INTER, fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  ctaArrow: { fontSize: 22, color: 'rgba(255,255,255,0.5)' },
  secHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  secTitle: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.3 },
  secLink: { fontFamily: INTER, fontSize: 11, color: C.blue },
  folders: { flexDirection: 'column', gap: 10, marginBottom: 20 },
  folder: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  folderHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  folderIcon: { fontSize: 16 },
  folderDate: { flex: 1, fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.3 },
  folderCount: { backgroundColor: C.blueBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  folderCountNew: { backgroundColor: C.blue },
  folderCountTxt: { fontFamily: INTER_MD, fontSize: 10, color: C.blue },
  folderCountTxtNew: { color: C.white },
  folderChev: { fontFamily: INTER, fontSize: 16, color: C.muted2, lineHeight: 18 },
  folderItems: { borderTopWidth: 1, borderTopColor: C.border },
  oppItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  oppSep: { height: 1, backgroundColor: C.cream2 },
  oppEmoji: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  oppInfo: { flex: 1, minWidth: 0 },
  oppName: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2, marginBottom: 2 },
  oppDetail: { fontFamily: INTER, fontSize: 10, color: C.muted, lineHeight: 14 },
  oppStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  oppStatusTxt: { fontFamily: INTER_MD, fontSize: 9 },
  meetCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scoreVal: { fontFamily: CLASH, fontSize: 17 },
  meetName: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2, marginBottom: 3 },
  meetMeta: { fontFamily: INTER, fontSize: 10, color: C.muted },
  meetPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  meetPillTxt: { fontFamily: INTER_MD, fontSize: 9 },
  bnav: { backgroundColor: 'rgba(244,241,235,0.94)', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-around' },
  ni: { alignItems: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  niOn: { backgroundColor: C.blue },
  niIco: { fontSize: 18 },
  niLbl: { fontFamily: CLASH_MD, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: C.muted2 },
  niLblOn: { color: C.white },
});

// ─── RÉUNION ──────────────────────────────────────────────────────────────────
const rs = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 },
  headerBtn: { width: 38, height: 38, backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerBack: { fontSize: 18 },
  headerTitle: { fontFamily: CLASH_MD, fontSize: 22, color: C.black, letterSpacing: -0.5 },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 30, gap: 18 },
  recordCard: { backgroundColor: C.black, borderRadius: 20, padding: 28, alignItems: 'center', gap: 14 },
  recordTitle: { fontFamily: CLASH, fontSize: 24, color: C.white, letterSpacing: -0.5 },
  recordSub: { fontFamily: INTER, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
  micWrapper: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  pulseRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: C.white },
  micBtn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 32 },
  tapText: { fontFamily: INTER, fontSize: 11, color: C.muted },
  timer: { fontFamily: CLASH, fontSize: 36, color: C.white, letterSpacing: -1, lineHeight: 42 },
  recordingStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordingText: { fontFamily: INTER, fontSize: 11, color: C.muted },
  stopBtn: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.red, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, marginTop: 4 },
  stopBtnText: { fontFamily: CLASH_MD, fontSize: 13, color: C.red, letterSpacing: -0.2 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sepLine: { flex: 1, height: 1, backgroundColor: C.border },
  sepText: { fontFamily: INTER, fontSize: 12, color: C.muted },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16 },
  importTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.3 },
  importSub: { fontFamily: INTER, fontSize: 11, color: C.muted, marginTop: 2 },
  importArrow: { fontSize: 20, color: C.muted2 },
  secHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.3 },
  seeAll: { fontFamily: INTER, fontSize: 11, color: C.blue },
  analysesList: { gap: 10, paddingBottom: 4 },
  analyseCard: { width: 160, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, gap: 8 },
  analyseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  scoreCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scoreCircleTxt: { fontFamily: CLASH, fontSize: 13 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagPillTxt: { fontFamily: INTER_MD, fontSize: 9 },
  analyseName: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2, lineHeight: 17 },
  analyseDate: { fontFamily: INTER, fontSize: 10, color: C.muted },
});

// ─── ANALYSE ──────────────────────────────────────────────────────────────────
const as = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },

  // Header
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 8, paddingHorizontal: 22 },
  headerTitle: { fontFamily: CLASH_MD, fontSize: 18, color: C.black, letterSpacing: -0.3 },
  headerSub: { fontFamily: INTER, fontSize: 11, color: C.muted, marginTop: 5 },

  scrollContent: { paddingHorizontal: 22, paddingBottom: 40, gap: 18 },

  // Central ring + percentage
  central: { alignItems: 'center', paddingVertical: 28, gap: 18 },
  ringWrapper: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  innerCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  innerCircleDone: { width: 100, height: 100, borderRadius: 50, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 44, color: C.white, fontWeight: '300' },
  percent: { fontFamily: CLASH, fontSize: 48, color: C.black, letterSpacing: -2, lineHeight: 54 },
  doneText: { fontFamily: CLASH_MD, fontSize: 20, color: C.green, letterSpacing: -0.5 },

  // Steps
  stepsCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepIconPending: { borderWidth: 1, borderColor: C.border },
  stepLabel: { flex: 1, fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2 },
  stepSep: { height: 1, backgroundColor: C.cream2, marginHorizontal: 16 },
  statusDone: { fontFamily: INTER_MD, fontSize: 11, color: C.green },
  statusActive: { fontFamily: INTER_MD, fontSize: 11, color: C.blue },
  statusPending: { fontFamily: INTER, fontSize: 11, color: C.muted },

  // Audio card
  audioCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  audioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  audioName: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2 },
  audioDur: { fontFamily: INTER, fontSize: 11, color: C.muted, marginTop: 2 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36, flex: 1, justifyContent: 'flex-end' },
  waveBar: { width: 3, backgroundColor: C.border, borderRadius: 2 },

  // Report button
  reportBtn: { backgroundColor: C.blue, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  reportBtnTxt: { fontFamily: CLASH_MD, fontSize: 16, color: C.white, letterSpacing: -0.3 },
});

// ─── RAPPORT ──────────────────────────────────────────────────────────────────
const rp = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 },
  headerBtn: { width: 38, height: 38, backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerBack: { fontSize: 18, color: C.black },
  headerTitle: { fontFamily: CLASH_MD, fontSize: 18, color: C.black, letterSpacing: -0.5 },
  shareBtn: { backgroundColor: C.blue, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  shareTxt: { fontFamily: INTER_MD, fontSize: 13, color: C.white },

  scroll: { paddingHorizontal: 22, paddingBottom: 24, gap: 20 },

  // S1 — Identity
  identCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18 },
  identTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  prospectName: { fontFamily: CLASH, fontSize: 20, color: C.black, letterSpacing: -0.5 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagTxt: { fontFamily: INTER_MD, fontSize: 10 },
  identMeta: { fontFamily: INTER, fontSize: 11, color: C.muted, lineHeight: 16 },

  // S2 — Score card
  scoreCard: { backgroundColor: C.black, borderRadius: 20, padding: 24 },
  scoreCardTitle: { fontFamily: CLASH_MD, fontSize: 16, color: C.white, letterSpacing: -0.3, marginBottom: 8 },
  bigScore: { fontFamily: CLASH, fontSize: 72, letterSpacing: -3, lineHeight: 72 },
  bigScoreSub: { fontFamily: INTER, fontSize: 14, color: C.muted, marginBottom: 20 },
  bars: { gap: 12 },
  barRow: { gap: 5 },
  barLabel: { fontFamily: INTER, fontSize: 10, color: C.muted2 },
  barTrack: { height: 5, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  barVal: { fontFamily: CLASH_MD, fontSize: 11, color: C.white, letterSpacing: -0.2 },

  // S3 — Needs
  secTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.3, marginBottom: 12 },
  needsList: { gap: 10 },
  needRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  needDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue, marginTop: 4 },
  needTxt: { flex: 1, fontFamily: INTER, fontSize: 13, color: C.black, lineHeight: 20 },

  // S4 — Reco carousel
  recoList: { gap: 10, paddingBottom: 4 },
  recoCard: { width: 200, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  recoTitle: { fontFamily: CLASH_MD, fontSize: 14, color: C.black, letterSpacing: -0.3 },
  recoDesc: { fontFamily: INTER, fontSize: 11, color: C.muted, lineHeight: 16 },
  recoBadge: { backgroundColor: C.blueBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  recoBadgeTxt: { fontFamily: INTER_MD, fontSize: 10, color: C.blue },

  // S5 — Action plan
  actionList: { gap: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  actionNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  actionNumTxt: { fontFamily: CLASH_MD, fontSize: 12, color: C.white },
  actionTxt: { flex: 1, fontFamily: INTER, fontSize: 13, color: C.black, lineHeight: 20 },

  // Fixed CTA
  ctaWrapper: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10, backgroundColor: C.cream, borderTopWidth: 1, borderTopColor: C.border },
  ctaBtn: { backgroundColor: C.blue, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  ctaBtnTxt: { fontFamily: CLASH_MD, fontSize: 16, color: C.white, letterSpacing: -0.3 },
});

// ─── PROSPECTION ──────────────────────────────────────────────────────────────
const pp = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  headerTitle: { fontFamily: CLASH, fontSize: 28, color: C.black, letterSpacing: -1, lineHeight: 30 },
  headerSub: { fontFamily: INTER, fontSize: 12, color: C.muted, marginTop: 4 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.black, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  liveTxt: { fontFamily: CLASH_MD, fontSize: 10, color: C.white, letterSpacing: 0.5 },
  scroll: { paddingHorizontal: 22, paddingBottom: 30, gap: 18 },
  counters: { flexDirection: 'row', gap: 8 },
  counterCard: { flex: 1, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center', gap: 4 },
  counterVal: { fontFamily: CLASH, fontSize: 28, color: C.black, letterSpacing: -1 },
  counterLbl: { fontFamily: INTER, fontSize: 9, color: C.muted, textAlign: 'center' },
  filterList: { gap: 8, paddingBottom: 4 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  filterPillOn: { backgroundColor: C.black, borderColor: C.black },
  filterTxt: { fontFamily: CLASH_MD, fontSize: 11, color: C.muted },
  filterTxtOn: { color: C.white },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.3 },
  secCount: { fontFamily: INTER, fontSize: 13, color: C.muted },
  oppList: { gap: 10 },
  oppCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  oppRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  oppIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  oppInfo: { flex: 1, minWidth: 0, gap: 4 },
  oppTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oppName: { flex: 1, fontFamily: CLASH_MD, fontSize: 14, color: C.black, letterSpacing: -0.2 },
  oppBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  oppBadgeTxt: { fontFamily: INTER_MD, fontSize: 9 },
  oppDetail: { fontFamily: INTER, fontSize: 11, color: C.muted },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactPill: { backgroundColor: C.greenBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  contactPillTxt: { fontFamily: INTER_MD, fontSize: 9, color: C.green },
  contactName: { fontFamily: INTER, fontSize: 10, color: C.muted },
  searchPill: { backgroundColor: C.cream2, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start' },
  searchTxt: { fontFamily: INTER, fontSize: 9, color: C.muted },
  chev: { fontSize: 18, color: C.muted2, alignSelf: 'center' },
  relanceCard: { backgroundColor: C.black, borderRadius: 16, padding: 18, gap: 14 },
  relanceTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.white, letterSpacing: -0.3 },
  relanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  relanceName: { fontFamily: CLASH_MD, fontSize: 13, color: C.white, letterSpacing: -0.2, marginBottom: 4 },
  relanceMsg: { fontFamily: INTER, fontSize: 12, color: C.muted, lineHeight: 17 },
  relanceBtn: { backgroundColor: C.blue, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  relanceBtnTxt: { fontFamily: CLASH_MD, fontSize: 12, color: C.white },
});

// ─── OPP DETAIL ───────────────────────────────────────────────────────────────
const od = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 },
  hBtn:      { width: 38, height: 38, backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  hBack:     { fontSize: 18, color: C.black },
  hTitle:    { fontFamily: CLASH_MD, fontSize: 18, color: C.black, letterSpacing: -0.5 },
  scroll:    { paddingHorizontal: 22, paddingBottom: 24, gap: 20 },
  identCard: { backgroundColor: C.black, borderRadius: 20, padding: 24, gap: 12 },
  identTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillTxt:   { fontFamily: INTER_MD, fontSize: 10 },
  identTitle: { fontFamily: CLASH, fontSize: 26, color: C.white, letterSpacing: -1, lineHeight: 28 },
  identSub:   { fontFamily: INTER, fontSize: 12, color: C.muted },
  sep:       { height: 1, backgroundColor: '#333' },
  statsRow:  { flexDirection: 'row', justifyContent: 'space-around' },
  stat:      { alignItems: 'center', gap: 4 },
  statVal:   { fontFamily: CLASH, fontSize: 16, color: C.white, letterSpacing: -0.5 },
  statLbl:   { fontFamily: INTER, fontSize: 9, color: C.muted },
  secTitle:  { fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.3, marginBottom: 10 },
  whyCard:   { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  whyRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  whyTxt:    { flex: 1, fontFamily: INTER, fontSize: 13, color: C.black, lineHeight: 20 },
  whyTag:    { fontFamily: INTER, fontSize: 10, color: C.muted },
  contactCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  contactRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:    { width: 48, height: 48, borderRadius: 24, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontFamily: CLASH, fontSize: 18, color: C.blue, letterSpacing: -0.5 },
  cName:     { fontFamily: CLASH_MD, fontSize: 16, color: C.black, letterSpacing: -0.3 },
  cRole:     { fontFamily: INTER, fontSize: 12, color: C.muted, marginTop: 2 },
  cSep:      { height: 1, backgroundColor: C.border },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12, borderRadius: 12 },
  actionTxt: { fontFamily: INTER_MD, fontSize: 11, color: C.black },
  relRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  relLbl:    { fontFamily: INTER, fontSize: 11, color: C.muted },
  relTrack:  { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  relFill:   { height: 5, backgroundColor: C.blue, borderRadius: 3 },
  selList:   { gap: 8, paddingBottom: 12 },
  selPill:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  selPillOn: { backgroundColor: C.black, borderColor: C.black },
  selTxt:    { fontFamily: CLASH_MD, fontSize: 11, color: C.muted },
  selTxtOn:  { color: C.white },
  msgCard:   { backgroundColor: C.white, borderRadius: 14, borderLeftWidth: 3, borderLeftColor: C.blue, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: C.border, borderRightColor: C.border, borderBottomColor: C.border, padding: 16, gap: 12 },
  msgTxt:    { fontFamily: INTER, fontSize: 13, color: C.black, lineHeight: 22 },
  editBtn:   { alignSelf: 'flex-end' },
  editTxt:   { fontFamily: INTER, fontSize: 11, color: C.muted },
  ctaWrap:   { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10, backgroundColor: C.cream, borderTopWidth: 1, borderTopColor: C.border, gap: 12 },
  ctaBtn:    { backgroundColor: C.blue, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  ctaTxt:    { fontFamily: CLASH_MD, fontSize: 16, color: C.white, letterSpacing: -0.3 },
  channels:  { flexDirection: 'row', justifyContent: 'center', gap: 30 },
  channel:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  channelTxt: { fontFamily: INTER_MD, fontSize: 12 },
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
const mm = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  headerTitle: { fontFamily: CLASH, fontSize: 28, color: C.black, letterSpacing: -1, lineHeight: 30 },
  headerSub: { fontFamily: INTER, fontSize: 12, color: C.muted, marginTop: 4 },
  badge: { backgroundColor: C.black, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTxt: { fontFamily: CLASH_MD, fontSize: 11, color: C.white },
  scroll: { paddingHorizontal: 22, paddingBottom: 20, gap: 16 },
  filterList: { gap: 8, paddingBottom: 4 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  filterPillOn: { backgroundColor: C.black, borderColor: C.black },
  filterTxt: { fontFamily: CLASH_MD, fontSize: 11, color: C.muted },
  filterTxtOn: { color: C.white },
  msgList: { gap: 8 },
  card: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontFamily: CLASH, fontSize: 15 },
  name: { flex: 1, fontFamily: CLASH_MD, fontSize: 14, color: C.black, letterSpacing: -0.2 },
  date: { fontFamily: INTER, fontSize: 10, color: C.muted },
  row2: { flexDirection: 'row', gap: 6 },
  tagChan: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: C.cream },
  tagChanTxt: { fontFamily: INTER_MD, fontSize: 10, color: C.muted },
  tagRel: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: C.cream2 },
  tagRelTxt: { fontFamily: INTER_MD, fontSize: 10, color: C.black },
  preview: { fontFamily: INTER, fontSize: 12, color: C.muted, lineHeight: 18 },
  row4: { flexDirection: 'row', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusTxt: { fontFamily: INTER_MD, fontSize: 10 },
  statsCard: { backgroundColor: C.black, borderRadius: 16, padding: 18, gap: 12 },
  statsTitle: { fontFamily: CLASH_MD, fontSize: 14, color: C.white, letterSpacing: -0.2 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statItem: { fontFamily: INTER_MD, fontSize: 13 },
  statsSep: { height: 1, backgroundColor: '#333' },
  statsBot: { fontFamily: INTER, fontSize: 11, color: C.muted, marginTop: 2 },
});

// ─── PROSPECTS CRM ─────────────────────────────────────────────────────────────
const pc = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  headerTitle: { fontFamily: CLASH, fontSize: 28, color: C.black, letterSpacing: -1, lineHeight: 30 },
  headerSub: { fontFamily: INTER, fontSize: 12, color: C.muted, marginTop: 4 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  addIcon: { fontFamily: INTER_MD, fontSize: 24, color: C.white, lineHeight: 28 },
  scroll: { paddingHorizontal: 22, paddingBottom: 20, gap: 16 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  searchIcon: { fontSize: 16, marginRight: 8, color: C.muted },
  searchInput: { flex: 1, fontFamily: INTER, fontSize: 13, color: C.black, height: '100%', outlineStyle: 'none' } as any,
  filterList: { gap: 8, paddingBottom: 4 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  filterPillOn: { backgroundColor: C.black, borderColor: C.black },
  filterTxt: { fontFamily: CLASH_MD, fontSize: 11, color: C.muted },
  filterTxtOn: { color: C.white },
  list: { gap: 8 },
  card: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, paddingBottom: 0, overflow: 'hidden', gap: 10 },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontFamily: CLASH, fontSize: 18, letterSpacing: -0.5 },
  name: { flex: 1, fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.2 },
  tagSec: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: C.cream2 },
  tagSecTxt: { fontFamily: INTER_MD, fontSize: 10, color: C.muted },
  row2: { flexDirection: 'row', alignItems: 'center' },
  contactName: { fontFamily: INTER, fontSize: 12, color: C.muted },
  dot: { fontFamily: INTER, fontSize: 12, color: C.muted2 },
  role: { fontFamily: INTER, fontSize: 11, color: C.muted },
  row3: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 },
  lastInt: { fontFamily: INTER, fontSize: 11, color: C.muted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusTxt: { fontFamily: INTER_MD, fontSize: 10 },
  progTrack: { height: 3, backgroundColor: 'transparent', width: '100%', marginHorizontal: -16 },
  progFill: { height: 3 },
  pipeCard: { backgroundColor: C.black, borderRadius: 16, padding: 18, gap: 16 },
  pipeTitle: { fontFamily: CLASH_MD, fontSize: 14, color: C.white, letterSpacing: -0.2 },
  pipeCols: { flexDirection: 'row', justifyContent: 'space-between' },
  pipeCol: { alignItems: 'center', gap: 4 },
  pipeCount: { fontFamily: CLASH_MD, fontSize: 18 },
  pipeLbl: { fontFamily: INTER, fontSize: 10, color: C.muted },
  pipeBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  pipeSeg: { height: '100%' },
});

// ─── PROFILE ───────────────────────────────────────────────────────────────────
const pr = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  headerTitle: { fontFamily: CLASH, fontSize: 28, color: C.black, letterSpacing: -1, lineHeight: 30 },
  headerSub: { fontFamily: INTER, fontSize: 12, color: C.muted, marginTop: 4 },
  scroll: { paddingHorizontal: 22, paddingBottom: 20, gap: 24 },
  idCard: { backgroundColor: C.black, borderRadius: 20, padding: 24, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarTxt: { fontFamily: CLASH, fontSize: 28, color: C.white },
  idName: { fontFamily: CLASH, fontSize: 20, color: C.white, letterSpacing: -0.5, marginBottom: 4 },
  idRole: { fontFamily: INTER, fontSize: 13, color: C.muted },
  idSep: { height: 1, backgroundColor: '#333', width: '100%', marginVertical: 20 },
  idStats: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  idStat: { alignItems: 'center', gap: 4 },
  idStatVal: { fontFamily: CLASH, fontSize: 18, color: C.white },
  idStatLbl: { fontFamily: INTER, fontSize: 9, color: C.muted },
  secTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, marginBottom: 12 },
  connList: { gap: 8 },
  connCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  cxIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cxIconTxt: { fontFamily: CLASH_MD, fontSize: 14 },
  cxInfo: { flex: 1 },
  cxName: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2 },
  cxStatOn: { fontFamily: INTER, fontSize: 11, color: C.green, marginTop: 2 },
  cxStatOff: { fontFamily: INTER, fontSize: 11, color: C.muted, marginTop: 2 },
  tTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 2 },
  tTrackOn: { backgroundColor: C.blue },
  tTrackOff: { backgroundColor: C.cream2 },
  tThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.white },
  tThumbOn: { alignSelf: 'flex-end' },
  tThumbOff: { alignSelf: 'flex-start' },
  prefCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, gap: 18 },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prefInfo: { flex: 1, paddingRight: 16 },
  prefName: { fontFamily: CLASH_MD, fontSize: 13, color: C.black, letterSpacing: -0.2 },
  prefSub: { fontFamily: INTER, fontSize: 10, color: C.muted },
  agCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  agHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agLogo: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  agLogoTxt: { fontFamily: CLASH_MD, fontSize: 18, color: C.white },
  agName: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, letterSpacing: -0.2 },
  agSub: { fontFamily: INTER, fontSize: 12, color: C.muted, marginTop: 2 },
  agSep: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  agTags: { flexDirection: 'row', gap: 8 },
  agTag: { backgroundColor: C.cream2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  agTagTxt: { fontFamily: INTER_MD, fontSize: 10, color: C.black },
  setList: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.cream2 },
  setTxt: { fontFamily: INTER, fontSize: 13, color: C.black },
  setTxtRed: { fontFamily: INTER, fontSize: 13, color: '#DC2626' },
  setArr: { fontFamily: INTER, fontSize: 16, color: C.muted2, marginBottom: 2 },
  setVal: { fontFamily: INTER, fontSize: 13, color: C.muted },
});

// ─── PROSPECT DETAIL ───────────────────────────────────────────────────────────
const pd = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  headerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  headerBack: { fontFamily: INTER, fontSize: 18, color: C.black },
  headerTitle: { fontFamily: CLASH_MD, fontSize: 18, color: C.black },
  scroll: { paddingHorizontal: 22, paddingBottom: 100, gap: 24 },
  idCard: { backgroundColor: C.black, borderRadius: 20, padding: 24, alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarTxt: { fontFamily: CLASH, fontSize: 24, color: C.black },
  idName: { fontFamily: CLASH, fontSize: 20, color: C.white, letterSpacing: -0.5, marginBottom: 4 },
  idRole: { fontFamily: INTER, fontSize: 13, color: C.muted, textAlign: 'center' },
  idSep: { height: 1, backgroundColor: '#333', width: '100%', marginVertical: 20 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  actBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  actTxt: { fontFamily: CLASH_MD, fontSize: 18, color: C.black },
  secTitle: { fontFamily: CLASH_MD, fontSize: 15, color: C.black, marginBottom: 12 },
  histCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  histRow: { paddingVertical: 12 },
  histSep: { borderBottomWidth: 1, borderBottomColor: C.cream2 },
  histTop: { fontFamily: INTER_MD, fontSize: 13, color: C.black, marginBottom: 2 },
  histBot: { fontFamily: INTER, fontSize: 11, color: C.muted },
  pipeCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  pipeTxt: { fontFamily: CLASH_MD, fontSize: 15, color: C.black },
  msgCard: { backgroundColor: C.blueBg, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BCCFFF' },
  msgTxt: { fontFamily: INTER, fontSize: 13, color: C.black, lineHeight: 20 },
});
