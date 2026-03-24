import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
  Animated,
  StatusBar,
  RefreshControl,
  Easing,
  Platform,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight, scoreStyle } from '../../constants/tokens';
import { supabase } from '../../lib/supabase';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlan } from '../../hooks/usePlan';
import PaywallScreen from '../paywall';

const { width: SCREEN_W } = Dimensions.get('window');
// OpenAI Whisper limit is exactly 25MB.
// 25MB raw data = (25 * 1024 * 1024 * 4 / 3) = ~34,952,533 chars.
// We set to 35M to be safe for files around the limit.
const MAX_BASE64_CHUNK = 35 * 1024 * 1024; 


function getTranscriptionMessage(durationMs: number | null, fileSizeEstimate?: number): string {
  let seconds = 0;
  if (durationMs) {
    seconds = durationMs / 1000;
  } else if (fileSizeEstimate) {
    // ~1 MB par minute pour du M4A 128kbps -> 1024*1024 bytes = 60s
    // 1 byte = 60 / (1024*1024) seconds
    seconds = fileSizeEstimate * (60 / (1024 * 1024));
  }

  if (seconds < 5 * 60) {
    return 'Transcription en cours...';
  } else if (seconds < 15 * 60) {
    return 'Transcription en cours... (peut prendre 30 secondes)';
  } else {
    return 'Longue réunion détectée — transcription en plusieurs passes...';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  created_at: string;
  prospect_nom: string;
  prospect_secteur: string;
  duree_audio: string;
  transcription: string;
  score_global: number;
  indicateurs: Record<string, number>;
  besoins: string[];
  prestations: string[];
  plan_action: string[];
  audio_url?: string;
  propositions_techniques?: Array<{ emoji: string; titre: string; description: string; budget_estime: string }>;
  email_suivi?: { objet: string; corps: string };
  opportunite_id?: string | null;
  // Nouveaux champs IA avancés
  resume_tweet?: string;
  ton_prospect?: { valeur: string; evolution: string; evolution_detail: string; phrases_revelatrices: string[] };
  objections_verbatim?: Array<{ phrase: string; type: string; severite: string }>;
  signaux_achat?: string[];
  questions_prospect?: string[];
  maturite_decisionnelle?: { niveau: string; confiance: number; justification: string };
  coherence_discours?: { score: number; contradictions: Array<{ enonce_1: string; enonce_2: string; interpretation: string }> };
  prochaine_action_prioritaire?: { action: string; date_suggeree?: string | null; raison: string };
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

// ─── Mini Audio Player ────────────────────────────────────────────────────────

function MiniAudioPlayer({ uri }: { uri: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);

  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  const togglePlayback = async () => {
    if (!sound) {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri }, { shouldPlay: true },
        (status: any) => {
          if (status.isLoaded) {
            setPlaying(status.isPlaying);
            setPosition(status.positionMillis);
            setDuration(status.durationMillis || 1);
            if (status.didJustFinish) {
              setPlaying(false);
              newSound.setPositionAsync(0);
            }
          }
        }
      );
      setSound(newSound);
    } else {
      if (playing) await sound.pauseAsync();
      else await sound.playAsync();
    }
  };

  const format = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <View style={{ backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md, flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={togglePlayback}>
        <Ionicons name={playing ? "pause-circle" : "play-circle"} size={28} color={Colors.accent} />
      </TouchableOpacity>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: Spacing.md }}>
        <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary }}>{format(position)} / {format(duration)}</Text>
      </View>
    </View>
  );
}

// ─── Draft Email View ────────────────────────────────────────────────────────

function DraftEmailView({ email }: { email: { objet?: string, corps?: string } }) {
  const [copied, setCopied] = useState(false);
  const [senderStr, setSenderStr] = useState("Esteban — Scénographie France");

  useEffect(() => {
    (async () => {
      try {
        const name = await AsyncStorage.getItem('eloquence_fullname');
        if (name) setSenderStr(name);
      } catch (e) {}
    })();
  }, []);

  const handleCopy = async () => {
    const textToCopy = `Objet : ${email.objet || ''}\n\n${email.corps || ''}`;
    await Clipboard.setStringAsync(textToCopy);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={{ backgroundColor: Colors.elevated, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: Colors.surface, padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: Colors.border }}>
        <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary }}>
          ✉ Nouveau Message
        </Text>
        <TouchableOpacity onPress={handleCopy} style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
          <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: copied ? Colors.success : Colors.accent }}>
            {copied ? '✓ Copié' : 'Copier ⧉'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Champs De / Objet */}
      <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 0.5, borderBottomColor: Colors.border, flexDirection: 'row' }}>
        <Text style={{ fontSize: FontSize.sm, color: Colors.textTertiary, width: 50 }}>De :</Text>
        <Text style={{ fontSize: FontSize.sm, color: Colors.textPrimary, flex: 1 }}>{senderStr}</Text>
      </View>
      <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 0.5, borderBottomColor: Colors.border, flexDirection: 'row' }}>
        <Text style={{ fontSize: FontSize.sm, color: Colors.textTertiary, width: 50 }}>Objet :</Text>
        <Text style={{ fontSize: FontSize.sm, color: Colors.textPrimary, flex: 1 }}>{email.objet}</Text>
      </View>
      {/* Corps */}
      <View style={{ padding: Spacing.lg }}>
        <Text style={{ fontSize: FontSize.base, color: Colors.textPrimary, lineHeight: 22 }}>
          {email.corps}
        </Text>
      </View>
    </View>
  );
}

// ─── Transcription Accordion ──────────────────────────────────────────────────

function TranscriptionAccordion({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.spring(rotateAnim, { toValue: next ? 1 : 0, useNativeDriver: true }).start();
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={{ marginTop: Spacing.sm }}>
      <TouchableOpacity 
        activeOpacity={0.8} 
        onPress={toggle} 
        style={{ 
          backgroundColor: Colors.surface, 
          padding: Spacing.md, 
          borderTopLeftRadius: Radius.md,
          borderTopRightRadius: Radius.md,
          borderBottomLeftRadius: expanded ? 0 : Radius.md,
          borderBottomRightRadius: expanded ? 0 : Radius.md,
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
        <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary }}>
          Transcription complète
        </Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={20} color={Colors.textTertiary} />
        </Animated.View>
      </TouchableOpacity>
      {expanded && (
        <View style={{ backgroundColor: Colors.elevated, padding: Spacing.lg, borderBottomLeftRadius: Radius.md, borderBottomRightRadius: Radius.md }}>
          <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 }}>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Audio Visualizer ─────────────────────────────────────────────────────────

function AudioVisualizer({ isRecording }: { isRecording: boolean }) {
  const anims = useRef([...Array(5)].map(() => new Animated.Value(0.1))).current;

  useEffect(() => {
    let active = isRecording;
    const animateBar = (anim: Animated.Value) => {
      if (!active) return;
      Animated.sequence([
        Animated.timing(anim, { toValue: Math.random() * 0.8 + 0.2, duration: 200 + Math.random() * 150, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.1, duration: 200 + Math.random() * 150, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && active) animateBar(anim);
      });
    };

    if (active) {
      anims.forEach((anim, i) => {
        setTimeout(() => { if (active) animateBar(anim) }, i * 80);
      });
    } else {
      anims.forEach(anim => {
        anim.stopAnimation();
        Animated.spring(anim, { toValue: 0.1, useNativeDriver: true }).start();
      });
    }

    return () => { active = false; anims.forEach(anim => anim.stopAnimation()); };
  }, [isRecording]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 24, paddingHorizontal: 4 }}>
      {anims.map((anim, i) => (
        <Animated.View key={i} style={[
          { width: 3, height: 24, borderRadius: 2, backgroundColor: isRecording ? Colors.danger : Colors.textSecondary },
          { transform: [{ scaleY: anim }] }
        ]} />
      ))}
    </View>
  );
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

// ─── Meeting Card ─────────────────────────────────────────────────────────────

function MeetingCard({ m, onPress, anim }: { m: Meeting; onPress: () => void; anim?: Animated.Value }) {
  const { scale, onIn, onOut } = useScalePress();
  const sc = scoreStyle(m.score_global);
  const initials = (m.prospect_nom || '??').substring(0, 2).toUpperCase();

  const opacity = anim || 1;
  const translateY = anim ? anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) : 0;

  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }], opacity }}>
      <Pressable style={styles.meetingCard} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
        <View style={styles.cardRow}>
          <View style={[styles.avatar, { backgroundColor: sc.bg }]}>
            <Text style={[styles.avatarText, { color: sc.color }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.meetingTitle}>{m.prospect_nom || 'Réunion sans nom'}</Text>
            <Text style={styles.meetingSub}>
              {m.prospect_secteur || 'Secteur inconnu'} · {new Date(m.created_at).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          <View style={[styles.scoreBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.scoreText, { color: sc.color }]}>{m.score_global}</Text>
          </View>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {m.transcription || 'Pas de transcription disponible.'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MeetingsScreen() {
  const [meetings, setMeetings]     = useState<Meeting[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [showRecorder, setShowRecorder]     = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [processingState, setProcessingState] =
    useState<'idle' | 'recording' | 'importing' | 'transcribing' | 'analyzing' | 'saving'>('idle');
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [transcriptionMessage, setTranscriptionMessage] = useState<string>('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<'analyse_limit' | 'manual'>('manual');
  const [processingDuration, setProcessingDuration] = useState<number | null>(null);
  const [processingSize, setProcessingSize] = useState<number>(0);

  const { plan, canAnalyse, getRemainingAnalyses, incrementAnalyses, loading: planLoading } = usePlan();

  const { isRecording, duration, startRecording, stopRecording, importAudio } = useAudioRecorder();

  const anim0 = useFadeIn(0);
  const anim1 = useFadeIn(60);

  // Stagger animation state
  const listAnimValues = useRef<Animated.Value[]>([]).current;

  // Run stagger animation when meetings load
  useEffect(() => {
    if (!loading && meetings.length > 0) {
      meetings.forEach((_, i) => {
        if (!listAnimValues[i]) {
          listAnimValues[i] = new Animated.Value(0);
        } else {
          listAnimValues[i].setValue(0);
        }
      });
      const anims = meetings.map((_, i) =>
        Animated.timing(listAnimValues[i], {
          toValue: 1,
          duration: 300,
          delay: i * 50,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        })
      );
      Animated.parallel(anims).start();
    }
  }, [loading, meetings]);

  const loadMeetings = async () => {
    try {
      setLoadError(null);
      const { data, error } = await supabase
        .from('reunions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMeetings(data || []);
    } catch (err: any) {
      setLoadError(err.message ?? 'Erreur lors du chargement');
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMeetings();
      setLoading(false);
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMeetings();
    setRefreshing(false);
  };

  async function sendChunkToWhisper(
    audioBase64: string,
    chunkIndex: number,
    totalChunks: number
  ): Promise<string> {
    console.log(`[sendChunk] Chunk ${chunkIndex + 1}/${totalChunks}`);

    // Conversion base64 -> Blob (User's provided logic)
    const byteCharacters = atob(audioBase64);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteNumbers], { type: 'audio/m4a' });

    const formData = new FormData();
    // @ts-ignore - blob is fine for fetch in React Native
    formData.append('file', blob, `chunk_${chunkIndex}.m4a`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'fr');

    const allKeys = await AsyncStorage.getAllKeys();
    console.log('[AsyncStorage] All keys:', allKeys);

    let openaiKey = null;
    const settingsRaw = await AsyncStorage.getItem('eloquence:settings:v1');
    if (settingsRaw) {
      try {
        const settings = JSON.parse(settingsRaw);
        openaiKey = settings.openaiKey;
      } catch (err) {
        console.error('[sendChunk] Settings parse error:', err);
      }
    }

    if (!openaiKey) {
      throw new Error('Clé OpenAI manquante — configurez-la dans Paramètres');
    }

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`[sendChunk] OK: ${result.text?.length} chars`);
    return result.text;
  }

  const processAudio = async (uri: string, audioDuration: number | null) => {
    setProcessingError(null);
    try {
      setProcessingState('transcribing');
      setProcessingDuration(audioDuration);
      
      // 1. Lire le fichier localement
      let base64 = '';
      let fileSize = 0;

      if (Platform.OS === 'web') {
        setTranscriptionMessage('Lecture du fichier (Web)...');
        const response = await fetch(uri);
        const blob = await response.blob();
        fileSize = blob.size;
        setProcessingSize(fileSize);
        
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // OpenAI attend du base64 pur, on enlève le préfixe data:...;base64,
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists) {
          fileSize = fileInfo.size;
          setProcessingSize(fileSize);
        }

        setTranscriptionMessage('Lecture du fichier...');
        base64 = await FileSystem.readAsStringAsync(uri, { 
          encoding: FileSystem.EncodingType.Base64 
        });
      }

      // 2. Découpage en morceaux (OpenAI limite à 25MB, on prend 2MB de base64 pour être sûr)
      const totalChars = base64.length;
      const chunks: string[] = [];
      for (let i = 0; i < totalChars; i += MAX_BASE64_CHUNK) {
        chunks.push(base64.substring(i, i + MAX_BASE64_CHUNK));
      }

      setTranscriptionMessage(getTranscriptionMessage(audioDuration, fileSize));
      
      const results: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setTranscriptionMessage(`Transcription chunk ${i + 1}/${chunks.length}...`);
        const text = await sendChunkToWhisper(chunks[i], i, chunks.length);
        results.push(text);
      }
      
      const transcription = results.join(' ').trim();
      if (!transcription) throw new Error('La transcription est vide.');

      // 3. Analyse GPT-4o (Toujours via Edge Function car elle est rapide et n'a pas besoin de ffmpeg)
      setTranscriptionMessage('Analyse en cours...');
      setProcessingState('analyzing');
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyse-reunion', {
        body: { transcription }
      });
      if (analysisError) throw new Error((analysisError as any).message);
      
      const analysisResult = analysisData;
      const analysis = analysisResult.analysis;
      const opportunite_id = analysisResult.opportunite_id || null;
      if (!analysis) throw new Error('Analyse vide reçue');

      setProcessingState('saving');
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Supabase] Authenticated User ID:', user?.id);
      
      const { data: savedData, error: saveError } = await supabase
        .from('reunions')
        .insert([{
          prospect_nom:                   analysis.prospect_nom,
          prospect_secteur:               analysis.prospect_secteur,
          duree_audio:                    audioDuration ? `${Math.floor(audioDuration / 1000)}s` : 'inconnu',
          transcription,
          score_global:                   analysis.score_global,
          indicateurs:                    analysis.indicateurs,
          besoins:                        analysis.besoins_detectes,
          prestations:                    analysis.prestations_recommandees,
          plan_action:                    analysis.plan_action,
          propositions_techniques:        analysis.propositions_techniques,
          email_suivi:                    analysis.email_suivi,
          resume_tweet:                   analysis.resume_tweet,
          ton_prospect:                   analysis.ton_prospect,
          objections_verbatim:            analysis.objections_verbatim,
          signaux_achat:                  analysis.signaux_achat,
          questions_prospect:             analysis.questions_prospect,
          maturite_decisionnelle:         analysis.maturite_decisionnelle,
          coherence_discours:             analysis.coherence_discours,
          prochaine_action_prioritaire:   analysis.prochaine_action_prioritaire,
          opportunite_id,
          user_id:                        user?.id,
        }])
        .select()
        .single();

      if (saveError) {
        console.error('[Supabase] Insert error details:', saveError);
        const msg = saveError.message;
        if (msg.includes('schema cache')) {
          throw new Error('Erreur de cache Supabase : Veuillez rafraîchir le schéma PostgREST dans votre dashboard (SQL: NOTIFY pgrst, \'reload schema\';)');
        }
        throw new Error(`Erreur lors de la sauvegarde : ${msg}`);
      }

      // Notification planning...
      if (analysis.prochaine_action_prioritaire?.date_suggeree && savedData?.id) {
        try {
          const actionDate = new Date(analysis.prochaine_action_prioritaire.date_suggeree);
          const now = new Date();
          const diffMs = actionDate.getTime() - now.getTime();
          if (diffMs > 0 && diffMs <= 30 * 24 * 60 * 60 * 1000) {
            await supabase.functions.invoke('schedule-notification', {
              body: {
                title: `Relance — ${analysis.prospect_nom}`,
                body:  analysis.prochaine_action_prioritaire.action,
                scheduled_for: analysis.prochaine_action_prioritaire.date_suggeree,
                reunion_id: savedData.id,
              }
            });
          }
        } catch (notifErr) { console.warn('Notification skip', notifErr); }
      }

      await incrementAnalyses();
      setMeetings(prev => [savedData, ...prev]);
      setSelectedMeeting(savedData);
      setShowRecorder(false);
    } catch (err: any) {
      console.error('[processAudio] error:', err);
      setProcessingError(err.message ?? 'Erreur lors du traitement');
    } finally {
      setProcessingState('idle');
      setTranscriptionMessage('');
    }
  };

  const handleStartRecording = async () => {
    if (!canAnalyse()) {
      setPaywallTrigger('analyse_limit');
      setShowPaywall(true);
      return;
    }
    setProcessingState('recording');
    setProcessingError(null);
    await startRecording();
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (!result) {
      setProcessingState('idle');
      setProcessingError('Enregistrement échoué ou trop court.');
      return;
    }
    await processAudio(result.uri, result.duration);
  };

  const handleImport = async () => {
    if (!canAnalyse()) {
      setPaywallTrigger('analyse_limit');
      setShowPaywall(true);
      return;
    }
    setProcessingError(null);
    setProcessingState('importing');
    const result = await importAudio();
    if (!result) {
      setProcessingState('idle');
      return;
    }

    await processAudio(result.uri, null);
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / (1000 * 60)) % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isProcessing = processingState !== 'idle' && processingState !== 'recording';

  const handleShare = async () => {
    if (!selectedMeeting) return;
    const text = `Compte rendu : ${selectedMeeting.prospect_nom}\nScore: ${selectedMeeting.score_global}\n\nBesoins détectés :\n${(selectedMeeting.besoins || []).map(b => `• ${b}`).join('\n')}\n\nPlan d'action :\n${(selectedMeeting.plan_action || []).map((step, i) => `${i + 1}. ${step}`).join('\n')}\n\nEmail de suivi :\nObjet : ${selectedMeeting.email_suivi?.objet || ''}\n${selectedMeeting.email_suivi?.corps || ''}`;
    try {
      if (await Sharing.isAvailableAsync()) {
        // @ts-ignore
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
        const fileUri = cacheDir + 'Compte_Rendu.txt';
        await FileSystem.writeAsStringAsync(fileUri, text);
        await Sharing.shareAsync(fileUri, { UTI: 'public.plain-text', dialogTitle: 'Partager le compte rendu' });
      }
    } catch (e) { console.error('Erreur partage', e); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      {/* Header */}
      <Animated.View style={[styles.header, anim0]}>
        <View>
          <Text style={styles.headerTitle}>Réunions</Text>
          <Text style={styles.headerSub}>Intelligence conversationnelle</Text>
          {plan !== 'team' && !planLoading && (
            <View style={styles.limitBadge}>
              <Text style={styles.limitText}>
                {getRemainingAnalyses()} {getRemainingAnalyses() > 1 ? 'analyses restantes' : 'analyse restante'} ce mois
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleImport}>
            <Ionicons name="document-attach-outline" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerBtn, { backgroundColor: Colors.accent, borderColor: Colors.accent }]} 
            onPress={() => { 
              if (canAnalyse()) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                setShowRecorder(true); 
              } else {
                setPaywallTrigger('analyse_limit');
                setShowPaywall(true);
              }
            }}
          >
            <Ionicons name="add" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* List */}
      <Animated.View style={[{ flex: 1 }, anim1]}>
        {/* Error state */}
        {loadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTxt}>⚠️ {loadError}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); loadMeetings().then(() => setLoading(false)); }}>
              <Text style={styles.retryTxt}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingArea}>
            {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
          </View>
        ) : meetings.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="mic-outline" size={32} color={Colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>Aucune réunion enregistrée</Text>
            <Text style={styles.emptySub}>Analysez vos premières réunions en audio</Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowRecorder(true); }}>
              <Text style={styles.ctaBtnTxt}>Enregistrer une réunion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          >
            {meetings.map((m, i) => (
              <MeetingCard key={m.id} m={m} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMeeting(m); }} anim={listAnimValues[i]} />
            ))}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </Animated.View>

      {/* Recorder Bottom Sheet */}
      <Modal visible={showRecorder} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Nouvelle réunion</Text>
              <TouchableOpacity
                onPress={() => { if (!isRecording && !isProcessing) setShowRecorder(false); }}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.recorderBody}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <AudioVisualizer isRecording={isRecording} />
                <Text style={styles.timer}>{formatDuration(duration)}</Text>
                <View style={{ width: 8 }} />
              </View>

              <View style={styles.visualizer}>
                {isRecording && <ActivityIndicator color={Colors.accent} size="large" />}
              </View>

              {/* Processing state */}
              {isProcessing && (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color={Colors.accent} />
                  <Text style={styles.processingTxt}>
                    {processingState === 'importing'     && 'Importation du fichier...'}
                    {processingState === 'transcribing'  && (
                      <View style={{ alignItems: 'center', gap: 12 }}>
                        <ActivityIndicator size="large" color={Colors.accent} />
                        <Text style={{
                          fontSize: 13,
                          fontFamily: 'Outfit_400Regular', 
                          color: Colors.textSecondary,
                          textAlign: 'center',
                        }}>
                          {transcriptionMessage || getTranscriptionMessage(
                            processingDuration,
                            processingSize
                          )}
                        </Text>
                      </View>
                    )}
                    {processingState === 'analyzing'     && 'Analyse GPT-4o en cours...'}
                    {processingState === 'saving'        && 'Sauvegarde...'}
                  </Text>
                </View>
              )}

              {/* Error */}
              {processingError && !isProcessing && (
                <View style={styles.processingError}>
                  <Text style={styles.processingErrorTxt}>⚠️ {processingError}</Text>
                </View>
              )}

              {/* Record button */}
              <TouchableOpacity
                style={[
                  styles.recordBtn,
                  isRecording ? styles.recordBtnStop : styles.recordBtnStart,
                  isProcessing && { opacity: 0.4 },
                ]}
                onPress={isRecording ? handleStopRecording : handleStartRecording}
                disabled={isProcessing}
              >
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.recordHint}>
                {isRecording ? 'Appuyez pour terminer' : "Appuyez pour démarrer l'enregistrement"}
              </Text>

              {/* Import button */}
              {!isRecording && !isProcessing && (
                <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                  <Ionicons name="document-attach-outline" size={16} color={Colors.accent} />
                  <Text style={styles.importBtnTxt}>Importer un fichier audio</Text>
                </TouchableOpacity>
              )}
              {!isRecording && !isProcessing && (
                <Text style={{
                  fontSize: 11,
                  fontFamily: 'Outfit_400Regular',
                  color: Colors.textTertiary,
                  textAlign: 'center',
                  marginTop: -10, // Pull it closer to the import button
                }}>
                  Fichiers jusqu'à 500 MB · Réunions jusqu'à 3h
                </Text>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!selectedMeeting} animationType="slide">
        <SafeAreaView style={styles.detailContainer}>
          <StatusBar barStyle="light-content" backgroundColor={Colors.base} />
          <View style={[styles.detailNavBar, { justifyContent: 'space-between' }]}>
            <TouchableOpacity onPress={() => setSelectedMeeting(null)}>
              <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare}>
              <Ionicons name="share-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedMeeting && (
            <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {/* ID Card / Header Immersif */}
              <View style={styles.detailIdCard}>
                <View style={[styles.detailIdRow, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1, paddingRight: Spacing.md }}>
                    <Text style={[styles.detailName, { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary }]}>{selectedMeeting.prospect_nom}</Text>
                    <Text style={[styles.detailMeta, { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs }]}>
                      {selectedMeeting.prospect_secteur} · {new Date(selectedMeeting.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} · {selectedMeeting.duree_audio}
                    </Text>
                  </View>
                  {(() => {
                    const scVal = selectedMeeting.score_global;
                    const scColors = scVal >= 80 ? { bg: Colors.successMuted, txt: Colors.success } :
                                     scVal >= 60 ? { bg: Colors.accentMuted, txt: Colors.accent } :
                                                   { bg: Colors.warningMuted, txt: Colors.warning };
                    return (
                      <View style={{ alignItems: 'center' }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: scColors.bg, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: scColors.txt }}>{scVal}</Text>
                        </View>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 }}>Score</Text>
                      </View>
                    );
                  })()}
                </View>
                
                {selectedMeeting.audio_url && (
                  <View style={{ marginTop: Spacing.xl }}>
                    <MiniAudioPlayer uri={selectedMeeting.audio_url} />
                  </View>
                )}
              </View>

              {/* ─ Résumé tweet ─ */}
              {selectedMeeting.resume_tweet && (
                <View style={{ backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
                  <Ionicons name="flash-outline" size={16} color={Colors.accent} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, textTransform: 'uppercase', marginBottom: 4 }}>RÉSUMÉ</Text>
                    <Text style={{ fontSize: FontSize.base, color: Colors.textPrimary, fontWeight: FontWeight.medium, lineHeight: 20 }}>{selectedMeeting.resume_tweet}</Text>
                  </View>
                </View>
              )}

              {/* ─ Prochaine action prioritaire ─ */}
              {selectedMeeting.prochaine_action_prioritaire?.action && (
                <View style={{ borderWidth: 1, borderColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg, backgroundColor: Colors.surface }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                    <Ionicons name="alarm-outline" size={16} color={Colors.accent} style={{ marginRight: Spacing.sm }} />
                    <Text style={{ fontSize: FontSize.xs, color: Colors.accent, fontWeight: FontWeight.semibold, textTransform: 'uppercase', flex: 1 }}>PROCHAINE ACTION</Text>
                    <View style={{ backgroundColor: Colors.accentMuted, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill }}>
                      <Text style={{ fontSize: FontSize.xs, color: Colors.accent }}>🔔 Rappel planifié</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: 4 }}>
                    {selectedMeeting.prochaine_action_prioritaire.action}
                  </Text>
                  {selectedMeeting.prochaine_action_prioritaire.date_suggeree && (
                    <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 4 }}>
                      {new Date(selectedMeeting.prochaine_action_prioritaire.date_suggeree).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Text>
                  )}
                  {selectedMeeting.prochaine_action_prioritaire.raison && (
                    <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' }}>{selectedMeeting.prochaine_action_prioritaire.raison}</Text>
                  )}
                </View>
              )}

              {/* ─ Ton + Maturité ─ */}
              {(selectedMeeting.ton_prospect || selectedMeeting.maturite_decisionnelle) && (
                <View style={{ flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg }}>
                  {selectedMeeting.ton_prospect && (() => {
                    const t = selectedMeeting.ton_prospect;
                    const emojiMap: Record<string, string> = { enthousiaste: '😊', réticent: '😐', pressé: '⚡', neutre: '〰️' };
                    return (
                      <View style={{ flex: 1, backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md }}>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, textTransform: 'uppercase', marginBottom: Spacing.sm }}>TON PROSPECT</Text>
                        <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textPrimary }}>{emojiMap[t.valeur] || ''} {t.valeur}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <Ionicons name={t.evolution === 'monte' ? 'trending-up' : t.evolution === 'descend' ? 'trending-down' : 'remove'} size={14} color={t.evolution === 'monte' ? Colors.success : t.evolution === 'descend' ? Colors.danger : Colors.textTertiary} />
                          <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, marginLeft: 4 }}>{t.evolution_detail}</Text>
                        </View>
                      </View>
                    );
                  })()}
                  {selectedMeeting.maturite_decisionnelle && (() => {
                    const m = selectedMeeting.maturite_decisionnelle;
                    const levelColors: Record<string, { bg: string, txt: string }> = {
                      découverte: { bg: Colors.elevated, txt: Colors.textSecondary },
                      comparaison: { bg: Colors.accentMuted, txt: Colors.accent },
                      validation: { bg: Colors.warningMuted, txt: Colors.warning },
                      ready_to_sign: { bg: Colors.successMuted, txt: Colors.success },
                    };
                    const lc = levelColors[m.niveau] || levelColors.découverte;
                    const confVal = m.confiance || 0;
                    return (
                      <View style={{ flex: 1, backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md }}>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, textTransform: 'uppercase', marginBottom: Spacing.sm }}>MATURITÉ</Text>
                        <View style={{ backgroundColor: lc.bg, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start', marginBottom: Spacing.sm }}>
                          <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: lc.txt }}>{m.niveau}</Text>
                        </View>
                        <View style={{ height: 3, backgroundColor: Colors.border, borderRadius: 1.5, overflow: 'hidden' }}>
                          <View style={{ width: `${confVal}%`, height: '100%', backgroundColor: lc.txt, borderRadius: 1.5 }} />
                        </View>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 }}>Confiance : {confVal}%</Text>
                      </View>
                    );
                  })()}
                </View>
              )}

              {/* ─ Signaux d'achat ─ */}
              {(selectedMeeting.signaux_achat || []).length > 0 && (
                <View style={[styles.section, { marginBottom: Spacing.lg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                    <Text style={styles.sectionLabel}>SIGNAUX D'ACHAT</Text>
                    <View style={{ marginLeft: Spacing.sm, backgroundColor: Colors.successMuted, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill }}>
                      <Text style={{ fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold }}>{(selectedMeeting.signaux_achat || []).length}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                    {(selectedMeeting.signaux_achat || []).map((signal: string, i: number) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.successMuted, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs }}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} style={{ marginRight: 4 }} />
                        <Text style={{ fontSize: FontSize.sm, color: Colors.success }}>{signal}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Indicateurs */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ANALYSE DU BESOIN</Text>
                
                {/* Grille d'indicateurs */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg }}>
                  {Object.entries(selectedMeeting.indicateurs || {}).map(([key, val]) => {
                    const numVal = Number(val);
                    const barColor = numVal >= 80 ? Colors.success : numVal >= 60 ? Colors.accent : Colors.warning;
                    return (
                      <View key={key} style={{ width: '47%', backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md }}>
                        <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textTertiary, textTransform: 'uppercase', marginBottom: 4 }}>
                          {key}
                        </Text>
                        <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary }}>
                          {numVal}%
                        </Text>
                        <View style={{ height: 3, backgroundColor: Colors.border, borderRadius: 1.5, marginTop: Spacing.sm, overflow: 'hidden' }}>
                          <View style={{ width: `${numVal}%`, height: '100%', backgroundColor: barColor, borderRadius: 1.5 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Besoins (Pills) */}
                <Text style={[styles.sectionLabel, { marginTop: Spacing.xs }]}>BESOINS DÉTECTÉS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {(selectedMeeting.besoins || []).length === 0 ? (
                    <Text style={{ color: Colors.textSecondary, fontSize: FontSize.sm, fontStyle: 'italic' }}>Aucun besoin détecté</Text>
                  ) : (
                    (selectedMeeting.besoins || []).map((b, i) => (
                      <View key={i} style={{ backgroundColor: Colors.elevated, borderWidth: 0.5, borderColor: Colors.border, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs }}>
                        <Text style={{ fontSize: FontSize.sm, color: Colors.textPrimary }}>{b}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>

              {/* ─ Objections verbatim ─ */}
              <View style={[styles.section, { marginBottom: Spacing.lg }]}>
                <Text style={styles.sectionLabel}>OBJECTIONS</Text>
                {(selectedMeeting.objections_verbatim || []).length === 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm }}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <Text style={{ fontSize: FontSize.sm, color: Colors.success }}>Aucune objection détectée</Text>
                  </View>
                ) : (
                  <View style={{ gap: Spacing.sm }}>
                    {(selectedMeeting.objections_verbatim || []).map((obj, i) => {
                      const typeColors: Record<string, { bg: string; txt: string }> = {
                        budget:     { bg: Colors.warningMuted, txt: Colors.warning },
                        timing:     { bg: Colors.accentMuted,  txt: Colors.accent },
                        concurrent: { bg: Colors.elevated,     txt: Colors.textSecondary },
                        technique:  { bg: Colors.elevated,     txt: Colors.textSecondary },
                        interne:    { bg: Colors.elevated,     txt: Colors.textSecondary },
                        autre:      { bg: Colors.elevated,     txt: Colors.textSecondary },
                      };
                      const sevColors: Record<string, { bg: string; txt: string }> = {
                        bloquante: { bg: Colors.dangerMuted || Colors.warningMuted, txt: Colors.danger || Colors.warning },
                        modérée:   { bg: Colors.warningMuted, txt: Colors.warning },
                        légère:    { bg: Colors.elevated,     txt: Colors.textTertiary },
                      };
                      const tc = typeColors[obj.type]   || typeColors.autre;
                      const sc = sevColors[obj.severite] || sevColors.légère;
                      return (
                        <View key={i} style={{ backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md }}>
                          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                            <View style={{ backgroundColor: tc.bg, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill }}>
                              <Text style={{ fontSize: FontSize.xs, color: tc.txt, fontWeight: FontWeight.semibold }}>{obj.type}</Text>
                            </View>
                            <View style={{ backgroundColor: sc.bg, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill }}>
                              <Text style={{ fontSize: FontSize.xs, color: sc.txt, fontWeight: FontWeight.semibold }}>{obj.severite}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: FontSize.sm, color: Colors.textPrimary, fontStyle: 'italic', lineHeight: 18 }}>« {obj.phrase} »</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* ─ Questions du prospect ─ */}
              {(selectedMeeting.questions_prospect || []).length > 0 && (
                <View style={[styles.section, { marginBottom: Spacing.lg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                    <Ionicons name="help-circle-outline" size={16} color={Colors.textTertiary} />
                    <Text style={styles.sectionLabel}>QUESTIONS POSÉES</Text>
                  </View>
                  {(selectedMeeting.questions_prospect || []).map((q: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', paddingVertical: Spacing.xs }}>
                      <Text style={{ color: Colors.accent, marginRight: Spacing.sm, fontSize: FontSize.base }}>›</Text>
                      <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, lineHeight: 18 }}>{q}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ─ Cohérence du discours ─ */}
              {(selectedMeeting.coherence_discours?.contradictions || []).length > 0 && (
                <View style={[styles.section, { marginBottom: Spacing.lg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                    <Text style={styles.sectionLabel}>COHÉRENCE DU DISCOURS</Text>
                    {selectedMeeting.coherence_discours?.score !== undefined && (() => {
                      const s = selectedMeeting.coherence_discours!.score;
                      const c = s >= 80 ? { bg: Colors.successMuted, txt: Colors.success } : s >= 60 ? { bg: Colors.accentMuted, txt: Colors.accent } : { bg: Colors.warningMuted, txt: Colors.warning };
                      return (
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: c.txt }}>{s}</Text>
                        </View>
                      );
                    })()}
                  </View>
                  <View style={{ gap: Spacing.sm }}>
                    {(selectedMeeting.coherence_discours?.contradictions || []).map((c, i) => (
                      <View key={i} style={{ backgroundColor: Colors.elevated, borderRadius: Radius.md, padding: Spacing.md }}>
                        <Text style={{ fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 18, marginBottom: 4 }}>{c.enonce_1}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                          <View style={{ height: 0.5, flex: 1, backgroundColor: Colors.border }} />
                          <Ionicons name="swap-horizontal" size={14} color={Colors.textTertiary} />
                          <View style={{ height: 0.5, flex: 1, backgroundColor: Colors.border }} />
                        </View>
                        <Text style={{ fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 18, marginBottom: Spacing.sm }}>{c.enonce_2}</Text>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, fontStyle: 'italic' }}>{c.interpretation}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Plan d'action */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>PLAN D'ACTION IA</Text>
                <View style={{ marginTop: Spacing.sm }}>
                  {(selectedMeeting.plan_action || []).map((step, i) => {
                    const isLast = i === (selectedMeeting.plan_action || []).length - 1;
                    return (
                      <View key={i} style={{ flexDirection: 'row' }}>
                        {/* Timeline Column */}
                        <View style={{ alignItems: 'center', width: 28, marginRight: Spacing.md }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                            <Text style={{ color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.bold }}>{i + 1}</Text>
                          </View>
                          {!isLast && (
                            <View style={{ width: 1, flex: 1, backgroundColor: Colors.border, marginVertical: -4, zIndex: 1 }} />
                          )}
                        </View>
                        {/* Content Column */}
                        <View style={{ flex: 1, paddingBottom: isLast ? 0 : Spacing.xl }}>
                          <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textTertiary, textTransform: 'uppercase', marginBottom: 4, marginTop: 4 }}>
                            ÉTAPE {i + 1}
                          </Text>
                          <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.regular, color: Colors.textPrimary, lineHeight: 22 }}>
                            {step}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Propositions */}
              <View style={[styles.section, { marginTop: Spacing.sm }]}>
                <Text style={styles.sectionLabel}>PROPOSITIONS SCÉNOGRAPHIQUES</Text>
                <View style={{ gap: Spacing.md, marginTop: Spacing.sm }}>
                  {(selectedMeeting.propositions_techniques || []).map((p, i) => (
                    <View key={i} style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, padding: Spacing.lg }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                        <Text style={{ fontSize: 32, marginRight: Spacing.md }}>{p.emoji}</Text>
                        <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, flex: 1 }}>{p.titre}</Text>
                      </View>
                      <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md }}>
                        {p.description}
                      </Text>
                      <View style={{ alignSelf: 'flex-end', backgroundColor: Colors.accentMuted, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.pill }}>
                        <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.accent }}>
                          Budget estimé : {p.budget_estime}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Email */}
              {selectedMeeting.email_suivi && (
                <View style={[styles.section, { marginTop: Spacing.sm }]}>
                  <Text style={styles.sectionLabel}>BROUILLON EMAIL</Text>
                  <DraftEmailView email={selectedMeeting.email_suivi} />
                </View>
              )}

              {/* Transcription */}
              <View style={[styles.section, { marginTop: Spacing.sm }]}>
                <TranscriptionAccordion text={selectedMeeting.transcription} />
              </View>

              <View style={{ height: 60 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.base },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xxl, color: Colors.textPrimary, letterSpacing: -0.4 },
  headerSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  headerBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.elevated, borderWidth: 0.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  limitBadge: {
    marginTop: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 0.5,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  limitText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    color: Colors.textTertiary,
  },

  // Error
  errorBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    backgroundColor: Colors.dangerMuted, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.danger,
    padding: Spacing.md,
  },
  errorTxt: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.danger, flex: 1 },
  retryTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.sm, color: Colors.danger, marginLeft: 8 },

  // List
  loadingArea: { padding: Spacing.lg, gap: Spacing.md },
  list: { padding: Spacing.lg, gap: Spacing.md },

  // Empty
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.lg },
  emptyIcon: {
    width: 64, height: 64, borderRadius: Radius.lg,
    backgroundColor: Colors.elevated, borderWidth: 0.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.lg, color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  ctaBtn: { backgroundColor: Colors.accent, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.sm },
  ctaBtnTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary },

  // Meeting card
  meetingCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.sm },
  meetingTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary },
  meetingSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  scoreBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  scoreText: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.base },
  preview: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textTertiary, lineHeight: 19 },

  // Skeleton
  skeletonCard: { height: 90, backgroundColor: Colors.surface, borderRadius: Radius.lg },

  // Recorder modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    borderTopWidth: 0.5, borderColor: Colors.border, padding: Spacing.lg, minHeight: 460,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xl, color: Colors.textPrimary },
  closeBtn: { width: 32, height: 32, borderRadius: Radius.pill, backgroundColor: Colors.elevated, alignItems: 'center', justifyContent: 'center' },
  recorderBody: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: Spacing.lg },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  timer: { fontFamily: 'Outfit_700Bold', fontSize: 48, color: Colors.textPrimary, letterSpacing: -2 },
  visualizer: { width: '100%', height: 64, alignItems: 'center', justifyContent: 'center' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  processingTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.accent },
  processingError: { backgroundColor: Colors.dangerMuted, borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 0.5, borderColor: Colors.danger },
  processingErrorTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center' },
  recordBtn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  recordBtnStart: { backgroundColor: Colors.accent },
  recordBtnStop:  { backgroundColor: Colors.danger },
  recordHint: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  importBtnTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.accent },

  // Detail modal
  detailContainer: { flex: 1, backgroundColor: Colors.base },
  detailNavBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  detailNavTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.lg, color: Colors.textPrimary },
  detailScroll: { padding: Spacing.lg, gap: Spacing.xl },
  detailIdCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.xl, gap: Spacing.xs,
  },
  detailIdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  detailName: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xl, color: Colors.textPrimary, flex: 1 },
  detailScore: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  detailScoreTxt: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.lg },
  detailSector: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.md, color: Colors.accent },
  detailMeta: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textTertiary },

  // Sections
  section: { gap: Spacing.sm },
  sectionLabel: {
    fontFamily: 'Outfit_500Medium', fontSize: FontSize.xs, color: Colors.textTertiary,
    letterSpacing: 0.08, textTransform: 'uppercase', marginBottom: Spacing.xs,
  },
  indicatorsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  indicatorCard: {
    backgroundColor: Colors.elevated, borderRadius: Radius.sm, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.sm, width: (SCREEN_W - Spacing.lg * 2 - 24) / 4, alignItems: 'center',
  },
  indicatorVal: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.lg, color: Colors.textPrimary },
  indicatorKey: {
    fontFamily: 'Outfit_400Regular', fontSize: FontSize.xs, color: Colors.textTertiary,
    textTransform: 'uppercase', marginTop: 2, textAlign: 'center',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { backgroundColor: Colors.elevated, borderWidth: 0.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.pill },
  tagTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.sm, color: Colors.textSecondary },
  actionStep: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.md,
  },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.accentMuted, borderWidth: 0.5, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumTxt: { fontFamily: 'Outfit_700Bold', fontSize: FontSize.xs, color: Colors.accent },
  stepTxt: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  propCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  propRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  propEmoji: { fontSize: 22 },
  propTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.md, color: Colors.textPrimary, flex: 1 },
  propDesc: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  propBudget: { backgroundColor: Colors.elevated, borderRadius: Radius.sm, padding: Spacing.sm },
  propBudgetTxt: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.sm, color: Colors.textPrimary },
  emailCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, padding: Spacing.lg },
  emailSubject: { fontFamily: 'Outfit_600SemiBold', fontSize: FontSize.sm, color: Colors.accent, marginBottom: Spacing.sm },
  divider: { height: 0.5, backgroundColor: Colors.border, marginVertical: Spacing.md },
  emailBody: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  transcription: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.sm, color: Colors.textTertiary, lineHeight: 20, fontStyle: 'italic' },
});
